const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { db } = require('../db/index');
const { players } = require('../db/schema');
const { eq } = require('drizzle-orm');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('share')
    .setDescription('Share your most recent combat result in this channel.'),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });
    const player = db.select().from(players).where(eq(players.discord_id, interaction.user.id)).get();
    if (!player) return interaction.editReply('❌ Run `/profile` first.');

    const jobData = (() => { try { return JSON.parse(player.job_data || '{}'); } catch { return {}; } })();
    const fight = jobData.__last_fight;
    if (!fight) return interaction.editReply('❌ No recent fights found. Use `/use` to fight someone!');

    const embed = new EmbedBuilder()
      .setTitle(`⚔️ ${interaction.user.username}'s Last Fight`)
      .setColor(fight.won ? 0x2ECC71 : 0xE74C3C)
      .addFields(
        { name: '🎯 Target', value: fight.target || 'Unknown', inline: true },
        { name: '⚔️ Technique', value: fight.technique || 'Unknown', inline: true },
        { name: '💥 Damage', value: `${fight.damage || 0}`, inline: true },
        { name: '🏆 Result', value: fight.won ? '✅ Victory' : '❌ Defeat', inline: true },
        { name: '💰 Yen Earned', value: `${(fight.yenEarned || 0).toLocaleString()} 💰`, inline: true },
        { name: '🕐 When', value: `<t:${Math.floor((fight.time || Date.now()) / 1000)}:R>`, inline: true },
      );

    await interaction.editReply({ content: '✅ Fight shared!', ephemeral: true });
    await interaction.channel.send({ content: `📢 **${interaction.user.username}** shares their last fight:`, embeds: [embed] });
  },
};
