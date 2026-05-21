const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { db, sqlite } = require('../db/index');
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
    .setDescription('Claim your daily reward.')
    .addSubcommand(sub => sub.setName('claim').setDescription('Claim your daily reward.'))
    .addSubcommand(sub => sub.setName('info').setDescription('Check your daily streak and next claim info.')),

  async execute(interaction) {
    await interaction.deferReply();
    const discordId = interaction.user.id;
    const player = db.select().from(players).where(eq(players.discord_id, discordId)).get();
    if (!player) {
      await interaction.editReply('❌ Run `/profile` first.');
      return;
    }

    const sub = interaction.options.getSubcommand();
    const now = Date.now();

    if (sub === 'info') {
      let streak = player.daily_streak || 0;
      if (player.last_daily_at && now - player.last_daily_at > 2 * DAY_MS) {
        streak = 0;
      }
      const baseYen = DAILY_YEN[player.grade] || 40;
      const nextBonus = streak >= STREAK_CAP ? 0 : streak * STREAK_BONUS_PER;
      const nextTotal = baseYen + nextBonus;
      const canClaim = !player.last_daily_at || now - player.last_daily_at >= DAY_MS;
      const embed = new EmbedBuilder()
        .setTitle('📅 Daily Streak')
        .setColor(0xF1C40F)
        .addFields(
          { name: '🔥 Current Streak', value: `${streak} day${streak > 1 ? 's' : ''}`, inline: true },
          { name: '🏅 Grade', value: player.grade, inline: true },
          { name: '💰 Next Claim', value: canClaim ? '**Ready now!**' : `<t:${Math.floor((player.last_daily_at + DAY_MS) / 1000)}:R>`, inline: false },
          { name: '📊 Next Reward', value: `**${nextTotal} 💰** (${baseYen} base + ${nextBonus} streak bonus)`, inline: false },
        );
      if (streak < STREAK_CAP) {
        embed.setFooter({ text: `Max streak: ${STREAK_CAP} days (+${(STREAK_CAP - 1) * STREAK_BONUS_PER} bonus)` });
      } else {
        embed.setFooter({ text: '🔥 Max streak reached! All future claims at max bonus.' });
      }
      return interaction.editReply({ embeds: [embed] });
    }

    // claim — all logic inside transaction to prevent race
    let totalYen = 0, streak = 0, hpRestore = 0, ceRestore = 0, base = 0, bonus = 0;
    let alreadyClaimed = false;
    sqlite.transaction(() => {
      const fPlayer = db.select().from(players).where(eq(players.discord_id, discordId)).get();
      if (!fPlayer) return;
      if (fPlayer.last_daily_at && Date.now() - fPlayer.last_daily_at < DAY_MS) {
        alreadyClaimed = true;
        return;
      }
      let s = fPlayer.daily_streak || 0;
      if (fPlayer.last_daily_at && Date.now() - fPlayer.last_daily_at > 2 * DAY_MS) {
        s = 0;
      }
      s = Math.min(s + 1, STREAK_CAP);
      base = DAILY_YEN[fPlayer.grade] || 40;
      bonus = (s - 1) * STREAK_BONUS_PER;
      const total = base + bonus;
      const hp = Math.floor(fPlayer.max_hp * 0.25);
      const ce = Math.floor(fPlayer.max_ce * 0.25);
      db.update(players).set({
        yen: fPlayer.yen + total,
        hp: Math.min(fPlayer.hp + hp, fPlayer.max_hp),
        ce: Math.min(fPlayer.ce + ce, fPlayer.max_ce),
        last_daily_at: Date.now(),
        daily_streak: s,
      }).where(eq(players.discord_id, discordId)).run();
      totalYen = total;
      streak = s;
      hpRestore = hp;
      ceRestore = ce;
    })();

    if (alreadyClaimed) {
      const next = new Date(player.last_daily_at + DAY_MS);
      return interaction.editReply(`⏳ Daily already claimed. Next claim: <t:${Math.floor(next / 1000)}:R>`);
    }

    const nextDaily = now + DAY_MS;
    const embed = new EmbedBuilder()
      .setTitle('📅 Daily Reward')
      .setColor(0xF1C40F)
      .setDescription(`**${totalYen} 💰** claimed (${base} base + ${bonus} streak)`)
      .addFields(
        { name: '🔥 Streak', value: `${streak} day${streak > 1 ? 's' : ''}`, inline: true },
        { name: '❤️ HP Restored', value: `+${hpRestore}`, inline: true },
        { name: '💜 CE Restored', value: `+${ceRestore}`, inline: true },
      )
      .setFooter({ text: `Next daily: ${new Date(nextDaily).toLocaleString()}` });

    await interaction.editReply({ embeds: [embed] });
  },
};
