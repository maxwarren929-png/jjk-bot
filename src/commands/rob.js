const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { db } = require('../db/index');
const { players } = require('../db/schema');
const { eq } = require('drizzle-orm');

const GRADE_ORDER = ['Grade 4', 'Grade 3', 'Grade 2', 'Grade 1', 'Semi-Special Grade', 'Special Grade'];
const COOLDOWN_MS = 60000;
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

    const lastRob = db.select().from(players).where(eq(players.discord_id, userId)).get().last_robbed_at;
    if (lastRob && Date.now() - lastRob < COOLDOWN_MS) {
      const wait = Math.ceil((COOLDOWN_MS - (Date.now() - lastRob)) / 60000);
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

    const embed = new EmbedBuilder()
      .setTitle(success ? '🗡️ Robbery Successful' : '🚔 Robbery Failed')
      .setColor(success ? 0x2ECC71 : 0xE74C3C);

    if (success) {
      db.update(players).set({ yen: target.yen - stealAmount }).where(eq(players.discord_id, targetUser.id)).run();
      db.update(players).set({ yen: actor.yen + stealAmount, last_robbed_at: Date.now() }).where(eq(players.discord_id, userId)).run();
      embed.setDescription(`Stole **${stealAmount} 💰** from **${targetUser.username}**'s wallet.`);
    } else {
      const fine = Math.max(10, Math.floor(stealAmount * FAIL_FINE_PCT));
      const actualFine = Math.min(fine, actor.yen);
      db.update(players).set({ yen: actor.yen - actualFine, last_robbed_at: Date.now() }).where(eq(players.discord_id, userId)).run();
      embed.setDescription(`Got caught! Paid **${actualFine} 💰** in fines.`);
    }

    embed.addFields(
      { name: `${interaction.user.username} 💰`, value: `${success ? actor.yen + stealAmount : actor.yen - Math.min(fine, actor.yen)}`, inline: true },
      { name: `${targetUser.username} 💰`, value: `${success ? target.yen - stealAmount : target.yen}`, inline: true },
    );

    await interaction.editReply({ embeds: [embed] });
  },
};
