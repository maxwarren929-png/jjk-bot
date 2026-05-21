const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { db } = require('../db/index');
const { players, clans, bounties } = require('../db/schema');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('info')
    .setDescription('View bot information and server statistics.'),

  async execute(interaction) {
    await interaction.deferReply();

    const allPlayers = db.select().from(players).all();
    const totalPlayers = allPlayers.length;
    const totalYen = allPlayers.reduce((s, p) => s + p.yen + (p.bank_balance || 0), 0);
    const totalWins = allPlayers.reduce((s, p) => s + p.fight_wins, 0);
    const totalLosses = allPlayers.reduce((s, p) => s + p.fight_losses, 0);
    const brokenPlayers = allPlayers.filter(p => p.is_broken).length;
    const specialGrade = allPlayers.filter(p => p.grade === 'Special Grade').length;
    const allClans = db.select().from(clans).all();
    const allBounties = db.select().from(bounties).all();
    const totalBountyValue = allBounties.reduce((s, b) => s + b.amount, 0);
    const commandsLoaded = interaction.client.commands?.size || 0;

    const embed = new EmbedBuilder()
      .setTitle('📊 Cursed Energy Bot — Info')
      .setColor(0x9B59B6)
      .setDescription('Server-wide statistics and bot information.')
      .addFields(
        { name: '👥 Players', value: `**Total:** ${totalPlayers}\n**Broken:** ${brokenPlayers}\n**Special Grade:** ${specialGrade}`, inline: true },
        { name: '⚔️ Combat', value: `**Total fights:** ${totalWins + totalLosses}\n**Wins:** ${totalWins}\n**Losses:** ${totalLosses}`, inline: true },
        { name: '🏛️ Economy', value: `**💰 Total yen:** ${totalYen.toLocaleString()}\n**🏛️ Clans:** ${allClans.length}\n**🎯 Bounties:** ${allBounties.length} (${totalBountyValue.toLocaleString()} 💰)`, inline: true },
        { name: '🤖 Bot', value: `**Commands loaded:** ${commandsLoaded}\n**Library:** discord.js v14\n**Runtime:** Node.js`, inline: true },
      )
      .setFooter({ text: `Requested by ${interaction.user.username}`, iconURL: interaction.user.displayAvatarURL() })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  },
};
