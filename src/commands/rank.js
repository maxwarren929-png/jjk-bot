const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { db } = require('../db/index');
const { players } = require('../db/schema');
const { eq, desc } = require('drizzle-orm');

const RATING_K = 32;

function calculateElo(rating, opponentRating, score) {
  const expected = 1 / (1 + Math.pow(10, (opponentRating - rating) / 400));
  return Math.round(rating + RATING_K * (score - expected));
}

function getOrInitRating(player) {
  const job = (() => { try { return JSON.parse(player.job_data || '{}'); } catch { return {}; } })();
  return job.__elo || 1000;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('rank')
    .setDescription('View your PvP rank and rating.')
    .addUserOption(opt => opt.setName('user').setDescription('Player to check (defaults to you)').setRequired(false)),

  async execute(interaction) {
    await interaction.deferReply();
    const targetUser = interaction.options.getUser('user') || interaction.user;
    const player = db.select().from(players).where(eq(players.discord_id, targetUser.id)).get();
    if (!player) return interaction.editReply(`❌ **${targetUser.username}** has no profile.`);

    const rating = getOrInitRating(player);
    const all = db.select().from(players).orderBy(desc(players.fight_wins)).all();
    const sorted = all
      .map(p => ({ id: p.discord_id, rating: getOrInitRating(p), wins: p.fight_wins || 0, losses: p.fight_losses || 0 }))
      .sort((a, b) => b.rating - a.rating);
    const rank = sorted.findIndex(s => s.id === player.discord_id) + 1;
    const total = sorted.length;

    const embed = new EmbedBuilder()
      .setTitle(`🏆 ${targetUser.username}'s PvP Rank`)
      .setColor(0xF1C40F)
      .addFields(
        { name: '📊 Rating', value: `**${rating}**`, inline: true },
        { name: '🎯 Rank', value: `**#${rank}** / ${total}`, inline: true },
        { name: '⚔️ Record', value: `${player.fight_wins || 0}W / ${player.fight_losses || 0}L`, inline: true },
      );
    await interaction.editReply({ embeds: [embed] });
  },
};
