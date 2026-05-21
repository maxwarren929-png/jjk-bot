const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { db } = require('../db/index');
const { players } = require('../db/schema');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('leaderboard')
    .setDescription('View the wealth leaderboard.'),

  async execute(interaction) {
    await interaction.deferReply();

    const all = db.select().from(players).all();
    const ranked = all
      .map(p => ({ id: p.discord_id, name: p.username, total: p.yen + (p.bank_balance || 0), wallet: p.yen, bank: p.bank_balance || 0 }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 10);

    if (!ranked.length) return interaction.editReply('❌ No players yet.');

    const embed = new EmbedBuilder()
      .setTitle('🏆 Wealth Leaderboard')
      .setColor(0xF1C40F);

    let desc = '';
    for (let i = 0; i < ranked.length; i++) {
      const r = ranked[i];
      const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`;
      desc += `${medal} <@${r.id}> — **${r.total.toLocaleString()} 💰** (👛 ${r.wallet.toLocaleString()} / 🏦 ${r.bank.toLocaleString()})\n`;
    }

    embed.setDescription(desc);
    await interaction.editReply({ embeds: [embed] });
  },
};
