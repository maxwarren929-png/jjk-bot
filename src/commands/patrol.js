const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { db, sqlite } = require('../db/index');
const { players } = require('../db/schema');
const { eq } = require('drizzle-orm');

const PATROL_DURATION = 15 * 60 * 1000;
const GRADE_BASE = { 'Grade 4': 20, 'Grade 3': 40, 'Grade 2': 60, 'Grade 1': 80, 'Semi-Special Grade': 120, 'Special Grade': 200 };
const activePatrols = new Map();

module.exports = {
  data: new SlashCommandBuilder()
    .setName('patrol')
    .setDescription('Send your sorcerer on a 15min patrol for passive yen.'),

  async execute(interaction) {
    await interaction.deferReply();
    const userId = interaction.user.id;

    const existing = activePatrols.get(userId);
    if (existing) {
      const remaining = existing.until - Date.now();
      if (remaining > 0) {
        return interaction.editReply(`⏳ Already on patrol. **${Math.ceil(remaining / 60000)}m** remaining.`);
      }
      activePatrols.delete(userId);
    }

    const player = db.select().from(players).where(eq(players.discord_id, userId)).get();
    if (!player) return interaction.editReply('❌ Run `/profile` first.');
    if (player.is_broken) return interaction.editReply('❌ You are Broken and cannot patrol.');

    const base = GRADE_BASE[player.grade] || 20;
    const until = Date.now() + PATROL_DURATION;
    const reward = base + Math.floor(Math.random() * base);

    activePatrols.set(userId, { until, reward });

    setTimeout(async () => {
      try {
        const p = activePatrols.get(userId);
        if (!p || p.until !== until) return;
        activePatrols.delete(userId);
        sqlite.transaction(() => {
          db.update(players).set({ yen: sqlite.raw(`yen + ${p.reward}`) }).where(eq(players.discord_id, userId)).run();
        })();
        const users = await interaction.client.users.fetch(userId);
        if (users) users.send(`🚶 Patrol complete! You earned **${p.reward} 💰**.`).catch(() => {});
      } catch { /* ok */ }
    }, PATROL_DURATION);

    const embed = new EmbedBuilder()
      .setTitle('🚶 Patrol')
      .setColor(0x2ECC71)
      .setDescription(`You set out on patrol. Return in **15m** for a reward of **~${reward} 💰**.`);
    await interaction.editReply({ embeds: [embed] });
  },
};
