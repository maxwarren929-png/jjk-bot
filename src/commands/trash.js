const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { db, sqlite } = require('../db/index');
const { players } = require('../db/schema');
const { eq } = require('drizzle-orm');

const TRASHABLE = [
  { name: '🔇 Binding Ring', value: 'SILENCE_NEXT' },
  { name: '🗡️ Split Soul Katana', value: 'BONUS_DAMAGE_20' },
  { name: '💜 CE Potion', value: 'CE_RESTORE_50' },
  { name: '❤️‍🔥 HP Potion', value: 'HP_RESTORE_100' },
  { name: '💚 CE Elixir', value: 'CE_RESTORE_30' },
  { name: '🧪 Healing Vial', value: 'EXIT_BROKEN' },
];

module.exports = {
  data: new SlashCommandBuilder()
    .setName('trash')
    .setDescription('Delete an item from your inventory (no refund).')
    .addStringOption(o => o.setName('item').setDescription('Item to delete').setRequired(true)
      .addChoices(...TRASHABLE.map(i => ({ name: i.name, value: i.value })))),

  async execute(interaction) {
    const itemKey = interaction.options.getString('item');
    await interaction.deferReply();

    const player = db.select().from(players).where(eq(players.discord_id, interaction.user.id)).get();
    if (!player) return interaction.editReply('❌ Run `/profile` first.');

    const job = (() => { try { return JSON.parse(player.job_data || '{}'); } catch { return {}; } })();
    const items = job.__items || [];
    if (!items.includes(itemKey)) return interaction.editReply('❌ You don\'t have that item.');

    const confirm = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('trash_confirm').setLabel('🗑️ Yes, delete it').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId('trash_cancel').setLabel('Cancel').setStyle(ButtonStyle.Secondary),
    );
    await interaction.editReply({ content: `🗑️ Are you sure you want to delete this item? There is **no refund**.`, components: [confirm] });

    const col = interaction.channel.createMessageComponentCollector({ filter: i => i.user.id === interaction.user.id, time: 15_000, max: 1 });
    col.on('collect', async btn => {
      await btn.deferUpdate();
      if (btn.customId === 'trash_cancel') {
        await interaction.editReply({ content: '✅ Trash cancelled.', components: [] });
        return;
      }
      sqlite.transaction(() => {
        const fresh = db.select().from(players).where(eq(players.discord_id, interaction.user.id)).get();
        if (!fresh) return;
        const fJob = (() => { try { return JSON.parse(fresh.job_data || '{}'); } catch { return {}; } })();
        const fItems = fJob.__items || [];
        const idx = fItems.indexOf(itemKey);
        if (idx === -1) return;
        fItems.splice(idx, 1);
        fJob.__items = fItems;
        db.update(players).set({ job_data: JSON.stringify(fJob) }).where(eq(players.discord_id, interaction.user.id)).run();
      })();
      await interaction.editReply({ content: '🗑️ Item has been deleted.', components: [] });
    });
    col.on('end', (_, reason) => {
      if (reason === 'time') interaction.editReply({ components: [] }).catch(() => {});
    });
  },
};
