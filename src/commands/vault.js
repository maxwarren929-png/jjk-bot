const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { db, sqlite } = require('../db/index');
const { players } = require('../db/schema');
const { eq } = require('drizzle-orm');

const GRADES = ['Grade 4', 'Grade 3', 'Grade 2', 'Grade 1', 'Semi-Special Grade', 'Special Grade'];
const BASE_CAPACITY = 1000;
const CAPACITY_PER_GRADE = 500;
const WITHDRAW_FEE_PCT = 0.05;

function getCapacity(player) {
  const idx = GRADES.indexOf(player.grade);
  return BASE_CAPACITY + Math.max(0, idx) * CAPACITY_PER_GRADE;
}

function safeParse(val) {
  try { return JSON.parse(val || '{}'); } catch { return {}; }
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('vault')
    .setDescription('Protected yen storage that survives death.')
    .addSubcommand(sub => sub.setName('balance').setDescription('Check your vault balance and capacity.'))
    .addSubcommand(sub => sub
      .setName('deposit')
      .setDescription('Deposit yen into your vault.')
      .addIntegerOption(o => o.setName('amount').setDescription('Amount to deposit').setRequired(true).setMinValue(1)))
    .addSubcommand(sub => sub
      .setName('withdraw')
      .setDescription('Withdraw yen from your vault (5% fee).')
      .addIntegerOption(o => o.setName('amount').setDescription('Amount to withdraw').setRequired(true).setMinValue(1))),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    if (sub === 'deposit') return depositVault(interaction);
    if (sub === 'withdraw') return withdrawVault(interaction);
    return vaultBalance(interaction);
  },
};

async function vaultBalance(interaction) {
  await interaction.deferReply();
  const player = db.select().from(players).where(eq(players.discord_id, interaction.user.id)).get();
  if (!player) return interaction.editReply('❌ Run `/profile` first.');
  const job = safeParse(player.job_data);
  const vault = job.__vault || 0;
  const capacity = getCapacity(player);
  const embed = new EmbedBuilder()
    .setTitle('🔒 Vault')
    .setColor(0xF1C40F)
    .addFields(
      { name: '💰 Balance', value: `${vault.toLocaleString()} 💰`, inline: true },
      { name: '📦 Capacity', value: `${capacity.toLocaleString()} 💰`, inline: true },
      { name: '🛡️ Protected', value: 'Vault yen is never lost on death.', inline: false },
    );
  await interaction.editReply({ embeds: [embed] });
}

async function depositVault(interaction) {
  await interaction.deferReply();
  const amount = interaction.options.getInteger('amount');
  let result = null;
  sqlite.transaction(() => {
    const fresh = db.select().from(players).where(eq(players.discord_id, interaction.user.id)).get();
    if (!fresh) { result = '❌ Run `/profile` first.'; return; }
    if (fresh.yen < amount) { result = `❌ You only have **${fresh.yen} 💰** in your wallet.`; return; }
    const job = safeParse(fresh.job_data);
    const vault = job.__vault || 0;
    const capacity = getCapacity(fresh);
    if (vault + amount > capacity) { result = `❌ Vault capacity exceeded (**${capacity.toLocaleString()} 💰** max).`; return; }
    job.__vault = vault + amount;
    db.update(players).set({ yen: fresh.yen - amount, job_data: JSON.stringify(job) }).where(eq(players.discord_id, interaction.user.id)).run();
    result = { amount, balance: job.__vault };
  })();
  if (typeof result === 'string') return interaction.editReply(result);
  if (!result) return interaction.editReply('❌ Something went wrong.');
  const embed = new EmbedBuilder()
    .setTitle('🔒 Vault Deposit')
    .setColor(0x2ECC71)
    .setDescription(`Deposited **${result.amount} 💰**. Vault balance: **${result.balance.toLocaleString()} 💰**.`);
  await interaction.editReply({ embeds: [embed] });
}

async function withdrawVault(interaction) {
  await interaction.deferReply();
  const amount = interaction.options.getInteger('amount');
  const fee = Math.ceil(amount * WITHDRAW_FEE_PCT);
  let result = null;
  sqlite.transaction(() => {
    const fresh = db.select().from(players).where(eq(players.discord_id, interaction.user.id)).get();
    if (!fresh) { result = '❌ Run `/profile` first.'; return; }
    const job = safeParse(fresh.job_data);
    const vault = job.__vault || 0;
    if (vault < amount) { result = `❌ Vault only has **${vault.toLocaleString()} 💰**.`; return; }
    const remaining = vault - amount;
    job.__vault = remaining;
    db.update(players).set({ yen: fresh.yen + (amount - fee), job_data: JSON.stringify(job) }).where(eq(players.discord_id, interaction.user.id)).run();
    result = { amount, fee, remaining };
  })();
  if (typeof result === 'string') return interaction.editReply(result);
  if (!result) return interaction.editReply('❌ Something went wrong.');
  const embed = new EmbedBuilder()
    .setTitle('🔒 Vault Withdrawal')
    .setColor(0xE74C3C)
    .setDescription(`Withdrew **${result.amount} 💰** (5% fee: **${result.fee} 💰**). Vault balance: **${result.remaining.toLocaleString()} 💰**.`);
  await interaction.editReply({ embeds: [embed] });
}
