const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { db } = require('../db/index');
const { players } = require('../db/schema');
const { eq } = require('drizzle-orm');
const { getCooldowns } = require('../systems/combat');
const { TECHNIQUES } = require('../data/techniques');

const ROB_COOLDOWN_MS = 3600000;
const DOMAIN_COOLDOWN_MS = 30000;

module.exports = {
  data: new SlashCommandBuilder()
    .setName('cooldowns')
    .setDescription('View all your active cooldowns.'),

  async execute(interaction) {
    await interaction.deferReply();
    const player = db.select().from(players).where(eq(players.discord_id, interaction.user.id)).get();
    if (!player) return interaction.editReply('❌ Run `/profile` first.');

    const now = Date.now();
    const lines = [];

    // Rob cooldown
    if (player.last_robbed_at) {
      const remain = player.last_robbed_at + ROB_COOLDOWN_MS - now;
      if (remain > 0) {
        lines.push(`🔫 **Rob** — ${Math.ceil(remain / 60000)}m remaining`);
      }
    }

    // Domain cooldown
    if (player.last_domain_at) {
      const remain = player.last_domain_at + DOMAIN_COOLDOWN_MS - now;
      if (remain > 0) {
        lines.push(`🔮 **Domain Expansion** — ${Math.ceil(remain / 1000)}s remaining`);
      }
    }

    // Training remaining
    if (player.training_until && player.training_until > now) {
      const remain = Math.ceil((player.training_until - now) / 60000);
      lines.push(`🏋️ **Training (${player.training_type})** — ${remain}m remaining`);
    }

    // Daily cooldown
    const DAY_MS = 86400000;
    if (player.last_daily_at && now - player.last_daily_at < DAY_MS) {
      const remain = player.last_daily_at + DAY_MS - now;
      lines.push(`📅 **Daily** — ${Math.floor(remain / 3600000)}h ${Math.ceil((remain % 3600000) / 60000)}m remaining`);
    }

    // Technique cooldowns (in-memory)
    const userCDs = getCooldowns(player.discord_id);
    const techEntries = Object.entries(userCDs).filter(([_, ts]) => ts > now);
    if (techEntries.length > 0) {
      const techLines = techEntries.map(([techId, ts]) => {
        const remain = Math.ceil((ts - now) / 1000);
        const tech = TECHNIQUES.find(t => t.id === techId);
        return `**${tech?.name || techId}** — ${remain}s`;
      });
      lines.push(`⚔️ **Techniques**\n${techLines.join('\n')}`);
    }

    if (lines.length === 0) {
      lines.push('✨ No active cooldowns!');
    }

    const embed = new EmbedBuilder()
      .setTitle(`⏳ ${interaction.user.username}'s Cooldowns`)
      .setColor(0x3498DB)
      .setDescription(lines.join('\n\n'))
      .setFooter({ text: `🏦 Bank: ${(player.bank_balance || 0).toLocaleString()} / ${player.bank_max === Infinity ? '♾️' : player.bank_max.toLocaleString()} 💰` });

    await interaction.editReply({ embeds: [embed] });
  },
};
