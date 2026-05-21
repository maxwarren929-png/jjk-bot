const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { db } = require('../db/index');
const { players } = require('../db/schema');

const GRADE_ORDER = ['Grade 4', 'Grade 3', 'Grade 2', 'Grade 1', 'Semi-Special Grade', 'Special Grade'];

module.exports = {
  data: new SlashCommandBuilder()
    .setName('leaderboard')
    .setDescription('View the leaderboard.')
    .addStringOption(opt =>
      opt.setName('type')
        .setDescription('Ranking type')
        .setRequired(false)
        .addChoices(
          { name: '💰 Wealth (yen + bank)', value: 'wealth' },
          { name: '🏆 Fight Wins', value: 'wins' },
          { name: '🏅 Grade', value: 'grade' },
        )),

  async execute(interaction) {
    await interaction.deferReply();
    const type = interaction.options.getString('type') || 'wealth';

    const all = db.select().from(players).all();
    if (!all.length) return interaction.editReply('❌ No players yet.');

    let ranked;
    let title;
    let color;
    let formatRow;

    if (type === 'wins') {
      title = '🏆 Fight Wins Leaderboard';
      color = 0xE74C3C;
      ranked = all
        .map(p => ({ id: p.discord_id, name: p.username, wins: p.fight_wins || 0 }))
        .sort((a, b) => b.wins - a.wins)
        .slice(0, 10);
      formatRow = (r, i) => `${medal(i)} <@${r.id}> — **${r.wins} win${r.wins !== 1 ? 's' : ''}**\n`;
    } else if (type === 'grade') {
      title = '🏅 Grade Leaderboard';
      color = 0x9B59B6;
      ranked = all
        .map(p => ({ id: p.discord_id, name: p.username, grade: p.grade, gradeIdx: GRADE_ORDER.indexOf(p.grade), wins: p.fight_wins || 0 }))
        .sort((a, b) => b.gradeIdx - a.gradeIdx || b.wins - a.wins)
        .slice(0, 10);
      formatRow = (r, i) => `${medal(i)} <@${r.id}> — **${r.grade}** (${r.wins} win${r.wins !== 1 ? 's' : ''})\n`;
    } else {
      title = '💰 Wealth Leaderboard';
      color = 0xF1C40F;
      ranked = all
        .map(p => ({ id: p.discord_id, name: p.username, total: p.yen + (p.bank_balance || 0), wallet: p.yen, bank: p.bank_balance || 0 }))
        .sort((a, b) => b.total - a.total)
        .slice(0, 10);
      formatRow = (r, i) => `${medal(i)} <@${r.id}> — **${r.total.toLocaleString()} 💰** (👛 ${r.wallet.toLocaleString()} / 🏦 ${r.bank.toLocaleString()})\n`;
    }

    function medal(i) {
      return i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`;
    }

    const embed = new EmbedBuilder()
      .setTitle(title)
      .setColor(color);

    let desc = '';
    for (let i = 0; i < ranked.length; i++) {
      desc += formatRow(ranked[i], i);
    }

    embed.setDescription(desc);
    await interaction.editReply({ embeds: [embed] });
  },
};
