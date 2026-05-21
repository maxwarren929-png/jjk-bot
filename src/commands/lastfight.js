const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { db } = require('../db/index');
const { players } = require('../db/schema');
const { eq } = require('drizzle-orm');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('lastfight')
    .setDescription('View your most recent combat result.'),

  async execute(interaction) {
    await interaction.deferReply();
    const player = db.select().from(players).where(eq(players.discord_id, interaction.user.id)).get();
    if (!player) return interaction.editReply('❌ Run `/profile` first.');

    const jobData = (() => { try { return JSON.parse(player.job_data || '{}'); } catch { return {}; } })();
    const fight = jobData.__last_fight;
    if (!fight) return interaction.editReply('❌ No recent fights found. Use `/use` to fight someone!');

    const embed = new EmbedBuilder()
      .setTitle('⚔️ Last Fight')
      .setColor(fight.won ? 0x2ECC71 : 0xE74C3C)
      .addFields(
        { name: '🎯 Target', value: fight.target, inline: true },
        { name: '⚔️ Technique', value: fight.technique, inline: true },
        { name: '💥 Damage', value: `${fight.damage}`, inline: true },
        { name: '🏆 Result', value: fight.won ? '✅ Victory' : '❌ Defeat', inline: true },
        { name: '💰 Yen Earned', value: `${fight.yenEarned.toLocaleString()} 💰`, inline: true },
        { name: '🕐 When', value: `<t:${Math.floor(fight.time / 1000)}:R>`, inline: true },
      );

    await interaction.editReply({ embeds: [embed] });
  },
};
