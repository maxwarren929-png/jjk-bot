const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { EQUIPMENT_ITEMS, getEnhancedBonuses, getEnhanceCost, getEnhanceSuccess, MAX_ENHANCE } = require('../data/equipment');

const ITEMS = {
  ...Object.fromEntries(Object.entries(EQUIPMENT_ITEMS).map(([k, v]) => [k, { type: 'equipment', ...v }])),
  CE_RESTORE_50: { type: 'consumable', name: '💜 CE Potion', desc: 'Restores 50 Cursed Energy. Use via `/inventory use`.', cost: 100 },
  HP_RESTORE_100: { type: 'consumable', name: '❤️‍🔥 HP Potion', desc: 'Restores 100 HP instantly. Also stores in inventory.', cost: 200 },
  CE_RESTORE_30: { type: 'consumable', name: '💚 CE Elixir', desc: 'Restores 30 Cursed Energy.', cost: 150 },
  EXIT_BROKEN: { type: 'consumable', name: '🧪 Healing Vial', desc: 'Exits Broken state and restores 50 HP.', cost: 500 },
  SILENCE_NEXT: { type: 'consumable', name: '🔇 Binding Ring', desc: 'Silences the enemy at the start of your next fight.', cost: 200 },
  BONUS_DAMAGE_20: { type: 'consumable', name: '🗡️ Split Soul Katana', desc: '+20 flat damage in your next fight.', cost: 300 },
};

module.exports = {
  data: new SlashCommandBuilder()
    .setName('iteminfo')
    .setDescription('View detailed information about any item.')
    .addStringOption(opt => opt.setName('item').setDescription('Item to inspect').setRequired(true)
      .addChoices(
        ...Object.entries(ITEMS).map(([k, v]) => ({ name: v.name, value: k })),
      )),

  async execute(interaction) {
    await interaction.deferReply();
    const key = interaction.options.getString('item');
    const item = ITEMS[key];
    if (!item) return interaction.editReply('❌ Unknown item.');

    const embed = new EmbedBuilder()
      .setTitle(item.name)
      .setColor(item.type === 'equipment' ? 0x9B59B6 : 0x2ECC71);

    if (item.type === 'equipment') {
      const base = getEnhancedBonuses(key, 0);
      const bonusLines = Object.entries(base).map(([k, v]) => `+${v} ${k.replace(/([A-Z])/g, ' $1').trim()}`).join(', ');
      embed.setDescription(item.desc)
        .addFields(
          { name: '📦 Type', value: `Equipment (${item.slot})`, inline: true },
          { name: '💰 Cost', value: `${item.cost} 💰`, inline: true },
          { name: '⚡ Bonuses', value: bonusLines || 'None', inline: false },
          { name: '🔧 Enhancement', value: `Max: +${MAX_ENHANCE}\nPer level: +30% stats\nCost: ${getEnhanceCost(key, 0)}–${getEnhanceCost(key, MAX_ENHANCE - 1)} 💜 CE\nSuccess: ${getEnhanceSuccess(0)}%–${getEnhanceSuccess(MAX_ENHANCE - 1)}%`, inline: false },
        );
    } else {
      embed.setDescription(item.desc)
        .addFields(
          { name: '📦 Type', value: 'Consumable', inline: true },
          { name: '💰 Cost', value: `${item.cost} 💰`, inline: true },
          { name: '📋 Usage', value: 'Buy from `/shop`. Use via `/inventory use`.', inline: false },
        );
    }

    await interaction.editReply({ embeds: [embed] });
  },
};
