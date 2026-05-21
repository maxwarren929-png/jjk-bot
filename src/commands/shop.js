const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } = require('discord.js');
const { db } = require('../db/index');
const { players } = require('../db/schema');
const { eq } = require('drizzle-orm');
const { SHOP_CATALOG, applyShopEffect } = require('../systems/economy');
const { TECHNIQUES } = require('../data/techniques');
const { unlockTechnique } = require('../systems/techniques');

const CONFIRM_THRESHOLD = 500;

module.exports = {
  data: new SlashCommandBuilder()
    .setName('shop')
    .setDescription('Browse and purchase items from the cursed market.'),

  async execute(interaction) {
    await interaction.deferReply();
    const discordId = interaction.user.id;
    const player = db.select().from(players).where(eq(players.discord_id, discordId)).get();
    if (!player) { await interaction.editReply('❌ Run `/profile` first.'); return; }

    const embed = new EmbedBuilder()
      .setTitle('🏪 Cursed Market')
      .setColor(0xF1C40F)
      .setDescription(`Your balance: **${player.yen} 💰**\n\nSelect an item to purchase:`)
      .addFields(SHOP_CATALOG.map(item => ({
        name: `${item.name} — ${item.cost} 💰`,
        value: `${item.description}\n└ Sells for **${Math.floor(item.cost * 0.5)} 💰**`,
        inline: false,
      })));

    const rows = [];
    let row = new ActionRowBuilder();
    SHOP_CATALOG.forEach((item, i) => {
      if (i > 0 && i % 5 === 0) { rows.push(row); row = new ActionRowBuilder(); }
      row.addComponents(
        new ButtonBuilder()
          .setCustomId(`shop_buy_${item.id}`)
          .setLabel(`Buy ${item.name}`)
          .setStyle(player.yen >= item.cost ? ButtonStyle.Primary : ButtonStyle.Secondary)
          .setDisabled(player.yen < item.cost)
      );
    });
    if (row.components.length > 0) rows.push(row);

    const msg = await interaction.editReply({ embeds: [embed], components: rows });
    const collector = msg.createMessageComponentCollector({ filter: i => i.user.id === discordId, time: 60 * 1000 });

    collector.on('collect', async btn => {
      await btn.deferUpdate();
      const itemId = btn.customId.replace('shop_buy_', '');
      const item = SHOP_CATALOG.find(i => i.id === itemId);
      if (!item) return;

      // Confirmation prompt for expensive items
      if (item.cost >= CONFIRM_THRESHOLD) {
        const confirmEmbed = new EmbedBuilder()
          .setTitle(`⚠️ Confirm Purchase`)
          .setColor(0xF1C40F)
          .setDescription(`Are you sure you want to buy **${item.name}** for **${item.cost} 💰**?`);
        const confirmRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('confirm_yes').setLabel('✅ Yes').setStyle(ButtonStyle.Success),
          new ButtonBuilder().setCustomId('confirm_no').setLabel('❌ No').setStyle(ButtonStyle.Danger),
        );
        await btn.editReply({ embeds: [confirmEmbed], components: [confirmRow] });

        try {
          const confirmBtn = await (await interaction.fetchReply()).awaitMessageComponent({
            filter: i => i.user.id === discordId && ['confirm_yes', 'confirm_no'].includes(i.customId),
            time: 15_000,
          });
          await confirmBtn.deferUpdate();

          if (confirmBtn.customId === 'confirm_no') {
            await confirmBtn.editReply({ content: '❌ Purchase cancelled.', embeds: [], components: [] });
            return;
          }

          const freshPlayer = db.select().from(players).where(eq(players.discord_id, discordId)).get();
          const result = applyShopEffect(freshPlayer, itemId);
          if (result.error) {
            await confirmBtn.editReply({ content: `❌ ${result.error}`, embeds: [], components: [] });
            return;
          }

          if (result.needsTechniquePick) {
            collector.stop();
            await techniquePicker(interaction, confirmBtn, discordId);
            return;
          }

          const updatedPlayer = db.select().from(players).where(eq(players.discord_id, discordId)).get();
          const doneEmbed = new EmbedBuilder()
            .setTitle(`✅ Purchased: ${result.item.name}`)
            .setColor(0x2ECC71)
            .setDescription(result.item.description)
            .addFields({ name: 'Remaining Yen', value: `${updatedPlayer.yen} 💰`, inline: true });
          if (result.newTechniqueId) {
            doneEmbed.addFields({ name: '🎲 New Technique', value: `Assigned: **${result.newTechniqueId}**`, inline: true });
          }
          await confirmBtn.editReply({ embeds: [doneEmbed], components: [] });
        } catch {
          interaction.editReply({ embeds: [embed], components: rows }).catch(() => {});
        }
        return;
      }

      const freshPlayer = db.select().from(players).where(eq(players.discord_id, discordId)).get();
      const result = applyShopEffect(freshPlayer, itemId);

      if (result.error) {
        await btn.followUp({ content: `❌ ${result.error}`, ephemeral: true }); return;
      }

      if (result.needsTechniquePick) {
        collector.stop();
        await techniquePicker(interaction, btn, discordId);
        return;
      }

      const updatedPlayer = db.select().from(players).where(eq(players.discord_id, discordId)).get();
      const confirmEmbed = new EmbedBuilder()
        .setTitle(`✅ Purchased: ${result.item.name}`)
        .setColor(0x2ECC71)
        .setDescription(result.item.description)
        .addFields({ name: 'Remaining Yen', value: `${updatedPlayer.yen} 💰`, inline: true });

      if (result.newTechniqueId) {
        confirmEmbed.addFields({ name: '🎲 New Technique', value: `Assigned: **${result.newTechniqueId}**`, inline: true });
      }

      await btn.editReply({ embeds: [confirmEmbed], components: [] });
      collector.stop();
    });

    collector.on('end', (_, reason) => {
      if (reason === 'time') {
        interaction.editReply({ components: [] }).catch(() => {});
      }
    });
  },
};

