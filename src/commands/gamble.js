const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { db } = require('../db/index');
const { players } = require('../db/schema');
const { eq } = require('drizzle-orm');

// ── Blackjack state ──────────────────────────────────────────────────────────
const bjGames = new Map();
const BJ_TIMEOUT = 60_000;
const SUITS = ['♠', '♥', '♦', '♣'];
const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

function createDeck() {
  const d = [];
  for (const suit of SUITS)
    for (const rank of RANKS)
      d.push({ rank, suit, value: rank === 'A' ? 11 : ['J','Q','K'].includes(rank) ? 10 : Number(rank) });
  for (let i = d.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [d[i], d[j]] = [d[j], d[i]]; }
  return d;
}

function handValue(hand) {
  let v = hand.reduce((s, c) => s + c.value, 0);
  let aces = hand.filter(c => c.rank === 'A').length;
  while (v > 21 && aces > 0) { v -= 10; aces--; }
  return v;
}

function cardStr(c) { return `\`${c.rank}${c.suit}\``; }
function handStr(hand) { return hand.map(cardStr).join(' '); }

const BJ_MIN = 50;

// ── Module ───────────────────────────────────────────────────────────────────

module.exports = {
  data: new SlashCommandBuilder()
    .setName('gamble')
    .setDescription('Test your luck.')
    .addSubcommand(sub => sub
      .setName('coinflip')
      .setDescription('Flip a coin. Heads = 2x, Tails = loss.')
      .addStringOption(opt => opt.setName('call').setDescription('Heads or Tails').setRequired(true)
        .addChoices({ name: 'Heads', value: 'heads' }, { name: 'Tails', value: 'tails' }))
      .addIntegerOption(opt => opt.setName('amount').setDescription('Yen to bet').setRequired(true).setMinValue(10)))
    .addSubcommand(sub => sub
      .setName('dice')
      .setDescription('Roll a 6-sided die. Correct = 4x your bet, off by 1 = push.')
      .addIntegerOption(opt => opt.setName('number').setDescription('Guess 1–6').setRequired(true).setMinValue(1).setMaxValue(6))
      .addIntegerOption(opt => opt.setName('amount').setDescription('Yen to bet').setRequired(true).setMinValue(10)))
    .addSubcommand(sub => sub
      .setName('blackjack')
      .setDescription(`Play blackjack against the house. Min bet ${BJ_MIN} yen.`)
      .addIntegerOption(opt => opt.setName('amount').setDescription('Yen to bet').setRequired(true).setMinValue(BJ_MIN))),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    if (sub === 'coinflip') return coinflip(interaction);
    if (sub === 'dice') return dice(interaction);
    if (sub === 'blackjack') return blackjack(interaction);
  },
};

async function coinflip(interaction) {
  await interaction.deferReply();
  const player = await getPlayer(interaction);
  if (!player) return;
  const call = interaction.options.getString('call');
  const amount = interaction.options.getInteger('amount');
  if (player.yen < amount) return interaction.editReply(`❌ You only have **${player.yen} 💰**.`);

  const result = Math.random() < 0.5 ? 'heads' : 'tails';
  const win = result === call;
  const payout = win ? amount : -amount;
  const emoji = result === 'heads' ? '🪙' : '🪙';
  const callEmoji = call === 'heads' ? '🪙' : '🪙';

  db.update(players).set({ yen: player.yen + payout })
    .where(eq(players.discord_id, interaction.user.id)).run();

  const embed = new EmbedBuilder()
    .setTitle('🪙 Coinflip')
    .setColor(win ? 0x2ECC71 : 0xE74C3C)
    .setDescription(`${emoji} **${result.toUpperCase()}** — you called ${callEmoji} **${call}**`)
    .addFields({ name: win ? '✅ Won' : '❌ Lost', value: win ? `+${amount} 💰` : `-${amount} 💰`, inline: true });

  await interaction.editReply({ embeds: [embed] });
}

async function dice(interaction) {
  await interaction.deferReply();
  const player = await getPlayer(interaction);
  if (!player) return;
  const guess = interaction.options.getInteger('number');
  const amount = interaction.options.getInteger('amount');
  if (player.yen < amount) return interaction.editReply(`❌ You only have **${player.yen} 💰**.`);

  const roll = Math.floor(Math.random() * 6) + 1;
  let payout;
  if (roll === guess) {
    payout = amount * 4;
  } else if (Math.abs(roll - guess) === 1) {
    payout = amount;
  } else {
    payout = -amount;
  }

  db.update(players).set({ yen: player.yen + payout })
    .where(eq(players.discord_id, interaction.user.id)).run();

  const colors = ['🔴', '🟠', '🟡', '🟢', '🔵', '🟣'];
  const embed = new EmbedBuilder()
    .setTitle('🎲 Dice Roll')
    .setColor(payout > 0 ? 0x2ECC71 : payout === 0 ? 0xF1C40F : 0xE74C3C)
    .setDescription(`Rolled **${roll}** ${colors[roll - 1]} — you guessed **${guess}**`)
    .addFields({ name: payout > 0 ? '✅ Won' : '❌ Lost', value: payout > 0 ? `+${payout} 💰` : payout === 0 ? 'Push (0)' : `${payout} 💰`, inline: true });

  await interaction.editReply({ embeds: [embed] });
}

