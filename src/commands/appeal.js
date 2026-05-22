const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { db, sqlite } = require('../db/index');
const { players, bounties } = require('../db/schema');
const { eq } = require('drizzle-orm');

const APPEAL_MULTIPLIER = 1.5;

module.exports = {
  data: new SlashCommandBuilder()
    .setName('appeal')
    .setDescription('Pay 1.5x total bounty value to remove all bounties on you.'),

  async execute(interaction) {
    await interaction.deferReply();
    const userId = interaction.user.id;

    const player = db.select().from(players).where(eq(players.discord_id, userId)).get();
    if (!player) return interaction.editReply('❌ Run `/profile` first.');

    const myBounties = db.select().from(bounties).where(eq(bounties.target_id, userId)).all();
    if (myBounties.length === 0) return interaction.editReply('✅ No bounties on you. Nothing to appeal.');

    const totalBounty = myBounties.reduce((sum, b) => sum + b.amount, 0);
    const cost = Math.ceil(totalBounty * APPEAL_MULTIPLIER);

    if (player.yen < cost) return interaction.editReply(`❌ Appeal costs **${cost.toLocaleString()} 💰** (1.5x ${totalBounty.toLocaleString()} total bounty). You only have **${player.yen.toLocaleString()} 💰**.`);

    sqlite.transaction(() => {
      const fresh = db.select().from(players).where(eq(players.discord_id, userId)).get();
      if (!fresh || fresh.yen < cost) return;
      const rows = db.select().from(bounties).where(eq(bounties.target_id, userId)).all();
      if (rows.length === 0) return;
      const refundPool = rows.reduce((sum, b) => sum + b.amount, 0);
      for (const b of rows) {
        const placer = db.select().from(players).where(eq(players.discord_id, b.placed_by_id)).get();
        if (placer) {
          const refundShare = Math.floor(b.amount / refundPool * cost);
          db.update(players).set({ yen: placer.yen + refundShare }).where(eq(players.discord_id, b.placed_by_id)).run();
        }
        db.delete(bounties).where(eq(bounties.id, b.id)).run();
      }
      db.update(players).set({ yen: fresh.yen - cost }).where(eq(players.discord_id, userId)).run();
    })();

    const embed = new EmbedBuilder()
      .setTitle('⚖️ Bounty Appeal')
      .setColor(0x9B59B6)
      .setDescription(`Paid **${cost.toLocaleString()} 💰** to clear **${myBounties.length}** bounty/bounties (**${totalBounty.toLocaleString()} 💰** total value).`);
    await interaction.editReply({ embeds: [embed] });
  },
};
