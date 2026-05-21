const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { db, sqlite } = require('../db/index');
const { players } = require('../db/schema');
const { eq } = require('drizzle-orm');
const { SHOP_CATALOG, applyShopEffect } = require('../systems/economy');

const NON_STACKABLE = ['REROLL_INNATE', 'UNLOCK_ANY', 'UPGRADE_ROD', 'UPGRADE_AXE'];
const INVENTORY_ITEMS = ['CE_RESTORE_50', 'HP_RESTORE_100', 'CE_RESTORE_30', 'SILENCE_NEXT', 'BONUS_DAMAGE_20', 'EXIT_BROKEN'];

module.exports = {
  data: new SlashCommandBuilder()
    .setName('buy')
    .setDescription('Quick-buy an item from the shop.')
    .addStringOption(opt => opt.setName('item').setDescription('Item to buy').setRequired(true).setAutocomplete(true))
    .addIntegerOption(opt => opt.setName('quantity').setDescription('How many to buy (default 1, max 10)').setMinValue(1).setMaxValue(10).setRequired(false)),

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
    const qty = interaction.options.getInteger('quantity') || 1;

    const item = SHOP_CATALOG.find(i => i.id === itemId);
    if (!item) return interaction.editReply('❌ Item not found in the shop.');

    if (NON_STACKABLE.includes(item.effect) && qty > 1) {
      return interaction.editReply(`❌ You can only buy 1 **${item.name}** at a time.`);
    }

    const player = db.select().from(players).where(eq(players.discord_id, discordId)).get();
    if (!player) return interaction.editReply('❌ Run `/profile` first.');

    const totalCost = item.cost * qty;
    if (player.yen < totalCost) return interaction.editReply(`❌ Not enough yen. Need **${totalCost} 💰**, have **${player.yen} 💰**.`);

    if (qty === 1) {
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
      return;
    }

    // Bulk purchase for inventory items
    if (!INVENTORY_ITEMS.includes(item.effect)) {
      return interaction.editReply(`❌ **${item.name}** cannot be bought in bulk. Use quantity 1.`);
    }

    let success = false;
    sqlite.transaction(() => {
      const fresh = db.select().from(players).where(eq(players.discord_id, discordId)).get();
      if (!fresh || fresh.yen < totalCost) return;
      const job = (() => { try { return JSON.parse(fresh.job_data || '{}'); } catch { return {}; } })();
      if (!job.__items) job.__items = [];
      for (let i = 0; i < qty; i++) job.__items.push(item.effect);
      // Apply immediate effects for healing items
      const update = { yen: fresh.yen - totalCost, job_data: JSON.stringify(job) };
      if (item.effect === 'HP_RESTORE_100') update.hp = Math.min((fresh.hp || 0) + 100 * qty, fresh.max_hp);
      if (item.effect === 'CE_RESTORE_30') update.ce = Math.min((fresh.ce || 0) + 30 * qty, fresh.max_ce);
      if (item.effect === 'CE_RESTORE_50') update.ce = Math.min((fresh.ce || 0) + 50 * qty, fresh.max_ce);
      db.update(players).set(update).where(eq(players.discord_id, discordId)).run();
      success = true;
    })();

    if (!success) return interaction.editReply('❌ Transaction failed. Try again.');

    const freshPlayer = db.select().from(players).where(eq(players.discord_id, discordId)).get();
    const embed = new EmbedBuilder()
      .setTitle(`✅ Purchased: ${qty}x ${item.name}`)
      .setColor(0x2ECC71)
      .setDescription(`Bought **${qty}** ${item.name}(s) for **${totalCost} 💰**.`)
      .addFields({ name: 'Remaining Yen', value: `${freshPlayer.yen} 💰`, inline: true })
      .addFields({ name: 'Inventory', value: `**${item.name}** added ×${qty}`, inline: true });
    if (item.effect === 'HP_RESTORE_100' || item.effect.startsWith('CE_RESTORE')) {
      embed.addFields({ name: 'Immediate Effect', value: `HP/CE restored instantly!`, inline: true });
    }
    await interaction.editReply({ embeds: [embed] });
  },
};
