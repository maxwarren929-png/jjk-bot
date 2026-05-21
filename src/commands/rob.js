const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { db, sqlite } = require('../db/index');
const { players } = require('../db/schema');
const { eq } = require('drizzle-orm');

const GRADE_ORDER = ['Grade 4', 'Grade 3', 'Grade 2', 'Grade 1', 'Semi-Special Grade', 'Special Grade'];
const COOLDOWN_MS = 3600000;
const BASE_CHANCE = 0.35;
const STEAL_PCT = 0.4;
const MAX_STEAL = 500;
const MIN_TARGET_YEN = 50;
const FAIL_FINE_PCT = 0.3;

module.exports = {
  data: new SlashCommandBuilder()
    .setName('rob')
    .setDescription('Attempt to rob another player\'s wallet.')
    .addUserOption(opt => opt.setName('target').setDescription('Who to rob').setRequired(true)),

  async execute(interaction) {
    await interaction.deferReply();
    const userId = interaction.user.id;
    const targetUser = interaction.options.getUser('target');

    if (targetUser.id === userId) return interaction.editReply('❌ You cannot rob yourself.');

    const actor = db.select().from(players).where(eq(players.discord_id, userId)).get();
    const target = db.select().from(players).where(eq(players.discord_id, targetUser.id)).get();
    if (!actor) return interaction.editReply('❌ Run `/profile` first.');
    if (!target) return interaction.editReply(`❌ **${targetUser.username}** has no profile.`);
    if (actor.is_broken) return interaction.editReply('❌ You are Broken and cannot rob anyone.');
    if (target.yen < MIN_TARGET_YEN) return interaction.editReply(`❌ **${targetUser.username}** only has ${target.yen} 💰 — not worth the risk.`);

    if (actor.last_robbed_at && Date.now() - actor.last_robbed_at < COOLDOWN_MS) {
      const wait = Math.ceil((COOLDOWN_MS - (Date.now() - actor.last_robbed_at)) / 60000);
      return interaction.editReply(`⏳ Rob cooldown: **${wait}m** remaining.`);
    }

    const actorGradeIdx = GRADE_ORDER.indexOf(actor.grade);
    const targetGradeIdx = GRADE_ORDER.indexOf(target.grade);
    let chance = BASE_CHANCE;
    if (actorGradeIdx > targetGradeIdx) chance += 0.1;
    else if (actorGradeIdx < targetGradeIdx) chance -= 0.1;
    chance = Math.max(0.1, Math.min(0.7, chance));

    const stealAmount = Math.min(Math.floor(target.yen * STEAL_PCT), MAX_STEAL);
    const roll = Math.random();
    const success = roll < chance;

    let newActorYen, newTargetYen;
    const embed = new EmbedBuilder()
      .setTitle(success ? '🗡️ Robbery Successful' : '🚔 Robbery Failed')
      .setColor(success ? 0x2ECC71 : 0xE74C3C);

    let finalStealAmount = stealAmount;
    if (success) {
      sqlite.transaction(() => {
        const fTarget = db.select().from(players).where(eq(players.discord_id, targetUser.id)).get();
        const fActor = db.select().from(players).where(eq(players.discord_id, userId)).get();
        if (!fTarget || !fActor) return;
        const actualSteal = Math.min(Math.floor(fTarget.yen * STEAL_PCT), MAX_STEAL);
        finalStealAmount = actualSteal;
        db.update(players).set({ yen: fTarget.yen - actualSteal }).where(eq(players.discord_id, targetUser.id)).run();
        db.update(players).set({ yen: fActor.yen + actualSteal, last_robbed_at: Date.now() }).where(eq(players.discord_id, userId)).run();
        newActorYen = fActor.yen + actualSteal;
        newTargetYen = fTarget.yen - actualSteal;
      })();
      if (newActorYen === undefined) return interaction.editReply('❌ Robbery failed — target or actor not found.');
      embed.setDescription(`Stole **${finalStealAmount} 💰** from **${targetUser.username}**'s wallet.`);
    } else {
      let failStealAmount = 0, actualFine = 0;
      try {
        sqlite.transaction(() => {
          const fActor = db.select().from(players).where(eq(players.discord_id, userId)).get();
          const fTarget = db.select().from(players).where(eq(players.discord_id, targetUser.id)).get();
          if (!fActor || !fTarget) return;
          failStealAmount = Math.min(Math.floor(fTarget.yen * STEAL_PCT), MAX_STEAL);
          const fine = Math.max(10, Math.floor(failStealAmount * FAIL_FINE_PCT));
          actualFine = Math.min(fine, fActor.yen);
          db.update(players).set({ yen: fActor.yen - actualFine, last_robbed_at: Date.now() }).where(eq(players.discord_id, userId)).run();
          newActorYen = fActor.yen - actualFine;
          newTargetYen = fTarget.yen;
        })();
      } catch (err) {
        console.error(`[${new Date().toISOString()}] rob.js: failure txn failed — ${err.message}`);
      }
      embed.setDescription(`Got caught! Paid **${actualFine} 💰** in fines (${FAIL_FINE_PCT * 100}% of ${failStealAmount} 💰 attempted steal).`);
    }

    embed.addFields(
      { name: `${interaction.user.username} 💰`, value: `${newActorYen ?? 'N/A'}`, inline: true },
      { name: `${targetUser.username} 💰`, value: `${newTargetYen ?? 'N/A'}`, inline: true },
    );

    await interaction.editReply({ embeds: [embed] });
  },
};
