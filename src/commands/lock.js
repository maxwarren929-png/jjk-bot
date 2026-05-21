const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { db, sqlite } = require('../db/index');
const { players } = require('../db/schema');
const { eq } = require('drizzle-orm');

const MIN_LOCK = 1000;
const DURATION = 24 * 60 * 60 * 1000;
const INTEREST_RATE = 0.05;

function safeParse(val) {
  try { return JSON.parse(val || '{}'); } catch { return {}; }
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('lock')
    .setDescription('Lock yen in a time-deposit to earn 5% interest over 24h.')
    .addSubcommand(sub => sub.setName('create').setDescription('Create a new locked deposit.')
      .addIntegerOption(o => o.setName('amount').setDescription('Amount to lock (min 1,000)').setRequired(true).setMinValue(MIN_LOCK)))
    .addSubcommand(sub => sub.setName('claim').setDescription('Claim matured deposits.'))
    .addSubcommand(sub => sub.setName('list').setDescription('View your active locked deposits.')),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    if (sub === 'create') return createLock(interaction);
    if (sub === 'claim') return claimLocks(interaction);
    return listLocks(interaction);
  },
};

async function createLock(interaction) {
  await interaction.deferReply();
  const amount = interaction.options.getInteger('amount');
  let result = null;
  sqlite.transaction(() => {
    const fresh = db.select().from(players).where(eq(players.discord_id, interaction.user.id)).get();
    if (!fresh) { result = '❌ Run `/profile` first.'; return; }
    if (fresh.bank_balance < amount) { result = `❌ You only have **${(fresh.bank_balance || 0).toLocaleString()} 💰** in the bank.`; return; }
    const job = safeParse(fresh.job_data);
    if (!job.__locks) job.__locks = [];
    job.__locks.push({ amount, start: Date.now(), maturity: Date.now() + DURATION });
    db.update(players).set({ bank_balance: (fresh.bank_balance || 0) - amount, job_data: JSON.stringify(job) })
      .where(eq(players.discord_id, interaction.user.id)).run();
    result = { amount, maturity: Date.now() + DURATION };
  })();
  if (typeof result === 'string') return interaction.editReply(result);
  if (!result) return interaction.editReply('❌ Something went wrong.');
  const embed = new EmbedBuilder()
    .setTitle('🔐 Time Lock')
    .setColor(0xF1C40F)
    .setDescription(`Locked **${result.amount.toLocaleString()} 💰**. Matures <t:${Math.floor(result.maturity / 1000)}:R>.\nEarn **${Math.floor(result.amount * INTEREST_RATE).toLocaleString()} 💰** interest.`);
  await interaction.editReply({ embeds: [embed] });
}

async function claimLocks(interaction) {
  await interaction.deferReply();
  const now = Date.now();
  let result = null;
  sqlite.transaction(() => {
    const fresh = db.select().from(players).where(eq(players.discord_id, interaction.user.id)).get();
    if (!fresh) { result = '❌ Run `/profile` first.'; return; }
    const job = safeParse(fresh.job_data);
    const locks = job.__locks || [];
    const matured = locks.filter(l => l.maturity <= now);
    if (matured.length === 0) { result = '📭 No deposits have matured yet.'; return; }
    const totalPrincipal = matured.reduce((s, l) => s + l.amount, 0);
    const totalInterest = Math.floor(totalPrincipal * INTEREST_RATE);
    job.__locks = locks.filter(l => l.maturity > now);
    db.update(players).set({
      bank_balance: (fresh.bank_balance || 0) + totalPrincipal + totalInterest,
      job_data: JSON.stringify(job),
    }).where(eq(players.discord_id, interaction.user.id)).run();
    result = { principal: totalPrincipal, interest: totalInterest };
  })();
  if (typeof result === 'string') return interaction.editReply(result);
  if (!result) return interaction.editReply('❌ Something went wrong.');
  const embed = new EmbedBuilder()
    .setTitle('🔐 Lock Claimed')
    .setColor(0x2ECC71)
    .setDescription(`Claimed **${result.principal.toLocaleString()} 💰** + **${result.interest.toLocaleString()} 💰** interest.`);
  await interaction.editReply({ embeds: [embed] });
}

async function listLocks(interaction) {
  await interaction.deferReply();
  const player = db.select().from(players).where(eq(players.discord_id, interaction.user.id)).get();
  if (!player) return interaction.editReply('❌ Run `/profile` first.');
  const job = safeParse(player.job_data);
  const locks = job.__locks || [];
  if (locks.length === 0) return interaction.editReply('📭 No active locked deposits. Use `/lock create` to start one.');
  const now = Date.now();
  const lines = locks.map((l, i) => {
    const matured = l.maturity <= now;
    const timeStr = matured ? '✅ Matured — ready to claim' : `<t:${Math.floor(l.maturity / 1000)}:R>`;
    return `**#${i + 1}:** ${l.amount.toLocaleString()} 💰 — ${timeStr}`;
  });
  const embed = new EmbedBuilder()
    .setTitle('🔐 Active Time Locks')
    .setColor(0xF1C40F)
    .setDescription(lines.join('\n'));
  await interaction.editReply({ embeds: [embed] });
}
