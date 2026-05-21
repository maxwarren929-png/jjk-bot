const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { db } = require('../db/index');
const { players, clans, bounties } = require('../db/schema');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('stats')
    .setDescription('View server-wide statistics.'),

  async execute(interaction) {
    await interaction.deferReply();

    const allPlayers = db.select().from(players).all();
    const allClans = db.select().from(clans).all();
    const allBounties = db.select().from(bounties).all();

    const totalPlayers = allPlayers.length;
    const totalYen = allPlayers.reduce((s, p) => s + p.yen + (p.bank_balance || 0), 0);
    const totalWins = allPlayers.reduce((s, p) => s + (p.fight_wins || 0), 0);
    const totalBounties = allBounties.length;
    const totalBountyValue = allBounties.reduce((s, b) => s + b.amount, 0);
    const brokenPlayers = allPlayers.filter(p => p.is_broken).length;
    const clanPlayers = allPlayers.filter(p => p.clan_id).length;
    const gradeCounts = {};
    for (const p of allPlayers) {
      gradeCounts[p.grade] = (gradeCounts[p.grade] || 0) + 1;
    }
    const gradeList = ['Grade 4', 'Grade 3', 'Grade 2', 'Grade 1', 'Semi-Special Grade', 'Special Grade'];
    const gradeChart = gradeList.filter(g => gradeCounts[g]).map(g => `${g}: **${gradeCounts[g]}**`).join('\n');

    const embed = new EmbedBuilder()
      .setTitle('📊 Cursed Energy Bot — Server Stats')
      .setColor(0x9B59B6)
      .addFields(
        { name: '👤 Total Players', value: `${totalPlayers}`, inline: true },
        { name: '🏰 Clans', value: `${allClans.length}`, inline: true },
        { name: '🤝 Clanned Players', value: `${clanPlayers}`, inline: true },
        { name: '💰 Total Wealth', value: `${totalYen.toLocaleString()} 💰`, inline: true },
        { name: '🏆 Total Fight Wins', value: `${totalWins}`, inline: true },
        { name: '💀 Broken Players', value: `${brokenPlayers}`, inline: true },
        { name: '🎯 Active Bounties', value: `${totalBounties} (${totalBountyValue.toLocaleString()} 💰)`, inline: false },
        { name: '🏅 Grade Distribution', value: gradeChart || 'None', inline: false },
      )
      .setFooter({ text: `${interaction.guild?.name || 'Server'} stats` });

    await interaction.editReply({ embeds: [embed] });
  },
};
