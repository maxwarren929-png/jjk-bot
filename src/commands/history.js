const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { db } = require('../db/index');
const { players } = require('../db/schema');
const { eq } = require('drizzle-orm');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('history')
    .setDescription('View your recent PvP fight history.'),

  async execute(interaction) {
    await interaction.deferReply();
    const player = db.select().from(players).where(eq(players.discord_id, interaction.user.id)).get();
    if (!player) return interaction.editReply('❌ Run `/profile` first.');

    const job = (() => { try { return JSON.parse(player.job_data || '{}'); } catch { return {}; } })();
    const fights = job.__fight_history || [];
    if (fights.length === 0) {
      return interaction.editReply('📜 No fight history yet. Use `/use` to battle someone!');
    }

    const lines = fights.slice(0, 10).map((f) => {
      const icon = f.result === 'win' ? '✅' : '💀';
      const time = f.timestamp ? `<t:${Math.floor(f.timestamp / 1000)}:R>` : 'unknown';
      return `${icon} **vs ${f.opponent}** — *${f.technique}* — ${f.damage} dmg — ${time}`;
    });

    const embed = new EmbedBuilder()
      .setTitle('📜 Recent Fights')
      .setColor(0x9B59B6)
      .setDescription(lines.join('\n'));
    await interaction.editReply({ embeds: [embed] });
  },
};
