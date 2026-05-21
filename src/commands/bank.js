const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { db, sqlite } = require('../db/index');
const { players } = require('../db/schema');
const { eq } = require('drizzle-orm');

const INTEREST_RATE = 0.0005;

const BANK_TIERS = [
  { level: 1, max: 5000, cost: 0, name: 'Basic Pouch' },
  { level: 2, max: 20000, cost: 2000, name: 'Iron Vault' },
  { level: 3, max: 50000, cost: 5000, name: 'Steel Depository' },
  { level: 4, max: 200000, cost: 15000, name: 'Cursed Treasury' },
  { level: 5, max: Number.MAX_SAFE_INTEGER, cost: 50000, name: 'Infinite Abyss' },
];

function getTier(bankMax) {
  for (const t of BANK_TIERS) {
    if (bankMax <= t.max) return t;
  }
  return BANK_TIERS[BANK_TIERS.length - 1];
}

function nextTier(bankMax) {
  const current = getTier(bankMax);
  const idx = BANK_TIERS.indexOf(current);
  return idx >= 0 && idx < BANK_TIERS.length - 1 ? BANK_TIERS[idx + 1] : null;
}

function accrueInterest(discordId) {
  const player = db.select().from(players).where(eq(players.discord_id, discordId)).get();
  if (!player || !player.bank_balance || player.bank_balance <= 0) return 0;
  const now = Date.now();
  const last = player.last_interest_at || now;
  const hours = (now - last) / 3600000;
  if (hours < 1) return 0;
  const interest = Math.floor(player.bank_balance * INTEREST_RATE * Math.min(hours, 24));
  if (interest <= 0) return 0;
  sqlite.transaction(() => {
    const fresh = db.select().from(players).where(eq(players.discord_id, discordId)).get();
    if (!fresh || !fresh.bank_balance || fresh.bank_balance <= 0) return;
    db.update(players).set({ bank_balance: fresh.bank_balance + interest, last_interest_at: now })
      .where(eq(players.discord_id, discordId)).run();
  })();
  return interest;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('bank')
    .setDescription('Manage your cursed bank account.')
    .addSubcommand(sub => sub.setName('balance').setDescription('Check your wallet and bank balances.'))
    .addSubcommand(sub => sub.setName('upgrade').setDescription('Upgrade your bank storage limit.'))
    .addSubcommand(sub => sub
      .setName('deposit')
      .setDescription('Deposit yen into your bank (safe from death).')
      .addIntegerOption(opt => opt.setName('amount').setDescription('Amount to deposit').setRequired(false).setMinValue(1))
      .addBooleanOption(opt => opt.setName('all').setDescription('Deposit all wallet yen').setRequired(false)))
    .addSubcommand(sub => sub
      .setName('withdraw')
      .setDescription('Withdraw yen from your bank.')
      .addIntegerOption(opt => opt.setName('amount').setDescription('Amount to withdraw').setRequired(false).setMinValue(1))
      .addBooleanOption(opt => opt.setName('all').setDescription('Withdraw all bank balance').setRequired(false))),

  async execute(interaction) {
    await interaction.deferReply();
    const sub = interaction.options.getSubcommand();
    const player = db.select().from(players).where(eq(players.discord_id, interaction.user.id)).get();
    if (!player) return interaction.editReply('❌ Run `/profile` first.');

    if (sub === 'balance') {
      const interest = accrueInterest(interaction.user.id);
      const refreshed = db.select().from(players).where(eq(players.discord_id, interaction.user.id)).get();
      const tier = getTier(refreshed.bank_max);
      const embed = new EmbedBuilder()
        .setTitle('🏦 Cursed Bank')
        .setColor(0xF1C40F)
        .setDescription(`**Tier:** ${tier.name} (${refreshed.bank_max === Infinity ? '♾️' : refreshed.bank_max.toLocaleString()} max)`)
        .addFields(
          { name: '👛 Wallet', value: `${refreshed.yen.toLocaleString()} 💰`, inline: true },
          { name: '🏦 Bank', value: `${(refreshed.bank_balance || 0).toLocaleString()} 💰`, inline: true },
          { name: '💰 Total', value: `${(refreshed.yen + (refreshed.bank_balance || 0)).toLocaleString()} 💰`, inline: true },
        );
      if (interest > 0) embed.addFields({ name: '📈 Interest', value: `+${interest} 💰`, inline: true });
      return interaction.editReply({ embeds: [embed] });
    }

    if (sub === 'upgrade') {
      const tier = getTier(player.bank_max);
      const next = nextTier(player.bank_max);
      const embed = new EmbedBuilder()
        .setTitle('🏦 Bank Upgrade')
        .setColor(0x3498DB)
        .setDescription(`Current: **${tier.name}** (${tier.max === Infinity ? '♾️' : tier.max.toLocaleString()} max)`);

      if (!next) {
        embed.addFields({ name: 'MAXED', value: 'Your bank is already unlimited.', inline: false });
        return interaction.editReply({ embeds: [embed] });
      }

      embed.addFields({
        name: `Next: ${next.name}`,
        value: `⬆️ ${next.max === Infinity ? '♾️' : next.max.toLocaleString()} max — **${next.cost.toLocaleString()} 💰**`,
        inline: false,
      });

      if (player.yen < next.cost) {
        embed.setFooter({ text: `You need ${next.cost - player.yen} more 💰` });
        return interaction.editReply({ embeds: [embed] });
      }

      const btn = new ButtonBuilder().setCustomId('bank_upgrade').setLabel(`Upgrade (${next.cost} 💰)`).setStyle(ButtonStyle.Primary);
      const row = new ActionRowBuilder().addComponents(btn);
      const msg = await interaction.editReply({ embeds: [embed], components: [row] });
      const col = msg.createMessageComponentCollector({ filter: i => i.user.id === interaction.user.id, time: 30_000, max: 1 });
      col.on('collect', async btn => {
        await btn.deferUpdate();
        const fresh = db.select().from(players).where(eq(players.discord_id, interaction.user.id)).get();
        if (fresh.yen < next.cost) {
          await interaction.editReply({ content: `❌ Not enough yen. Need **${next.cost} 💰**, have **${fresh.yen} 💰**.`, embeds: [], components: [] });
          return;
        }
        sqlite.transaction(() => {
          const f = db.select().from(players).where(eq(players.discord_id, interaction.user.id)).get();
          if (!f || f.yen < next.cost) return;
          db.update(players).set({ yen: f.yen - next.cost, bank_max: next.max })
            .where(eq(players.discord_id, interaction.user.id)).run();
        })();
        const done = new EmbedBuilder()
          .setTitle('⬆️ Bank Upgraded!')
          .setColor(0x2ECC71)
           .setDescription(`**${next.name}** — ${next.max === Number.MAX_SAFE_INTEGER ? '♾️ Unlimited' : `${next.max.toLocaleString()} 💰 max`}`);
        await interaction.editReply({ embeds: [done], components: [] });
        try {
          const { checkAndUnlock } = require('../systems/achievements');
          if (next.max === Number.MAX_SAFE_INTEGER) {
            const ach = checkAndUnlock(interaction.user.id, 'max_bank');
            if (ach) await interaction.followUp({ content: `🏆 **Achievement Unlocked: ${ach.icon} ${ach.name}!**`, ephemeral: true }).catch(() => {});
          }
        } catch { /* ok */ }
      });
      col.on('end', (_, reason) => {
        if (reason === 'time') interaction.editReply({ components: [] }).catch(() => {});
      });
      return;
    }

    let amount = interaction.options.getInteger('amount');
    const all = interaction.options.getBoolean('all');

    if (sub === 'deposit') {
      // Accrue interest first, then re-fetch to avoid stale balance
      accrueInterest(interaction.user.id);
      const fresh = db.select().from(players).where(eq(players.discord_id, interaction.user.id)).get();
      const walletYen = fresh.yen;
      const bankBal = fresh.bank_balance || 0;
      if (all) amount = walletYen;
      if (!amount || amount <= 0) return interaction.editReply('❌ Specify an amount or use `all: true`.');
      if (amount > walletYen) return interaction.editReply(`❌ You only have **${walletYen.toLocaleString()} 💰** in your wallet.`);
      const canStore = fresh.bank_max - bankBal;
      if (canStore <= 0) return interaction.editReply(`❌ Your bank is full (${fresh.bank_max === Infinity ? '♾️' : fresh.bank_max.toLocaleString()} max). Upgrade first.`);
      let depositedAmount = 0;
      sqlite.transaction(() => {
        const f = db.select().from(players).where(eq(players.discord_id, interaction.user.id)).get();
        if (!f) return;
        const maxStore = f.bank_max - (f.bank_balance || 0);
        const a = Math.min(amount, f.yen, maxStore);
        depositedAmount = a;
        db.update(players).set({ yen: f.yen - a, bank_balance: (f.bank_balance || 0) + a })
          .where(eq(players.discord_id, interaction.user.id)).run();
      })();
      const afterDeposit = db.select().from(players).where(eq(players.discord_id, interaction.user.id)).get();
      const isPartial = depositedAmount < amount;
      const embed = new EmbedBuilder()
        .setTitle(isPartial ? '🏦 Deposit (Partial)' : '🏦 Deposit')
        .setColor(isPartial ? 0xF1C40F : 0x2ECC71)
        .setDescription(`Deposited **${depositedAmount} 💰**${isPartial ? ` (bank full). ${amount - depositedAmount} 💰 left in wallet.` : ''}`)
        .addFields(
          { name: '👛 Wallet', value: `${afterDeposit.yen} 💰`, inline: true },
          { name: '🏦 Bank', value: `${afterDeposit.bank_balance || 0} 💰`, inline: true },
        );
      return interaction.editReply({ embeds: [embed] });
    }

    if (sub === 'withdraw') {
      accrueInterest(interaction.user.id);
      const fresh = db.select().from(players).where(eq(players.discord_id, interaction.user.id)).get();
      const bankBal = fresh.bank_balance || 0;
      if (all) amount = bankBal;
      if (!amount || amount <= 0) return interaction.editReply('❌ Specify an amount or use `all: true`.');
      if (amount > bankBal) return interaction.editReply(`❌ You only have **${bankBal.toLocaleString()} 💰** in the bank.`);
      let w = 0;
      sqlite.transaction(() => {
        const f = db.select().from(players).where(eq(players.discord_id, interaction.user.id)).get();
        if (!f) return;
        const bal = f.bank_balance || 0;
        w = Math.min(amount, bal);
        db.update(players).set({ yen: f.yen + w, bank_balance: bal - w })
          .where(eq(players.discord_id, interaction.user.id)).run();
      })();
      const afterWithdraw = db.select().from(players).where(eq(players.discord_id, interaction.user.id)).get();
      const embed = new EmbedBuilder()
        .setTitle('🏦 Withdrawal')
        .setColor(0xE74C3C)
        .setDescription(`Withdrew **${w} 💰**`)
        .addFields(
          { name: '👛 Wallet', value: `${afterWithdraw.yen} 💰`, inline: true },
          { name: '🏦 Bank', value: `${afterWithdraw.bank_balance || 0} 💰`, inline: true },
        );
      return interaction.editReply({ embeds: [embed] });
    }
  },
};
