const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { db } = require('../db/index');
const { players } = require('../db/schema');
const { eq } = require('drizzle-orm');

const GRADE_ORDER = ['Grade 4', 'Grade 3', 'Grade 2', 'Grade 1', 'Semi-Special Grade', 'Special Grade'];
const GRADE_THRESHOLDS = {
  'Grade 4': { wins: 5, next: 'Grade 3' },
  'Grade 3': { wins: 15, next: 'Grade 2' },
  'Grade 2': { wins: 30, next: 'Grade 1' },
  'Grade 1': { wins: 60, next: 'Semi-Special Grade' },
  'Semi-Special Grade': { wins: 100, next: 'Special Grade' },
};

const GRADE_DESC = {
  'Grade 4': 'Bottom of the barrel. Still learning to control your cursed energy.',
  'Grade 3': 'Recognized as a capable sorcerer. The bare minimum.',
  'Grade 2': 'A reliable fighter. Most missions are entrusted to this rank.',
  'Grade 1': 'Elite. You lead missions and mentor lower grades.',
  'Semi-Special Grade': 'Rare. Only a handful exist. You are a national asset.',
  'Special Grade': 'A living calamity. Nations tread carefully around you.',
};

module.exports = {
  data: new SlashCommandBuilder()
    .setName('rankup')
    .setDescription('Check your grade progression and requirements.')
    .addUserOption(opt => opt.setName('user').setDescription('Player to check (defaults to you)').setRequired(false)),

  async execute(interaction) {
    await interaction.deferReply();
    const targetUser = interaction.options.getUser('user') || interaction.user;
    const player = db.select().from(players).where(eq(players.discord_id, targetUser.id)).get();
    if (!player) {
      await interaction.editReply(targetUser.id === interaction.user.id
        ? '❌ Run `/profile` first.'
        : `❌ **${targetUser.username}** has no profile.`);
      return;
    }

    const currentIdx = GRADE_ORDER.indexOf(player.grade);
    const threshold = GRADE_THRESHOLDS[player.grade];
    const atMax = currentIdx >= GRADE_ORDER.length - 1;
    const wins = player.fight_wins || 0;

    const embed = new EmbedBuilder()
      .setTitle(`🏅 ${targetUser.username}'s Grade Progression`)
      .setColor(0x9B59B6)
      .setDescription(GRADE_DESC[player.grade] || '');

    const progressBar = buildSmallBar(Math.min(wins / (threshold?.wins || 1), 1));
    const progressText = threshold
      ? `${wins} / ${threshold.wins} wins — ${progressBar}`
      : 'MAX GRADE';

    embed.addFields(
      { name: '📍 Current Grade', value: `**${player.grade}**`, inline: true },
      { name: '🏆 Wins', value: `${wins}`, inline: true },
      { name: atMax ? '🎉 MAXED' : '⬆️ Next Grade', value: atMax ? 'You are the highest possible grade!' : `**${threshold.next}** (${progressText})`, inline: false },
    );

    // Show all grades as roadmap
    let roadmap = '';
    for (let i = 0; i < GRADE_ORDER.length; i++) {
      const g = GRADE_ORDER[i];
      const t = GRADE_THRESHOLDS[g];
      const isCurrent = g === player.grade;
      const isPast = currentIdx > i;
      const prefix = isCurrent ? '📍 **' : isPast ? '✅ ' : '⬜ ';
      const suffix = isCurrent ? '** ← You are here' : isPast ? '' : t ? ` (${t.wins} wins)` : ' (MAX)';
      roadmap += `${prefix}${g}${suffix}\n`;
    }
    embed.addFields({ name: '📋 Full Roadmap', value: roadmap, inline: false });

    await interaction.editReply({ embeds: [embed] });
  },
};

function buildSmallBar(pct) {
  const filled = Math.round(Math.max(0, Math.min(1, pct)) * 10);
  return '🟪'.repeat(filled) + '⬛'.repeat(10 - filled);
}
