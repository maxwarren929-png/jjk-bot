const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { db, sqlite } = require('../db/index');
const { players } = require('../db/schema');
const { eq } = require('drizzle-orm');
const { fightPlayer } = require('../systems/combat');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('duel')
    .setDescription('Challenge another player to a duel with a yen stake.')
    .addUserOption(o => o.setName('target').setDescription('Who to duel').setRequired(true))
    .addIntegerOption(o => o.setName('stake').setDescription('Yen stake (winner takes all)').setRequired(true).setMinValue(100).setMaxValue(100000)),

  async execute(interaction) {
    await interaction.deferReply();
    const userId = interaction.user.id;
    const targetUser = interaction.options.getUser('target');
    const stake = interaction.options.getInteger('stake');

    if (targetUser.id === userId) return interaction.editReply('❌ You cannot duel yourself.');
    if (targetUser.bot) return interaction.editReply('❌ You cannot duel a bot.');

    const actor = db.select().from(players).where(eq(players.discord_id, userId)).get();
    const target = db.select().from(players).where(eq(players.discord_id, targetUser.id)).get();
    if (!actor) return interaction.editReply('❌ Run `/profile` first.');
    if (!target) return interaction.editReply(`❌ **${targetUser.username}** has no profile.`);
    if (actor.yen < stake) return interaction.editReply(`❌ You only have **${actor.yen.toLocaleString()} 💰**, need **${stake.toLocaleString()} 💰** for the stake.`);
    if (target.yen < stake) return interaction.editReply(`❌ **${targetUser.username}** only has **${target.yen.toLocaleString()} 💰** — can't cover the stake.`);
    if (actor.is_broken) return interaction.editReply('❌ You are Broken and cannot duel.');
    if (target.is_broken) return interaction.editReply(`❌ **${targetUser.username}** is Broken and cannot duel.`);

    const confirm = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('duel_accept').setLabel('⚔️ Accept Duel').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('duel_decline').setLabel('Decline').setStyle(ButtonStyle.Danger),
    );

    await interaction.editReply({
      content: `⚔️ **${interaction.user.username}** challenges **${targetUser.username}** to a duel for **${stake.toLocaleString()} 💰**!`,
      components: [confirm],
    });

    const filter = i => i.user.id === targetUser.id && ['duel_accept', 'duel_decline'].includes(i.customId);
    const col = interaction.channel.createMessageComponentCollector({ filter, time: 30_000, max: 1 });

    col.on('collect', async btn => {
      await btn.deferUpdate();
      if (btn.customId === 'duel_decline') {
        await interaction.editReply({ content: `❌ **${targetUser.username}** declined the duel.`, components: [] });
        return;
      }

      const fActor = db.select().from(players).where(eq(players.discord_id, userId)).get();
      const fTarget = db.select().from(players).where(eq(players.discord_id, targetUser.id)).get();
      if (!fActor || !fTarget) {
        await interaction.editReply({ content: '❌ Player data changed. Duel cancelled.', components: [] });
        return;
      }
      if (fActor.yen < stake || fTarget.yen < stake) {
        await interaction.editReply({ content: '❌ One of the duelists no longer has enough yen to cover the stake.', components: [] });
        return;
      }

      sqlite.transaction(() => {
        const a = db.select().from(players).where(eq(players.discord_id, userId)).get();
        const t = db.select().from(players).where(eq(players.discord_id, targetUser.id)).get();
        if (!a || !t) return;
        db.update(players).set({ yen: a.yen - stake }).where(eq(players.discord_id, userId)).run();
        db.update(players).set({ yen: t.yen - stake }).where(eq(players.discord_id, targetUser.id)).run();
      })();

      await interaction.editReply({ content: `⚔️ **${interaction.user.username}** vs **${targetUser.username}** — FIGHT! (${stake.toLocaleString()} 💰 pot)`, components: [] });

      const result = fightPlayer(fActor.discord_id, fTarget.discord_id);
      if (!result || !result.ok) {
        sqlite.transaction(() => {
          const a = db.select().from(players).where(eq(players.discord_id, userId)).get();
          const t = db.select().from(players).where(eq(players.discord_id, targetUser.id)).get();
          if (a) db.update(players).set({ yen: a.yen + stake }).where(eq(players.discord_id, userId)).run();
          if (t) db.update(players).set({ yen: t.yen + stake }).where(eq(players.discord_id, targetUser.id)).run();
        })();
        await interaction.followUp({ content: '❌ Duel error — stakes refunded.' });
        return;
      }

      const pot = stake * 2;
      const winnerId = result.winner === userId ? userId : targetUser.id;

      db.update(players).set({ yen: db.select().from(players).where(eq(players.discord_id, winnerId)).get().yen + pot }).where(eq(players.discord_id, winnerId)).run();

      const embed = new EmbedBuilder()
        .setTitle('⚔️ Duel Results')
        .setColor(0xF1C40F)
        .setDescription(result.log ? result.log.slice(0, 4000) : 'The duel is over.')
        .addFields(
          { name: '🏆 Winner', value: `<@${winnerId}>`, inline: true },
          { name: '💰 Pot', value: `${pot.toLocaleString()} 💰`, inline: true },
        );
      await interaction.followUp({ embeds: [embed] });
    });

    col.on('end', (_, reason) => {
      if (reason === 'time') interaction.editReply({ content: '⏳ Duel request expired.', components: [] }).catch(() => {});
    });
  },
};