async function techniquePicker(interaction, btn, discordId) {
  const player = db.select().from(players).where(eq(players.discord_id, discordId)).get();
  if (!player) { await btn.editReply({ content: '❌ Profile not found. Run `/profile` first.', embeds: [], components: [] }); return; }
  let owned = [];
  try { owned = JSON.parse(player.unlocked_techniques || '[]'); } catch { owned = []; }

  const available = TECHNIQUES.filter(t =>
    t.id !== player.innate_technique_id &&
    t.id !== 'punch' &&
    !owned.includes(t.id)
  );

  if (available.length === 0) {
    await btn.editReply({ content: '✅ You already own every technique!', embeds: [], components: [] });
    return;
  }

  let page = 0;
  const pageSize = 25;

  async function renderPage() {
    const start = page * pageSize;
    const pageTechs = available.slice(start, start + pageSize);
    const totalPages = Math.ceil(available.length / pageSize);

    const embed = new EmbedBuilder()
      .setTitle('📜 Forbidden Technique Scroll')
      .setColor(0x9B59B6)
      .setDescription('Pick a technique to unlock permanently:')
      .setFooter({ text: `Page ${page + 1}/${totalPages} — ${available.length} available` });

    const select = new StringSelectMenuBuilder()
      .setCustomId('tech_pick')
      .setPlaceholder('Choose a technique...')
      .addOptions(pageTechs.map(t => ({
        label: t.name,
        description: `${t.ce_cost} CE | ${t.type}`,
        value: t.id,
      })));

    const row = new ActionRowBuilder().addComponents(select);
    const navRow = new ActionRowBuilder();
    if (page > 0) navRow.addComponents(new ButtonBuilder().setCustomId('tech_prev').setLabel('◀ Prev').setStyle(ButtonStyle.Secondary));
    if (start + pageSize < available.length) navRow.addComponents(new ButtonBuilder().setCustomId('tech_next').setLabel('Next ▶').setStyle(ButtonStyle.Secondary));

    const components = navRow.components.length ? [row, navRow] : [row];
    await btn.editReply({ embeds: [embed], components });
  }

  await renderPage();

  let msg;
  try { msg = await interaction.fetchReply(); } catch { return; }
  if (!msg) return;
  const col = msg.createMessageComponentCollector({ filter: i => i.user.id === discordId, time: 60_000 });

  col.on('collect', async i => {
    await i.deferUpdate();

    if (i.customId === 'tech_prev') { page--; await renderPage(); return; }
    if (i.customId === 'tech_next') { page++; await renderPage(); return; }

    if (i.customId === 'tech_pick') {
      const techId = i.values[0];
      unlockTechnique(discordId, techId);
      col.stop();

      const tech = TECHNIQUES.find(t => t.id === techId);
      const doneEmbed = new EmbedBuilder()
        .setTitle('✅ Technique Unlocked!')
        .setColor(0x2ECC71)
        .setDescription(`You have mastered **${tech.name}**!\n\n*${tech.description}*`)
        .addFields({ name: '💜 CE Cost', value: `${tech.ce_cost}`, inline: true });

      await i.editReply({ embeds: [doneEmbed], components: [] });
    }
  });

  col.on('end', (_, reason) => {
    if (reason === 'time') msg.edit({ components: [] }).catch(() => {});
  });
}
