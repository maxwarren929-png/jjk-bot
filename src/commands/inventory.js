const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { db, sqlite } = require('../db/index');
const { players } = require('../db/schema');
const { eq } = require('drizzle-orm');

const { SHOP_CATALOG } = require('../systems/economy');

const ITEM_NAMES = {
  SILENCE_NEXT: { name: '🔇 Binding Ring', desc: 'Silences the enemy at the start of your next fight.' },
  BONUS_DAMAGE_20: { name: '🗡️ Split Soul Katana', desc: '+20 flat damage in your next fight.' },
  CE_RESTORE_50: { name: '💜 CE Potion', desc: 'Restores 50 Cursed Energy.' },
  EXIT_BROKEN: { name: '🧪 Healing Vial', desc: 'Exit Broken state and restore 50 HP.' },
};

function getSellPrice(effectKey) {
  const item = SHOP_CATALOG.find(i => i.effect === effectKey);
  return item ? Math.floor(item.cost * 0.5) : 0;
}

const USEABLE_ITEMS = {
  CE_RESTORE_50: { name: '💜 CE Potion', desc: 'Restore 50 CE' },
  EXIT_BROKEN: { name: '🧪 Healing Vial', desc: 'Exit Broken state and restore 50 HP' },
};

const SELLABLE_ITEMS = [
  { name: '🔇 Binding Ring', value: 'SILENCE_NEXT' },
  { name: '🗡️ Split Soul Katana', value: 'BONUS_DAMAGE_20' },
  { name: '💜 CE Potion', value: 'CE_RESTORE_50' },
  { name: '🧪 Healing Vial', value: 'EXIT_BROKEN' },
];

module.exports = {
  data: new SlashCommandBuilder()
    .setName('inventory')
    .setDescription('View your items and consumables.')
    .addSubcommand(sub => sub.setName('view').setDescription('View inventory.')
      .addUserOption(opt => opt.setName('user').setDescription('Player to inspect (defaults to you)').setRequired(false)))
    .addSubcommand(sub => sub
      .setName('use')
      .setDescription('Use a consumable item from your inventory.')
      .addStringOption(opt => opt.setName('item').setDescription('Item to use').setRequired(true)
        .addChoices(
          { name: '💜 CE Potion (restore 50 CE)', value: 'CE_RESTORE_50' },
          { name: '🧪 Healing Vial (exit Broken + 50 HP)', value: 'EXIT_BROKEN' },
        )))
    .addSubcommand(sub => sub
      .setName('sell')
      .setDescription('Sell a combat item for 50% of its value.')
      .addStringOption(opt => opt.setName('item').setDescription('Item to sell').setRequired(true)
        .addChoices(...SELLABLE_ITEMS.map(i => ({ name: i.name, value: i.value })))))
    .addSubcommand(sub => sub
      .setName('give')
      .setDescription('Give an item to another player.')
      .addUserOption(opt => opt.setName('user').setDescription('Recipient').setRequired(true))
      .addStringOption(opt => opt.setName('item').setDescription('Item to give').setRequired(true)
        .addChoices(
          { name: '🔇 Binding Ring (silence enemy)', value: 'SILENCE_NEXT' },
          { name: '🗡️ Split Soul Katana (+20 damage)', value: 'BONUS_DAMAGE_20' },
          { name: '💜 CE Potion (restore 50 CE)', value: 'CE_RESTORE_50' },
          { name: '🧪 Healing Vial (exit Broken)', value: 'EXIT_BROKEN' },
        ))),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    if (sub === 'use') return useItem(interaction);
    if (sub === 'sell') return sellItem(interaction);
    if (sub === 'give') return giveItem(interaction);

    await interaction.deferReply();
    const targetUser = interaction.options.getUser('user') || interaction.user;
    const player = db.select().from(players).where(eq(players.discord_id, targetUser.id)).get();
    if (!player) return interaction.editReply(`❌ **${targetUser.username}** has no profile.`);

    const embed = new EmbedBuilder()
      .setTitle(`🎒 ${targetUser.username}'s Inventory`)
      .setColor(0x3498DB)
      .addFields(
        { name: '👛 Wallet', value: `${player.yen.toLocaleString()} 💰`, inline: true },
        { name: '🏦 Bank', value: `${(player.bank_balance || 0).toLocaleString()} 💰`, inline: true },
        { name: '🏅 Grade', value: player.grade, inline: true },
      );

    const jobData = (() => { try { return JSON.parse(player.job_data || '{}'); } catch { return {}; } })();
    const items = jobData.__items || [];

    if (items.length > 0) {
      const itemList = items.map(k => `• ${ITEM_NAMES[k]?.name || k}`).join('\n');
      embed.addFields({ name: '⚔️ Combat Items', value: itemList, inline: false });
    } else {
      embed.addFields({ name: '⚔️ Combat Items', value: 'None. Buy items from `/shop`.', inline: false });
    }

    const equipLines = [];
    if (player.job === 'lumberjack') {
      const axeLevel = jobData.axeLevel || 1;
      equipLines.push(`🪓 Lumber Axe (Lv.${axeLevel})`);
    }
    if (player.job === 'fisherman') {
      const rodLevel = jobData.rodLevel || 1;
      equipLines.push(`🎣 Fishing Rod (Lv.${rodLevel})`);
    }
    if (equipLines.length) embed.addFields({ name: '🛠️ Equipment', value: equipLines.join('\n'), inline: false });

    const statusLines = [];
    if (player.is_broken) statusLines.push('💀 Broken');
    const now = Date.now();
    if (player.job === 'courier' && jobData.courier_until && jobData.courier_until > now) {
      const remain = Math.ceil((jobData.courier_until - now) / 60000);
      statusLines.push(`📦 **Delivering** — ${jobData.courier_pay}💰 (${remain}m left)`);
    }

    if (statusLines.length) embed.addFields({ name: '🔴 Active Statuses', value: statusLines.join('\n'), inline: false });

    await interaction.editReply({ embeds: [embed] });
  },
};

