const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { db } = require('../db/index');
const { players } = require('../db/schema');
const { desc, sql } = require('drizzle-orm');

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
          { name: '☠️ Bounty Kills', value: 'bounty' },
        )),

  async execute(interaction) {
    await interaction.deferReply();
    const type = interaction.options.getString('type') || 'wealth';

    let all;
    let title;
    let color;
    let formatRow;

    if (type === 'wins') {
      title = '🏆 Fight Wins Leaderboard';
      color = 0xE74C3C;
      all = db.select().from(players).orderBy(desc(players.fight_wins)).limit(10).all();
      if (!all.length) return interaction.editReply('❌ No players yet.');
      formatRow = (r, i) => `${medal(i)} <@${r.discord_id}> — **${r.fight_wins || 0} win${(r.fight_wins || 0) !== 1 ? 's' : ''}**\n`;
    } else if (type === 'grade') {
      title = '🏅 Grade Leaderboard';
      color = 0x9B59B6;
      all = db.select().from(players).all();
      if (!all.length) return interaction.editReply('❌ No players yet.');
      const ranked = all
        .map(p => ({ id: p.discord_id, grade: p.grade, gradeIdx: GRADE_ORDER.indexOf(p.grade), wins: p.fight_wins || 0 }))
        .sort((a, b) => b.gradeIdx - a.gradeIdx || b.wins - a.wins)
        .slice(0, 10);
      formatRow = (r, i) => `${medal(i)} <@${r.id}> — **${r.grade}** (${r.wins} win${r.wins !== 1 ? 's' : ''})\n`;
      all = ranked;
    } else if (type === 'bounty') {
      title = '☠️ Bounty Hunter Leaderboard';
      color = 0x2C3E50;
      all = db.select().from(players).orderBy(desc(players.bounty_kills)).all().filter(r => r.bounty_kills > 0).slice(0, 10);
      if (!all.length) return interaction.editReply('❌ No bounty kills yet.');
      formatRow = (r, i) => `${medal(i)} <@${r.discord_id}> — **${r.bounty_kills || 0}** bounty kill${(r.bounty_kills || 0) !== 1 ? 's' : ''}\n`;
    } else {
      title = '💰 Wealth Leaderboard';
      color = 0xF1C40F;
      all = db.select({
        discord_id: players.discord_id,
        yen: players.yen,
        bank_balance: players.bank_balance,
        total: sql`${players.yen} + ${players.bank_balance}`,
      }).from(players).orderBy(desc(sql`${players.yen} + ${players.bank_balance}`)).limit(10).all();
      if (!all.length) return interaction.editReply('❌ No players yet.');
      formatRow = (r, i) => `${medal(i)} <@${r.discord_id}> — **${r.total.toLocaleString()} 💰** (👛 ${r.yen.toLocaleString()} / 🏦 ${(r.bank_balance || 0).toLocaleString()})\n`;
    }

    function medal(i) {
      return i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`;
    }

    const embed = new EmbedBuilder()
      .setTitle(title)
      .setColor(color);

    let desc = '';
    for (let i = 0; i < all.length; i++) {
      desc += formatRow(all[i], i);
    }

    embed.setDescription(desc);
    await interaction.editReply({ embeds: [embed] });
  },
};
