const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { execSync } = require('child_process');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('version')
    .setDescription('Show bot version, uptime, and git info.'),

  async execute(interaction) {
    await interaction.deferReply();
    const pkg = require('../../package.json');

    let commitHash = 'unknown';
    let commitMsg = '';
    try {
      commitHash = execSync('git rev-parse --short HEAD', { encoding: 'utf8', timeout: 5000 }).trim();
      commitMsg = execSync('git log --oneline -1', { encoding: 'utf8', timeout: 5000 }).trim();
    } catch { /* not a git repo or git unavailable */ }

    const uptime = process.uptime();
    const days = Math.floor(uptime / 86400);
    const hours = Math.floor((uptime % 86400) / 3600);
    const mins = Math.floor((uptime % 3600) / 60);
    const uptimeStr = days > 0 ? `${days}d ${hours}h ${mins}m` : `${hours}h ${mins}m`;

    const memory = process.memoryUsage();
    const memMb = Math.round(memory.rss / 1024 / 1024);

    const embed = new EmbedBuilder()
      .setTitle('ℹ️ Cursed Energy Bot')
      .setColor(0x9B59B6)
      .addFields(
        { name: '📦 Version', value: pkg.version || '1.0.0', inline: true },
        { name: '🕐 Uptime', value: uptimeStr, inline: true },
        { name: '💾 Memory', value: `${memMb} MB RSS`, inline: true },
        { name: '🔗 Commit', value: `\`${commitHash}\` — ${commitMsg}`, inline: false },
        { name: '🌐 Node.js', value: process.version, inline: true },
        { name: '⚙️ Platform', value: process.platform, inline: true },
      );
    await interaction.editReply({ embeds: [embed] });
  },
};
