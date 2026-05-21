const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { db } = require('../db/index');
const { players } = require('../db/schema');
const { eq } = require('drizzle-orm');

const DAY_MS = 24 * 60 * 60 * 1000;
const STREAK_CAP = 7;
const STREAK_BONUS_PER = 10;

const DAILY_YEN = {
  'Grade 4': 40, 'Grade 3': 80, 'Grade 2': 120,
  'Grade 1': 200, 'Semi-Special Grade': 350, 'Special Grade': 500,
};

module.exports = {
  data: new SlashCommandBuilder()
    .setName('daily')
    .setDescription('Claim your daily reward.'),

  async execute(interaction) {
    await interaction.deferReply();
    const discordId = interaction.user.id;
    const player = db.select().from(players).where(eq(players.discord_id, discordId)).get();
    if (!player) {
      await interaction.editReply('❌ Run `/profile` first.');
      return;
    }

    const now = Date.now();

    if (player.last_daily_at && now - player.last_daily_at < DAY_MS) {
      const next = new Date(player.last_daily_at + DAY_MS);
      await interaction.editReply(`⏳ Daily already claimed. Next claim: <t:${Math.floor(next / 1000)}:R>`);
      return;
    }

    let streak = player.daily_streak || 0;
    if (player.last_daily_at && now - player.last_daily_at > 2 * DAY_MS) {
      streak = 0;
    }
    streak = Math.min(streak + 1, STREAK_CAP);

    const baseYen = DAILY_YEN[player.grade] || 40;
    const streakBonus = (streak - 1) * STREAK_BONUS_PER;
    const totalYen = baseYen + streakBonus;

    const hpRestore = Math.floor(player.max_hp * 0.25);
    const ceRestore = Math.floor(player.max_ce * 0.25);

    db.update(players).set({
      yen: player.yen + totalYen,
      hp: Math.min(player.hp + hpRestore, player.max_hp),
      ce: Math.min(player.ce + ceRestore, player.max_ce),
      last_daily_at: now,
      daily_streak: streak,
    }).where(eq(players.discord_id, discordId)).run();

    const nextDaily = now + DAY_MS;
    const embed = new EmbedBuilder()
      .setTitle('📅 Daily Reward')
      .setColor(0xF1C40F)
      .setDescription(`**${totalYen} 💰** claimed (${baseYen} base + ${streakBonus} streak)`)
      .addFields(
        { name: '🔥 Streak', value: `${streak} day${streak > 1 ? 's' : ''}`, inline: true },
        { name: '❤️ HP Restored', value: `+${hpRestore}`, inline: true },
        { name: '💜 CE Restored', value: `+${ceRestore}`, inline: true },
      )
      .setFooter({ text: `Next daily: ${new Date(nextDaily).toLocaleString()}` });

    await interaction.editReply({ embeds: [embed] });
  },
};
