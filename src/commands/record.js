const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { db } = require('../db/index');
const { players } = require('../db/schema');
const { eq } = require('drizzle-orm');

function safeParse(val) {
  try { return JSON.parse(val || '{}'); } catch { return {}; }
}

function getMostUsedTech(history) {
  const counts = {};
  for (const entry of history) {
    const t = entry.technique || 'unknown';
    counts[t] = (counts[t] || 0) + 1;
  }
  let best = null;
  let bestCount = 0;
  for (const [tech, count] of Object.entries(counts)) {
    if (count > bestCount) { best = tech; bestCount = count; }
  }
  return best ? `${best} (${bestCount}x)` : 'None';
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('record')
    .setDescription('View your detailed combat record and statistics.'),

  async execute(interaction) {
    await interaction.deferReply();
    const player = db.select().from(players).where(eq(players.discord_id, interaction.user.id)).get();
    if (!player) return interaction.editReply('❌ Run `/profile` first.');

    const job = safeParse(player.job_data);
    const history = job.__fight_history || [];
    const elo = job.__elo || 1000;
    const wins = player.fight_wins || 0;
    const losses = player.fight_losses || 0;
    const total = wins + losses;
    const ratio = total > 0 ? ((wins / total) * 100).toFixed(1) : 'N/A';

    const embed = new EmbedBuilder()
      .setTitle(`📊 Combat Record — ${player.username}`)
      .setColor(0x3498DB)
      .addFields(
        { name: '🏆 Total Fights', value: `${total}`, inline: true },
        { name: '✅ Wins', value: `${wins}`, inline: true },
        { name: '❌ Losses', value: `${losses}`, inline: true },
        { name: '📈 Win Rate', value: `${ratio}%`, inline: true },
        { name: '🎯 ELO', value: `${elo}`, inline: true },
        { name: '💀 Kills', value: `${player.bounty_kills || 0}`, inline: true },
        { name: '⚔️ Most Used', value: `${getMostUsedTech(history)}`, inline: false },
      );

    if (history.length > 0) {
      const recent = history.slice(0, 5).map(e =>
        `**${e.result === 'win' ? '✅' : '❌'}** vs ${e.opponent} — ${e.technique} (${e.damage || 0} dmg)`
      ).join('\n');
      embed.addFields({ name: '🕐 Recent Fights', value: recent, inline: false });
    }

    await interaction.editReply({ embeds: [embed] });
  },
};