async function blackjack(interaction) {
  await interaction.deferReply();
  const player = await getPlayer(interaction);
  if (!player) return;
  const amount = interaction.options.getInteger('amount');
  if (player.yen < amount) return interaction.editReply(`❌ You only have **${player.yen} 💰**.`);

  if (bjGames.has(interaction.user.id)) {
    return interaction.editReply('❌ You already have a blackjack game in progress. Finish it first.');
  }

  const deck = createDeck();
  const playerHand = [deck.pop(), deck.pop()];
  const dealerHand = [deck.pop(), deck.pop()];
  const game = { deck, playerHand, dealerHand, amount, resolved: false };

  bjGames.set(interaction.user.id, game);
  setTimeout(() => { if (bjGames.get(interaction.user.id) === game) bjGames.delete(interaction.user.id); }, BJ_TIMEOUT);

  await renderBlackjack(interaction, game, false);
}

async function renderBlackjack(interaction, game, gameOver) {
  const pv = handValue(game.playerHand);
  const dv = handValue(game.dealerHand);
  const embed = new EmbedBuilder()
    .setTitle('🃏 Blackjack')
    .setColor(gameOver ? (pv > dv && pv <= 21 || dv > 21 ? 0x2ECC71 : pv === dv ? 0xF1C40F : 0xE74C3C) : 0x3498DB)
    .addFields(
      { name: `🧑 Your Hand (${pv})`, value: handStr(game.playerHand), inline: false },
      { name: `🏠 Dealer${gameOver ? ` (${dv})` : ' Hand'}`, value: gameOver ? handStr(game.dealerHand) : `${cardStr(game.dealerHand[0])} \`??\``, inline: false },
      { name: '💰 Bet', value: `${game.amount} yen`, inline: true },
    );

  if (gameOver) {
    const pvFinal = handValue(game.playerHand);
    const dvFinal = handValue(game.dealerHand);
    const bust = pvFinal > 21;
    const dealerBust = dvFinal > 21;
    const blackjack = pvFinal === 21 && game.playerHand.length === 2;
    const dealerBJ = dvFinal === 21 && game.dealerHand.length === 2;
    let result, payout;

    if (bust) { result = '💥 Bust!'; payout = -game.amount; }
    else if (blackjack && !dealerBJ) { result = '♠️ Blackjack!'; payout = Math.floor(game.amount * 1.5); }
    else if (dealerBJ && !blackjack) { result = '🏠 Dealer blackjack...'; payout = -game.amount; }
    else if (dealerBust) { result = '💥 Dealer bust!'; payout = game.amount; }
    else if (pvFinal > dvFinal) { result = '✅ You win!'; payout = game.amount; }
    else if (pvFinal === dvFinal) { result = '🤝 Push'; payout = 0; }
    else { result = '❌ Dealer wins'; payout = -game.amount; }

    embed.setDescription(result);
    embed.addFields({ name: 'Result', value: payout >= 0 ? `+${payout} 💰` : `${payout} 💰`, inline: true });

    const fresh = db.select().from(players).where(eq(players.discord_id, interaction.user.id)).get();
    db.update(players).set({ yen: Math.max(0, fresh.yen + payout) }).where(eq(players.discord_id, interaction.user.id)).run();

    await interaction.editReply({ embeds: [embed], components: [] });
    return;
  }

  if (pv === 21) return finishBlackjack(interaction, game);

  const hit = new ButtonBuilder().setCustomId('bj_hit').setLabel('Hit').setStyle(ButtonStyle.Primary);
  const stand = new ButtonBuilder().setCustomId('bj_stand').setLabel('Stand').setStyle(ButtonStyle.Danger);
  const row = new ActionRowBuilder().addComponents(hit, stand);
  const msg = await interaction.editReply({ embeds: [embed], components: [row] });

  const col = msg.createMessageComponentCollector({ filter: i => i.user.id === interaction.user.id, time: 30_000, max: 1 });
  col.on('collect', async btn => {
    await btn.deferUpdate();
    if (btn.customId === 'bj_hit') {
      game.playerHand.push(game.deck.pop());
      if (handValue(game.playerHand) > 21) {
        await finishBlackjack(interaction, game);
      } else if (handValue(game.playerHand) === 21) {
        await finishBlackjack(interaction, game);
      } else {
        await renderBlackjack(interaction, game, false);
      }
    } else {
      await finishBlackjack(interaction, game);
    }
  });
  col.on('end', (_, reason) => {
    if (reason === 'time') { bjGames.delete(interaction.user.id); interaction.editReply({ components: [] }).catch(() => {}); }
  });
}

async function finishBlackjack(interaction, game) {
  bjGames.delete(interaction.user.id);
  while (handValue(game.dealerHand) < 17) game.dealerHand.push(game.deck.pop());
  await renderBlackjack(interaction, game, true);
}

async function getPlayer(interaction) {
  const player = db.select().from(players).where(eq(players.discord_id, interaction.user.id)).get();
  if (!player) { await interaction.editReply('❌ Run `/profile` first.'); return null; }
  return player;
}
