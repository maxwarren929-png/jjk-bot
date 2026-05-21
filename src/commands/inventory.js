const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { db } = require('../db/index');
const { players } = require('../db/schema');
const { eq } = require('drizzle-orm');

const ITEM_NAMES = {
  __item_SILENCE_NEXT: { name: '🔇 Binding Ring', desc: 'Silences the enemy at the start of your next fight.' },
  __item_BONUS_DAMAGE_20: { name: '🗡️ Split Soul Katana', desc: '+20 flat damage in your next fight.' },
};

module.exports = {
  data: new SlashCommandBuilder()
    .setName('inventory')
    .setDescription('View your items and consumables.'),

  async execute(interaction) {
    await interaction.deferReply();
    const player = db.select().from(players).where(eq(players.discord_id, interaction.user.id)).get();
    if (!player) return interaction.editReply('❌ Run `/profile` first.');

    const embed = new EmbedBuilder()
      .setTitle(`📦 ${interaction.user.username}'s Inventory`)
      .setColor(0x3498DB)
      .addFields(
        { name: '👛 Wallet', value: `${player.yen.toLocaleString()} 💰`, inline: true },
        { name: '🏦 Bank', value: `${(player.bank_balance || 0).toLocaleString()} 💰`, inline: true },
        { name: '💰 Total', value: `${(player.yen + (player.bank_balance || 0)).toLocaleString()} 💰`, inline: true },
      );

    // Combat items stored as JSON flags in unlocked_techniques
    const flags = JSON.parse(player.unlocked_techniques || '[]');
    const items = flags.filter(f => f.startsWith('__item_')).map(f => ITEM_NAMES[f]).filter(Boolean);
    if (items.length > 0) {
      embed.addFields({ name: '⚔️ Combat Items', value: items.map(i => `**${i.name}** — ${i.desc}`).join('\n'), inline: false });
    } else {
      embed.addFields({ name: '⚔️ Combat Items', value: 'None — buy from `/shop`', inline: false });
    }

    // Job equipment
    if (player.job) {
      const data = JSON.parse(player.job_data || '{}');
      const jobLines = [];
      if (player.job === 'fisherman') jobLines.push(`🎣 Rod Level: **${data.rodLevel || 1}**`);
      if (player.job === 'lumberjack') jobLines.push(`🪓 Axe Level: **${data.axeLevel || 1}**`);
      if (player.job === 'miner') {
        const ores = data.miner_ores || {};
        const oreStr = Object.entries(ores).filter(([_, qty]) => qty > 0)
          .map(([id, qty]) => `${id === 'iron' ? '⛓️' : id === 'gold' ? '🪙' : '💎'} ${id.charAt(0).toUpperCase() + id.slice(1)}: ${qty}`).join(' | ') || 'None';
        jobLines.push(`⛏️ Raw Ores: ${oreStr}`);
      }
      if (jobLines.length) embed.addFields({ name: `💼 ${player.job.charAt(0).toUpperCase() + player.job.slice(1)}`, value: jobLines.join('\n'), inline: false });
    }

    // Active statuses
    const statusLines = [];
    if (player.is_broken) statusLines.push('💀 **Broken** — cannot fight or use domain');
    if (player.training_until && player.training_until > Date.now()) {
      const remain = Math.ceil((player.training_until - Date.now()) / 60000);
      statusLines.push(`🏋️ **Training** — ${player.training_type} (${remain}m left)`);
    }

    const jobData = JSON.parse(player.job_data || '{}');
    if (player.job === 'courier' && jobData.courier_until && jobData.courier_until > Date.now()) {
      const remain = Math.ceil((jobData.courier_until - Date.now()) / 60000);
      statusLines.push(`📦 **Delivering** — ${jobData.courier_pay}💰 (${remain}m left)`);
    }

    if (statusLines.length) embed.addFields({ name: '🔴 Active Statuses', value: statusLines.join('\n'), inline: false });

    await interaction.editReply({ embeds: [embed] });
  },
};
