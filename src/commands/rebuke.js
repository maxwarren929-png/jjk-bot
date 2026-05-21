const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { db, sqlite } = require('../db/index');
const { players } = require('../db/schema');
const { eq } = require('drizzle-orm');

const REBUKE_COST_PER_CURSE = 30;
const COOLDOWN = 60_000;
const activeRebuke = new Map();

module.exports = {
  data: new SlashCommandBuilder()
    .setName('rebuke')
    .setDescription('Remove active curses from yourself by spending CE.'),

  async execute(interaction) {
    await interaction.deferReply();
    const userId = interaction.user.id;

    const now = Date.now();
    const lastUse = activeRebuke.get(userId);
    if (lastUse && now - lastUse < COOLDOWN) {
      const secs = Math.ceil((COOLDOWN - (now - lastUse)) / 1000);
      return interaction.editReply(`⏳ Rebuke cooldown: **${secs}s** remaining.`);
    }

    let result = null;
    sqlite.transaction(() => {
      const fresh = db.select().from(players).where(eq(players.discord_id, userId)).get();
      if (!fresh) { result = '❌ Run `/profile` first.'; return; }
      const job = (() => { try { return JSON.parse(fresh.job_data || '{}'); } catch { return {}; } })();
      const curses = job.__curses || {};
      const activeCurseEntries = Object.entries(curses).filter(([, c]) => c.until > now);
      if (activeCurseEntries.length === 0) { result = '✨ You have no active curses to rebuke.'; return; }
      const totalCost = activeCurseEntries.length * REBUKE_COST_PER_CURSE;
      if (fresh.ce < totalCost) { result = `❌ Not enough CE. Need **${totalCost}**, you have **${fresh.ce}**.`; return; }
      for (const [cid] of activeCurseEntries) delete curses[cid];
      job.__curses = curses;
      db.update(players).set({ ce: fresh.ce - totalCost, job_data: JSON.stringify(job) }).where(eq(players.discord_id, userId)).run();
      result = { count: activeCurseEntries.length, cost: totalCost };
    })();

    if (typeof result === 'string') return interaction.editReply(result);
    if (!result) return interaction.editReply('❌ Something went wrong. Try again.');
    activeRebuke.set(userId, now);

    const embed = new EmbedBuilder()
      .setTitle('✨ Rebuke')
      .setColor(0x9B59B6)
      .setDescription(`Cleansed **${result.count}** curse(s) for **${result.cost} CE**.`);
    await interaction.editReply({ embeds: [embed] });
  },
};
