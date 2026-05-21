const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { db } = require('../db/index');
const { players, bounties } = require('../db/schema');
const { eq } = require('drizzle-orm');

const DAY_MS = 24 * 60 * 60 * 1000;

module.exports = {
  data: new SlashCommandBuilder()
    .setName('today')
    .setDescription('View your activity summary for today.'),

  async execute(interaction) {
    await interaction.deferReply();
    const player = db.select().from(players).where(eq(players.discord_id, interaction.user.id)).get();
    if (!player) return interaction.editReply('❌ Run `/profile` first.');

    const now = Date.now();
    const todayStart = now - DAY_MS;

    const job = (() => { try { return JSON.parse(player.job_data || '{}'); } catch { return {}; } })();
    const lastFight = job.__last_fight || null;
    const masteries = job.__mastery || {};
    const totalMasteryUses = Object.values(masteries).reduce((a, b) => a + b, 0);

    let fightsToday = 0;
    if (lastFight && lastFight.time > todayStart) fightsToday = 1;

    const allPlayers = db.select().from(players).all();
    const totalYen = allPlayers.reduce((s, p) => s + p.yen + (p.bank_balance || 0), 0);
    const totalPlayers = allPlayers.filter(p => p.created_at < now).length;

    const allBounties = db.select().from(bounties).all();
    const totalBountyValue = allBounties.reduce((s, b) => s + b.amount, 0);

    const embed = new EmbedBuilder()
      .setTitle(`📊 ${interaction.user.username}'s Daily Recap`)
      .setColor(0x3498DB)
      .addFields(
        { name: '👤 Your Profile', value: `**Grade:** ${player.grade}\n**Wins:** ${player.fight_wins} | **Losses:** ${player.fight_losses}\n**💰 Total:** ${(player.yen + (player.bank_balance || 0)).toLocaleString()}`, inline: true },
        { name: '⚔️ Combat', value: `**Fights today:** ${fightsToday}\n**Technique mastery uses:** ${totalMasteryUses}\n**Bounty kills:** ${player.bounty_kills || 0}`, inline: true },
        { name: '📈 Server Stats', value: `**Players:** ${totalPlayers}\n**💰 Economy:** ${totalYen.toLocaleString()} yen\n**🎯 Active bounties:** ${allBounties.length} (${totalBountyValue.toLocaleString()} 💰)`, inline: true },
      );

    const nowH = new Date(now).getHours();
    const period = nowH < 12 ? 'morning' : nowH < 18 ? 'afternoon' : 'evening';
    embed.setFooter({ text: `Good ${period}, ${interaction.user.username}! Keep grinding.` });

    await interaction.editReply({ embeds: [embed] });
  },
};
