const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { db } = require('../db/index');
const { players } = require('../db/schema');
const { eq } = require('drizzle-orm');
const { enhanceItem } = require('../systems/equipment');
const { getEquipmentItem, getEnhancedBonuses, getEnhanceCost, getEnhanceSuccess, MAX_ENHANCE } = require('../data/equipment');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('enhance')
    .setDescription('Enhance your equipped weapon or armor with CE.')
    .addStringOption(opt => opt.setName('slot').setDescription('Slot to enhance').setRequired(true)
      .addChoices(
        { name: 'Weapon', value: 'weapon' },
        { name: 'Armor', value: 'armor' },
      )),

  async execute(interaction) {
    await interaction.deferReply();
    const slot = interaction.options.getString('slot');
    const player = db.select().from(players).where(eq(players.discord_id, interaction.user.id)).get();
    if (!player) return interaction.editReply('❌ Run `/profile` first.');

    const result = enhanceItem(interaction.user.id, slot);
    if (result.error) return interaction.editReply(`❌ ${result.error}`);

    const def = getEquipmentItem(result.itemKey);
    const embed = new EmbedBuilder()
      .setColor(result.success ? 0x2ECC71 : 0xE74C3C);

    if (result.success) {
      const oldBonuses = getEnhancedBonuses(result.itemKey, result.oldLevel);
      const newBonuses = getEnhancedBonuses(result.itemKey, result.newLevel);
      const bonusLines = [];
      for (const [k, v] of Object.entries(newBonuses)) {
        const oldV = oldBonuses[k] || 0;
        bonusLines.push(`${k.replace(/([A-Z])/g, ' $1').trim()}: **${oldV}** → **${v}**`);
      }
      embed.setTitle(`✅ Enhancement Success!`)
        .setDescription(`**${def.name}** enhanced to **+${result.newLevel}** (${result.chance}% chance)\n\n${bonusLines.join('\n')}`);
    } else {
      embed.setTitle(`❌ Enhancement Failed`)
        .setDescription(`**${def.name}** stayed at **+${result.level}** (${result.chance}% chance). CE consumed.`);
    }
    embed.addFields({ name: '💜 CE Spent', value: `${result.cost}`, inline: true });
    await interaction.editReply({ embeds: [embed] });
  },
};
