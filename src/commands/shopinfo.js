const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { SHOP_CATALOG } = require('../systems/economy');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('shopinfo')
    .setDescription('View detailed information about a shop item.')
    .addStringOption(opt => opt.setName('item').setDescription('Item to inspect').setRequired(true).setAutocomplete(true)),

  async autocomplete(interaction) {
    const focused = interaction.options.getFocused().toLowerCase();
    const filtered = SHOP_CATALOG
      .filter(i => i.name.toLowerCase().includes(focused) || i.id.includes(focused))
      .slice(0, 25)
      .map(i => ({ name: `${i.name} — ${i.cost} 💰`, value: i.id }));
    await interaction.respond(filtered);
  },

  async execute(interaction) {
    await interaction.deferReply();
    const itemId = interaction.options.getString('item');
    const item = SHOP_CATALOG.find(i => i.id === itemId);
    if (!item) return interaction.editReply('❌ Item not found in the shop.');

    const effectLabels = {
      CE_RESTORE_50: '💜 Restores 50 CE when used via `/inventory use`.',
      SILENCE_NEXT: '🔇 Silences the enemy\'s next attack. Consumed on use.',
      BONUS_DAMAGE_20: '🗡️ +20 flat damage on all attacks for your next fight.',
      REROLL_INNATE: '🎲 Permanently replaces your innate technique with a random one. All variants are lost.',
      EXIT_BROKEN: '💊 Immediately exits Broken state and restores 50 HP.',
      UPGRADE_ROD: '🎣 Increases your fishing rod level by 1 for better catches.',
      UPGRADE_AXE: '🪓 Increases your lumber axe level by 1 for more yen per chop.',
      UNLOCK_ANY: '📜 Unlocks any technique of your choice — regardless of your innate.',
    };

    const embed = new EmbedBuilder()
      .setTitle(`🏪 ${item.name}`)
      .setColor(0xF1C40F)
      .setDescription(item.description)
      .addFields(
        { name: '💰 Price', value: `${item.cost} 💰`, inline: true },
        { name: '♻️ Sell Price', value: `${Math.floor(item.cost * 0.5)} 💰`, inline: true },
        { name: '🏷️ Type', value: item.type || item.effect, inline: true },
        { name: '⚡ Effect', value: effectLabels[item.effect] || item.effect, inline: false },
      );

    await interaction.editReply({ embeds: [embed] });
  },
};
