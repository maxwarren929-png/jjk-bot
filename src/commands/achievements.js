const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { db } = require('../db/index');
const { players } = require('../db/schema');
const { eq } = require('drizzle-orm');
const { getPlayerAchievements, ACHIEVEMENTS } = require('../systems/achievements');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('achievements')
    .setDescription('View your earned achievements and progress.')
    .addUserOption(opt => opt.setName('user').setDescription('Player to inspect (defaults to you)').setRequired(false)),

  async execute(interaction) {
    await interaction.deferReply();
    const targetUser = interaction.options.getUser('user') || interaction.user;
    const player = db.select().from(players).where(eq(players.discord_id, targetUser.id)).get();
    if (!player) return interaction.editReply(`❌ **${targetUser.username}** has no profile.`);

    const unlocked = getPlayerAchievements(targetUser.id);
    const count = unlocked.length;
    const total = ACHIEVEMENTS.length;

    const embed = new EmbedBuilder()
      .setTitle(`🏆 ${targetUser.username}'s Achievements`)
      .setColor(0xF1C40F)
      .setDescription(`**${count}/${total}** achievements unlocked (${Math.round(count / total * 100)}%)`);

    const categories = {};
    for (const a of ACHIEVEMENTS) {
      if (!categories[a.category]) categories[a.category] = [];
      const has = unlocked.find(u => u.achievement_id === a.id);
      categories[a.category].push(`${has ? `${a.icon} **${a.name}**` : `🔒 ${a.name}`} — ${a.description}`);
    }

    for (const [cat, items] of Object.entries(categories)) {
      embed.addFields({ name: cat.charAt(0).toUpperCase() + cat.slice(1), value: items.join('\n'), inline: false });
    }

    await interaction.editReply({ embeds: [embed] });
  },
};
