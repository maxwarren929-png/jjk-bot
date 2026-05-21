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

    const ownEnh = player ? (() => { try { return JSON.parse(player.job_data || '{}').__enhancements || {}; } catch { return {}; } })() : {};
    const ownItems = player ? (() => { try { return JSON.parse(player.job_data || '{}').__items || []; } catch { return []; } })() : {};
    const ownEq = player ? (() => { try { return JSON.parse(player.job_data || '{}').__equipment || {}; } catch { return {}; } })() : {};

    const config = [];

    for (const [key, item] of Object.entries(EQUIPMENT_ITEMS)) {
      const owned = ownItems.includes(key) || Object.values(ownEq).includes(key);
      const level = ownEnh[key] || 0;
      const b = getEnhancedBonuses(key, 0);
      const bDesc = Object.entries(b).map(([k, v]) => `+${v} ${k.replace(/([A-Z])/g, ' $1').trim()}`).join(', ');
      config.push({
        name: `${item.name}`,
        value: `📦 ${item.slot} • ${bDesc} • Cost: ${item.cost} 💰\nEnhance: +${MAX_ENHANCE} max, +30%/lvl${owned ? `\n✅ Owned (Lv.${level})` : ''}`,
        inline: false,
      });
    }

    const weaponItems = config.filter(c => c.value.includes('weapon'));
    const armorItems = config.filter(c => c.value.includes('armor'));

    const embed = new EmbedBuilder()
      .setTitle('📚 Equipment Collection')
      .setColor(0x9B59B6)
      .setDescription('Browse all equipment and their base stats. Enchanting increases stats by 30% per level.');

    if (weaponItems.length > 0) {
      embed.addFields({ name: '⚔️ Weapons', value: weaponItems.map(c => `**${c.name}**\n${c.value.replace(/^(.*?)(weapon)(.*)$/m, '$1$3')}`).join('\n\n'), inline: false });
    }
    if (armorItems.length > 0) {
      embed.addFields({ name: '🛡️ Armor', value: armorItems.map(c => `**${c.name}**\n${c.value.replace(/^(.*?)(armor)(.*)$/m, '$1$3')}`).join('\n\n'), inline: false });
    }

    embed.addFields(
      { name: '⚔️ Combat Items', value: 'Purchase from `/shop`. Use with `/inventory use` or equip via `/inventory equip`.', inline: false },
      { name: '🔧 Enhancement', value: 'Use `/enhance <slot>` to upgrade equipped gear with CE. Cost scales with level.', inline: false },
    );

    await interaction.editReply({ embeds: [embed] });
  },
};
