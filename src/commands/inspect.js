const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { db } = require('../db/index');
const { players } = require('../db/schema');
const { eq } = require('drizzle-orm');
const { getTechniqueById } = require('../systems/techniques');
const { getEquipmentBonuses } = require('../systems/equipment');

const GRADE_EMOJI = {
  'Grade 4': '🔵', 'Grade 3': '🟢', 'Grade 2': '🟡',
  'Grade 1': '🟠', 'Semi-Special Grade': '🔴', 'Special Grade': '👁️',
};

module.exports = {
  data: new SlashCommandBuilder()
    .setName('inspect')
    .setDescription('View another player\'s equipment, grade, and basic stats.')
    .addUserOption(o => o.setName('user').setDescription('Player to inspect').setRequired(true)),

  async execute(interaction) {
    await interaction.deferReply();
    const targetUser = interaction.options.getUser('user');

    const player = db.select().from(players).where(eq(players.discord_id, targetUser.id)).get();
    if (!player) return interaction.editReply(`❌ **${targetUser.username}** has no profile.`);

    const gradeEmoji = GRADE_EMOJI[player.grade] || '❓';
    const bonuses = getEquipmentBonuses(player.discord_id);
    const innate = player.innate_technique_id ? getTechniqueById(player.innate_technique_id) : null;

    const embed = new EmbedBuilder()
      .setTitle(`${gradeEmoji} ${targetUser.username}'s Profile`)
      .setColor(0x9B59B6)
      .addFields(
        { name: '🎖️ Grade', value: player.grade, inline: true },
        { name: '❤️ HP', value: `${player.hp}/${player.max_hp}`, inline: true },
        { name: '💜 CE', value: `${player.ce}/${player.max_ce}`, inline: true },
        { name: '💰 Yen', value: `${player.yen.toLocaleString()} 💰`, inline: true },
        { name: '🏆 Fights', value: `${player.fight_wins || 0}W / ${player.fight_losses || 0}L`, inline: true },
        { name: '🎯 Bounty Kills', value: `${player.bounty_kills || 0}`, inline: true },
      );

    if (innate) {
      embed.addFields({ name: '🔮 Innate Technique', value: innate.name || 'Unknown', inline: false });
    }

    const bonusLines = [];
    if (bonuses.bonusDamage > 0) bonusLines.push(`🗡️ **+${bonuses.bonusDamage}** damage`);
    if (bonuses.damageReduction > 0) bonusLines.push(`🛡️ **${Math.round(bonuses.damageReduction * 100)}%** damage reduction`);
    if (bonuses.bonusMaxHp > 0) bonusLines.push(`❤️ **+${bonuses.bonusMaxHp}** max HP`);
    if (bonuses.bonusMaxCe > 0) bonusLines.push(`💜 **+${bonuses.bonusMaxCe}** max CE`);

    if (bonusLines.length > 0) {
      embed.addFields({ name: '⚔️ Equipment Bonuses', value: bonusLines.join('\n'), inline: false });
    }

    if (player.is_broken) {
      embed.addFields({ name: '💀 Status', value: '**BROKEN**', inline: false });
    }

    embed.setFooter({ text: `${player.grade} sorcerer` });
    await interaction.editReply({ embeds: [embed] });
  },
};