async function sellItem(interaction) {
  await interaction.deferReply();
  const itemKey = interaction.options.getString('item');
  const player = db.select().from(players).where(eq(players.discord_id, interaction.user.id)).get();
  if (!player) return interaction.editReply('❌ Run `/profile` first.');
  const { sellItem: doSell } = require('../systems/economy');
  const result = doSell(player, itemKey);
  if (result.error) return interaction.editReply(`❌ ${result.error}`);
  const embed = new EmbedBuilder()
    .setTitle('💰 Item Sold')
    .setColor(0x2ECC71)
    .setDescription(`Sold **${result.item}** for **${result.price} 💰** (50% of cost).`);
  await interaction.editReply({ embeds: [embed] });
}

async function giveItem(interaction) {
  await interaction.deferReply();
  const targetUser = interaction.options.getUser('user');
  const itemKey = interaction.options.getString('item');
  if (targetUser.id === interaction.user.id) return interaction.editReply('❌ You cannot give items to yourself.');

  const target = db.select().from(players).where(eq(players.discord_id, targetUser.id)).get();
  if (!target) return interaction.editReply(`❌ **${targetUser.username}** has no profile.`);

  const item = ITEM_NAMES[itemKey];
  if (!item) return interaction.editReply('❌ Unknown item.');

  sqlite.transaction(() => {
    const giver = db.select().from(players).where(eq(players.discord_id, interaction.user.id)).get();
    if (!giver) return;
    const giverJob = (() => { try { return JSON.parse(giver.job_data || '{}'); } catch { return {}; } })();
    const giverItems = giverJob.__items || [];
    const idx = giverItems.indexOf(itemKey);
    if (idx === -1) return;
    giverItems.splice(idx, 1);
    giverJob.__items = giverItems;
    db.update(players).set({ job_data: JSON.stringify(giverJob) }).where(eq(players.discord_id, interaction.user.id)).run();

    const recv = db.select().from(players).where(eq(players.discord_id, targetUser.id)).get();
    if (!recv) return;
    const recvJob = (() => { try { return JSON.parse(recv.job_data || '{}'); } catch { return {}; } })();
    if (!recvJob.__items) recvJob.__items = [];
    if (!recvJob.__items.includes(itemKey)) recvJob.__items.push(itemKey);
    db.update(players).set({ job_data: JSON.stringify(recvJob) }).where(eq(players.discord_id, targetUser.id)).run();
  })();

  const embed = new EmbedBuilder()
    .setTitle('🎁 Item Given')
    .setColor(0x9B59B6)
    .setDescription(`**${item.name}** given to **${targetUser.username}**.`);
  await interaction.editReply({ embeds: [embed] });
}

async function useItem(interaction) {
  await interaction.deferReply();
  const itemKey = interaction.options.getString('item');
  const player = db.select().from(players).where(eq(players.discord_id, interaction.user.id)).get();
  if (!player) return interaction.editReply('❌ Run `/profile` first.');

  const jobData = (() => { try { return JSON.parse(player.job_data || '{}'); } catch { return {}; } })();
  const items = jobData.__items || [];
  const idx = items.indexOf(itemKey);
  if (idx === -1) return interaction.editReply(`❌ You don't have a **${USEABLE_ITEMS[itemKey].name}**. Buy one from \`/shop\`.`);

  items.splice(idx, 1);
  const resultText = USEABLE_ITEMS[itemKey].desc;

  let skipped = null;
  sqlite.transaction(() => {
    const fresh = db.select().from(players).where(eq(players.discord_id, interaction.user.id)).get();
    if (!fresh) return;
    const freshJob = (() => { try { return JSON.parse(fresh.job_data || '{}'); } catch { return {}; } })();
    const freshItems = freshJob.__items || [];
    const fIdx = freshItems.indexOf(itemKey);
    if (fIdx === -1) return;
    freshItems.splice(fIdx, 1);
    freshJob.__items = freshItems;

    if (itemKey === 'CE_RESTORE_50') {
      if (fresh.ce >= fresh.max_ce) {
        skipped = 'Your CE is already full. Save the potion for later.';
        db.update(players).set({ job_data: JSON.stringify(freshJob) }).where(eq(players.discord_id, interaction.user.id)).run();
        return;
      }
    }

    if (itemKey === 'EXIT_BROKEN') {
      if (!fresh.is_broken) {
        skipped = 'You are not Broken. No need for a Healing Vial.';
        db.update(players).set({ job_data: JSON.stringify(freshJob) }).where(eq(players.discord_id, interaction.user.id)).run();
        return;
      }
    }

    const update = {};
    if (itemKey === 'CE_RESTORE_50') update.ce = Math.min(fresh.ce + 50, fresh.max_ce);
    if (itemKey === 'EXIT_BROKEN') { update.is_broken = false; update.broken_until = null; update.hp = Math.min(fresh.hp + 50, fresh.max_hp); }
    update.job_data = JSON.stringify(freshJob);
    db.update(players).set(update).where(eq(players.discord_id, interaction.user.id)).run();
  })();

  if (skipped) return interaction.editReply(`❌ ${skipped}`);

  const embed = new EmbedBuilder()
    .setTitle(`✅ Used: ${USEABLE_ITEMS[itemKey].name}`)
    .setColor(0x2ECC71)
    .setDescription(`${resultText} — item consumed.`);
  await interaction.editReply({ embeds: [embed] });
}
