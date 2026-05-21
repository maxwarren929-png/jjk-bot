const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { db, sqlite } = require('../db/index');
const { players } = require('../db/schema');
const { eq } = require('drizzle-orm');
const { SHOP_CATALOG, applyShopEffect } = require('../systems/economy');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('buy')
    .setDescription('Quick-buy an item from the shop.')
    .addStringOption(opt => opt.setName('item').setDescription('Item to buy').setRequired(true).setAutocomplete(true)),

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
    const discordId = interaction.user.id;
    const itemId = interaction.options.getString('item');

    const item = SHOP_CATALOG.find(i => i.id === itemId);
    if (!item) return interaction.editReply('❌ Item not found in the shop.');

    const player = db.select().from(players).where(eq(players.discord_id, discordId)).get();
    if (!player) return interaction.editReply('❌ Run `/profile` first.');
    if (player.yen < item.cost) return interaction.editReply(`❌ Not enough yen. Need **${item.cost} 💰**, have **${player.yen} 💰**.`);

    const result = applyShopEffect(player, itemId);
    if (result.error) return interaction.editReply(`❌ ${result.error}`);

    if (result.needsTechniquePick) {
      return interaction.editReply('❌ Please use `/shop browse` to pick a technique when buying a Forbidden Scroll.');
    }

    const freshPlayer = db.select().from(players).where(eq(players.discord_id, discordId)).get();
    const embed = new EmbedBuilder()
      .setTitle(`✅ Purchased: ${item.name}`)
      .setColor(0x2ECC71)
      .setDescription(item.description)
      .addFields({ name: 'Remaining Yen', value: `${freshPlayer.yen} 💰`, inline: true });
    if (result.newTechniqueId) {
      embed.addFields({ name: '🎲 New Technique', value: `Assigned: **${result.newTechniqueId}**`, inline: true });
    }

    await interaction.editReply({ embeds: [embed] });
  },
};
