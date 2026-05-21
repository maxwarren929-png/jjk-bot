const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { db } = require('../db/index');
const { players } = require('../db/schema');
const { eq } = require('drizzle-orm');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('curseinfo')
    .setDescription('Check any active curses or debuffs on yourself.'),

  async execute(interaction) {
    await interaction.deferReply();
    const player = db.select().from(players).where(eq(players.discord_id, interaction.user.id)).get();
    if (!player) return interaction.editReply('❌ Run `/profile` first.');

    const now = Date.now();
    const job = (() => { try { return JSON.parse(player.job_data || '{}'); } catch { return {}; } })();
    const curses = job.__curses || {};
    const statuses = job.__statuses || {};

    const lines = [];

    for (const [casterId, curse] of Object.entries(curses)) {
      if (curse.until > now) {
        const remaining = Math.ceil((curse.until - now) / 1000);
        lines.push(`☠️ **${curse.by || 'Unknown'}** — ${remaining}s remaining (-20% damage)`);
      }
    }

    if (statuses.silenced_until && statuses.silenced_until > now) {
      const remaining = Math.ceil((statuses.silenced_until - now) / 1000);
      lines.push(`🔇 **Silenced** — ${remaining}s remaining (cannot use techniques)`);
    }

    if (lines.length === 0) {
      return interaction.editReply('✨ You have no active curses or debuffs.');
    }

    const embed = new EmbedBuilder()
      .setTitle('☠️ Active Curses & Debuffs')
      .setColor(0x8B0000)
      .setDescription(lines.join('\n'));
    await interaction.editReply({ embeds: [embed] });
  },
};
