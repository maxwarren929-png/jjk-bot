const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { db } = require('../db/index');
const { players } = require('../db/schema');
const { eq } = require('drizzle-orm');
const { formatEquipmentEmbed, getEquipmentBonuses } = require('../systems/equipment');
const { EQUIPMENT_ITEMS } = require('../data/equipment');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('equipment')
    .setDescription('View your currently equipped weapons and armor.'),

  async execute(interaction) {
    await interaction.deferReply();
    const player = db.select().from(players).where(eq(players.discord_id, interaction.user.id)).get();
    if (!player) return interaction.editReply('❌ Run `/profile` first.');

    const eqText = formatEquipmentEmbed(interaction.user.id);
    const bonuses = getEquipmentBonuses(interaction.user.id);

    const bonusLines = [];
    if (bonuses.bonusDamage) bonusLines.push(`🗡️ **+${bonuses.bonusDamage}** damage per attack`);
    if (bonuses.damageReduction) bonusLines.push(`🛡️ **-${Math.round(bonuses.damageReduction * 100)}%** incoming damage`);
    if (bonuses.bonusMaxCe) bonusLines.push(`💜 **+${bonuses.bonusMaxCe}** max CE`);
    if (bonuses.bonusMaxHp) bonusLines.push(`❤️ **+${bonuses.bonusMaxHp}** max HP`);

    const embed = new EmbedBuilder()
      .setTitle(`⚔️ ${interaction.user.username}'s Equipment`)
      .setColor(0x9B59B6)
      .setDescription(eqText);

    if (bonusLines.length > 0) {
      embed.addFields({ name: '✨ Active Bonuses', value: bonusLines.join('\n'), inline: false });
    }
    embed.addFields(
      { name: '📦 Inventory', value: 'Use `/inventory equip/unequip` to change gear.', inline: false },
      { name: '🔧 Enhancement', value: 'Use `/enhance <slot>` to upgrade with CE.', inline: false },
      { name: '📚 Collection', value: 'Use `/collection` to browse all items.', inline: false },
    );

    await interaction.editReply({ embeds: [embed] });
  },
};
