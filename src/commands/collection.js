const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { db } = require('../db/index');
const { players } = require('../db/schema');
const { eq } = require('drizzle-orm');
const { EQUIPMENT_ITEMS, getEnhancedBonuses, getEnhanceCost, getEnhanceSuccess, MAX_ENHANCE } = require('../data/equipment');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('collection')
    .setDescription('Browse all equipment and items available in the game.'),

  async execute(interaction) {
    await interaction.deferReply();
    const player = db.select().from(players).where(eq(players.discord_id, interaction.user.id)).get();
    const job = player ? (() => { try { return JSON.parse(player.job_data || '{}'); } catch { return {}; } })() : {};
    const ownEnh = job.__enhancements || {};
    const ownItems = job.__items || [];
    const ownEq = job.__equipment || {};

    const bySlot = { weapon: [], armor: [] };
    for (const [key, item] of Object.entries(EQUIPMENT_ITEMS)) {
      const owned = ownItems.includes(key) || Object.values(ownEq).includes(key);
      const level = ownEnh[key] || 0;
      const b = getEnhancedBonuses(key, 0);
      const bDesc = Object.entries(b).map(([k, v]) => `+${v} ${k.replace(/([A-Z])/g, ' $1').trim()}`).join(', ');
      bySlot[item.slot].push({
        display: `**${item.name}**\n${bDesc} • Cost: ${item.cost} 💰\nEnhance: +${MAX_ENHANCE} max, +30%/lvl${owned ? `\n✅ Owned (Lv.${level})` : ''}`,
      });
    }

    const embed = new EmbedBuilder()
      .setTitle('📚 Equipment Collection')
      .setColor(0x9B59B6)
      .setDescription('Browse all equipment and their base stats. Enchanting increases stats by 30% per level.');

    if (bySlot.weapon.length > 0) {
      embed.addFields({ name: '⚔️ Weapons', value: bySlot.weapon.map(e => e.display).join('\n\n'), inline: false });
    }
    if (bySlot.armor.length > 0) {
      embed.addFields({ name: '🛡️ Armor', value: bySlot.armor.map(e => e.display).join('\n\n'), inline: false });
    }

    embed.addFields(
      { name: '⚔️ Combat Items', value: 'Purchase from `/shop`. Use with `/inventory use` or equip via `/inventory equip`.', inline: false },
      { name: '🔧 Enhancement', value: 'Use `/enhance <slot>` to upgrade equipped gear with CE. Cost scales with level.', inline: false },
    );

    await interaction.editReply({ embeds: [embed] });
  },
};
