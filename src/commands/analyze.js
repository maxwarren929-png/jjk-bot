const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { db } = require('../db/index');
const { players } = require('../db/schema');
const { eq } = require('drizzle-orm');
const { getEquipmentBonuses } = require('../systems/equipment');
const { getTechsForPlayer } = require('../systems/combat');
const { GRADE_ORDER } = require('../data/techniques');

function safeParse(val) {
  try { return JSON.parse(val || '{}'); } catch { return {}; }
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('analyze')
    .setDescription('Scout another player\'s combat readiness.')
    .addUserOption(o => o.setName('target').setDescription('Player to analyze').setRequired(true)),

  async execute(interaction) {
    await interaction.deferReply();
    const targetUser = interaction.options.getUser('target');
    if (!targetUser) return interaction.editReply('❌ Target not found.');
    if (targetUser.bot) return interaction.editReply('❌ Cannot analyze a bot.');

    const player = db.select().from(players).where(eq(players.discord_id, targetUser.id)).get();
    if (!player) return interaction.editReply(`❌ **${targetUser.username}** has not created a profile.`);

    const bonuses = getEquipmentBonuses(targetUser.id);
    const maxHp = player.max_hp + (bonuses.bonusMaxHp || 0);
    const maxCe = player.max_ce + (bonuses.bonusMaxCe || 0);
    const job = safeParse(player.job_data);
    const elo = job.__elo || 1000;
    const techs = getTechsForPlayer(player);
    const techList = techs.length > 0 ? techs.slice(0, 5).map(t => t.name).join(', ') : 'None';

    const embed = new EmbedBuilder()
      .setTitle(`🔍 Analysis: ${player.username}`)
      .setColor(0x9B59B6)
      .addFields(
        { name: '📊 Grade', value: player.grade, inline: true },
        { name: '💀 Status', value: player.is_broken ? '🔴 Broken' : '🟢 Active', inline: true },
        { name: '🏆 ELO', value: `${elo}`, inline: true },
        { name: '❤️ HP', value: `${player.hp}/${maxHp}`, inline: true },
        { name: '💜 CE', value: `${player.ce}/${maxCe}`, inline: true },
        { name: '💰 Wallet', value: `${player.yen} 💰`, inline: true },
        { name: '⚔️ Techniques', value: techList, inline: false },
        { name: '🛡️ W/L', value: `${player.fight_wins}W / ${player.fight_losses}L`, inline: true },
        { name: '🎯 Grade Index', value: `${GRADE_ORDER.indexOf(player.grade) + 1}/${GRADE_ORDER.length}`, inline: true },
      );
    await interaction.editReply({ embeds: [embed] });
  },
};
