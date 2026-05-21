const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { db, sqlite } = require('../db/index');
const { players, clans, clan_members, clan_invites, bounties } = require('../db/schema');
const { eq } = require('drizzle-orm');
const { setTechniquesEnabled, isTechniquesEnabled } = require('../systems/techniques-toggle');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('admin')
    .setDescription('Admin commands.')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand(sub => sub
      .setName('techniques-toggle')
      .setDescription('Enable or disable all cursed techniques on this server.'))
    .addSubcommand(sub => sub
      .setName('reset')
      .setDescription('Wipe ALL player data. Everyone must run /profile again.'))
    .addSubcommand(sub => sub
      .setName('set-balance')
      .setDescription('Set a player\'s yen balance.')
      .addUserOption(opt => opt.setName('user').setDescription('The player').setRequired(true))
      .addIntegerOption(opt => opt.setName('amount').setDescription('New yen balance').setRequired(true).setMinValue(0))),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });
    const sub = interaction.options.getSubcommand();

    if (sub === 'techniques-toggle') {
      const guildId = interaction.guild?.id;
      if (!guildId) return interaction.editReply('❌ This command must be used in a server.');

      const current = isTechniquesEnabled(guildId);
      setTechniquesEnabled(guildId, !current);

      const embed = new EmbedBuilder()
        .setTitle(current ? '🔒 Techniques Disabled' : '🔓 Techniques Enabled')
        .setColor(current ? 0xE74C3C : 0x2ECC71)
        .setDescription(current
          ? 'All cursed techniques are now **disabled** on this server.'
          : 'All cursed techniques are now **enabled** on this server.');

      await interaction.editReply({ embeds: [embed] });
      return;
    }

    if (sub === 'reset') {
      const confirm = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('reset_confirm').setLabel('⚠️ YES, WIPE EVERYTHING').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId('reset_cancel').setLabel('Cancel').setStyle(ButtonStyle.Secondary),
      );

      const msg = await interaction.editReply({
        content: '☠️ **This will delete ALL player data — yen, techniques, jobs, banks, everything.** Everyone must run `/profile` to start over. Are you sure?',
        components: [confirm],
      });

      const col = msg.createMessageComponentCollector({ filter: i => i.user.id === interaction.user.id && i.member?.permissions?.has('Administrator'), time: 30_000, max: 1 });
      col.on('collect', async btn => {
        await btn.deferUpdate();
        if (btn.customId === 'reset_cancel') {
          await interaction.editReply({ content: '✅ Reset cancelled.', components: [] });
          return;
        }

        let playerCount, clanCount, bountyCount;
        sqlite.transaction(() => {
          playerCount = db.delete(players).run().changes;
          clanCount = db.delete(clans).run().changes;
          db.delete(clan_members).run();
          db.delete(clan_invites).run();
          bountyCount = db.delete(bounties).run().changes;
        })();

        const embed = new EmbedBuilder()
          .setTitle('💥 Server Reset Complete')
          .setColor(0xE74C3C)
          .setDescription(`Deleted **${playerCount}** players, **${clanCount}** clans, **${bountyCount}** bounties. All members and invites cleared.`)
          .setFooter({ text: 'Everyone must run /profile to start fresh.' });

        await interaction.editReply({ content: null, embeds: [embed], components: [] });
      });
      col.on('end', (_, reason) => {
        if (reason === 'time') interaction.editReply({ components: [] }).catch(() => {});
      });
    }

    if (sub === 'set-balance') {
      const target = interaction.options.getUser('user');
      const amount = interaction.options.getInteger('amount');

      const player = db.select().from(players).where(eq(players.discord_id, target.id)).get();
      if (!player) return interaction.editReply(`❌ **${target.username}** has no profile.`);

      db.update(players).set({ yen: amount }).where(eq(players.discord_id, target.id)).run();

      const embed = new EmbedBuilder()
        .setTitle('💰 Balance Updated')
        .setColor(0x2ECC71)
        .setDescription(`**${target.username}**'s yen set to **${amount} 💰**`);

      await interaction.editReply({ embeds: [embed] });
    }
  },
};
