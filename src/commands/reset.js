const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { db, sqlite } = require('../db/index');
const { players, bounties, clan_members } = require('../db/schema');
const { eq, or, and } = require('drizzle-orm');
const { getMembership } = require('../systems/clans');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('reset')
    .setDescription('Permanently delete your profile and start over.'),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    const player = db.select().from(players).where(eq(players.discord_id, interaction.user.id)).get();
    if (!player) return interaction.editReply('❌ No profile to reset. Run `/profile` first.');

    const confirm = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('reset_confirm').setLabel('⚠️ YES, DELETE MY PROFILE').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId('reset_cancel').setLabel('Cancel').setStyle(ButtonStyle.Secondary),
    );

    await interaction.editReply({
      content: '☠️ **This will permanently delete ALL your data** — yen, techniques, grade, jobs, inventory, bank, bounties, and clan membership. There is no undo. Continue?',
      components: [confirm],
    });

    const col = interaction.channel.createMessageComponentCollector({ filter: i => i.user.id === interaction.user.id, time: 30_000, max: 1 });
    col.on('collect', async btn => {
      await btn.deferUpdate();
      if (btn.customId === 'reset_cancel') {
        await interaction.editReply({ content: '✅ Reset cancelled.', components: [] });
        return;
      }

      const membership = getMembership(interaction.user.id);

      sqlite.transaction(() => {
        if (membership) {
          db.delete(clan_members)
            .where(and(eq(clan_members.player_id, interaction.user.id), eq(clan_members.clan_id, membership.clan_id)))
            .run();
        }
        db.delete(bounties).where(or(eq(bounties.placed_by_id, interaction.user.id), eq(bounties.target_id, interaction.user.id))).run();
        db.delete(players).where(eq(players.discord_id, interaction.user.id)).run();
      })();

      const embed = new EmbedBuilder()
        .setTitle('💥 Profile Deleted')
        .setColor(0xE74C3C)
        .setDescription('All your data has been wiped. Run `/profile` to start fresh!');
      await interaction.editReply({ content: null, embeds: [embed], components: [] });
    });
    col.on('end', (_, reason) => {
      if (reason === 'time') interaction.editReply({ components: [] }).catch(() => {});
    });
  },
};
