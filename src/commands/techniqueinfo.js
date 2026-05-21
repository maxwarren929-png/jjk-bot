const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { TECHNIQUES } = require('../data/techniques');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('techniqueinfo')
    .setDescription('View detailed information about a cursed technique.')
    .addStringOption(opt => opt.setName('technique').setDescription('Technique to inspect').setRequired(true).setAutocomplete(true)),

  async autocomplete(interaction) {
    const focused = interaction.options.getFocused().toLowerCase();
    const matches = TECHNIQUES.filter(t => t.name.toLowerCase().includes(focused));
    await interaction.respond(matches.slice(0, 25).map(t => ({ name: t.name, value: t.id })));
  },

  async execute(interaction) {
    await interaction.deferReply();
    const id = interaction.options.getString('technique');
    const tech = TECHNIQUES.find(t => t.id === id);
    if (!tech) return interaction.editReply('❌ Unknown technique.');

    const cdMin = Math.floor(tech.cooldown_seconds / 60);
    const cdSec = tech.cooldown_seconds % 60;
    const cdText = cdMin > 0 ? `${cdMin}m ${cdSec}s` : `${cdSec}s`;

    const embed = new EmbedBuilder()
      .setTitle(`⚡ ${tech.name}`)
      .setColor(tech.type === 'Offensive' ? 0xE74C3C : tech.type === 'Defensive' ? 0x3498DB : 0x9B59B6)
      .setDescription(tech.description || 'No description.')
      .addFields(
        { name: '📂 Type', value: tech.type || 'Unknown', inline: true },
        { name: '💜 CE Cost', value: `${tech.ce_cost}`, inline: true },
        { name: '⏱️ Cooldown', value: cdText, inline: true },
      );

    if (tech.damage_min > 0 || tech.damage_max > 0) {
      embed.addFields({ name: '⚔️ Damage', value: `${tech.damage_min}–${tech.damage_max}`, inline: true });
    }
    if (tech.is_innate) {
      embed.addFields({ name: '🔷 Innate', value: 'Yes', inline: true });
    }
    if (tech.parent_technique_id) {
      const parent = TECHNIQUES.find(t => t.id === tech.parent_technique_id);
      embed.addFields({ name: '🔗 Derived From', value: parent ? parent.name : tech.parent_technique_id, inline: true });
    }
    if (tech.lore) {
      embed.addFields({ name: '📜 Lore', value: `*${tech.lore}*`, inline: false });
    }
    if (tech.effects && tech.effects.length > 0) {
      embed.addFields({ name: '✨ Effects', value: tech.effects.map(e => `\`${e.use || e.trigger || 'passive'}\`: ${JSON.stringify(e)}`).join('\n'), inline: false });
    }

    await interaction.editReply({ embeds: [embed] });
  },
};
