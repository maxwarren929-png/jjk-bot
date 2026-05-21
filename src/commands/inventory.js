const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { db } = require('../db/index');
const { players } = require('../db/schema');
const { eq } = require('drizzle-orm');

const ITEM_NAMES = {
  SILENCE_NEXT: { name: '🔇 Binding Ring', desc: 'Silences the enemy at the start of your next fight.' },
  BONUS_DAMAGE_20: { name: '🗡️ Split Soul Katana', desc: '+20 flat damage in your next fight.' },
  CE_RESTORE_50: { name: '💜 CE Potion', desc: 'Restores 50 Cursed Energy.' },
  EXIT_BROKEN: { name: '🧪 Healing Vial', desc: 'Exit Broken state and restore 50 HP.' },
};

const USEABLE_ITEMS = {
  CE_RESTORE_50: { name: '💜 CE Potion', desc: 'Restore 50 CE' },
  EXIT_BROKEN: { name: '🧪 Healing Vial', desc: 'Exit Broken state and restore 50 HP' },
};

module.exports = {
  data: new SlashCommandBuilder()
    .setName('inventory')
    .setDescription('View your items and consumables.')
    .addSubcommand(sub => sub.setName('view').setDescription('View your inventory.'))
    .addSubcommand(sub => sub
      .setName('use')
      .setDescription('Use a consumable item from your inventory.')
      .addStringOption(opt => opt.setName('item').setDescription('Item to use').setRequired(true)
        .addChoices(
          { name: '💜 CE Potion (restore 50 CE)', value: 'CE_RESTORE_50' },
          { name: '🧪 Healing Vial (exit Broken + 50 HP)', value: 'EXIT_BROKEN' },
        ))),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    if (sub === 'use') return useItem(interaction);

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

    // Items stored in job_data.__items
    const jobData = JSON.parse(player.job_data || '{}');
    const flags = jobData.__items || [];
    const items = flags.map(f => ITEM_NAMES[f]).filter(Boolean);
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

    const jd = JSON.parse(player.job_data || '{}');
    if (player.job === 'courier' && jd.courier_until && jd.courier_until > Date.now()) {
      const remain = Math.ceil((jd.courier_until - Date.now()) / 60000);
      statusLines.push(`📦 **Delivering** — ${jd.courier_pay}💰 (${remain}m left)`);
    }

    if (statusLines.length) embed.addFields({ name: '🔴 Active Statuses', value: statusLines.join('\n'), inline: false });

    await interaction.editReply({ embeds: [embed] });
  },
};

async function useItem(interaction) {
  await interaction.deferReply();
  const itemKey = interaction.options.getString('item');
  const player = db.select().from(players).where(eq(players.discord_id, interaction.user.id)).get();
  if (!player) return interaction.editReply('❌ Run `/profile` first.');

  const jobData = JSON.parse(player.job_data || '{}');
  const items = jobData.__items || [];
  const idx = items.indexOf(itemKey);
  if (idx === -1) return interaction.editReply(`❌ You don't have a **${USEABLE_ITEMS[itemKey].name}**. Buy one from \`/shop\`.`);

  items.splice(idx, 1);
  const update = {};
  const resultText = USEABLE_ITEMS[itemKey].desc;

  if (itemKey === 'CE_RESTORE_50') {
    if (player.ce >= player.max_ce) {
      jobData.__items = [...items, itemKey];
      db.update(players).set({ job_data: JSON.stringify(jobData) }).where(eq(players.discord_id, interaction.user.id)).run();
      return interaction.editReply('❌ Your CE is already full. Save the potion for later.');
    }
    update.ce = Math.min(player.ce + 50, player.max_ce);
  }

  if (itemKey === 'EXIT_BROKEN') {
    if (!player.is_broken) {
      jobData.__items = [...items, itemKey];
      db.update(players).set({ job_data: JSON.stringify(jobData) }).where(eq(players.discord_id, interaction.user.id)).run();
      return interaction.editReply('❌ You are not Broken. No need for a Healing Vial.');
    }
    update.is_broken = false;
    update.broken_until = null;
    update.hp = Math.min(player.hp + 50, player.max_hp);
  }

  jobData.__items = items;
  update.job_data = JSON.stringify(jobData);
  db.update(players).set(update).where(eq(players.discord_id, interaction.user.id)).run();

  const embed = new EmbedBuilder()
    .setTitle(`✅ Used: ${USEABLE_ITEMS[itemKey].name}`)
    .setColor(0x2ECC71)
    .setDescription(`${resultText} — item consumed.`);
  await interaction.editReply({ embeds: [embed] });
}
