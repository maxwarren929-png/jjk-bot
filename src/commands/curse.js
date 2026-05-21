const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { db, sqlite } = require('../db/index');
const { players } = require('../db/schema');
const { eq } = require('drizzle-orm');

const CURSE_COST = 50;
const CURSE_DURATION = 120_000;
const CURSE_COOLDOWN = 30_000;
const activeCurses = new Map();

module.exports = {
  data: new SlashCommandBuilder()
    .setName('curse')
    .setDescription('Place a cursed debuff on another player (2 min, -20% damage).')
    .addUserOption(o => o.setName('target').setDescription('Player to curse').setRequired(true)),

  async execute(interaction) {
    await interaction.deferReply();
    const userId = interaction.user.id;
    const targetUser = interaction.options.getUser('target');

    if (targetUser.id === userId) return interaction.editReply('❌ You cannot curse yourself.');
    if (targetUser.bot) return interaction.editReply('❌ You cannot curse a bot.');

    const now = Date.now();
    const lastUse = activeCurses.get(userId);
    if (lastUse && now - lastUse < CURSE_COOLDOWN) {
      const secs = Math.ceil((CURSE_COOLDOWN - (now - lastUse)) / 1000);
      return interaction.editReply(`⏳ Curse cooldown: **${secs}s** remaining.`);
    }

    let result = null;
    sqlite.transaction(() => {
      const actor = db.select().from(players).where(eq(players.discord_id, userId)).get();
      const target = db.select().from(players).where(eq(players.discord_id, targetUser.id)).get();
      if (!actor) { result = '❌ Run `/profile` first.'; return; }
      if (!target) { result = `❌ **${targetUser.username}** has no profile.`; return; }
      if (actor.ce < CURSE_COST) { result = `❌ Not enough CE. Need **${CURSE_COST}**, you have **${actor.ce}**.`; return; }
      const tJob = (() => { try { return JSON.parse(target.job_data || '{}'); } catch { return {}; } })();
      if (!tJob.__curses) tJob.__curses = {};
      tJob.__curses[userId] = { by: interaction.user.username, until: now + CURSE_DURATION };
      db.update(players).set({ ce: actor.ce - CURSE_COST }).where(eq(players.discord_id, userId)).run();
      db.update(players).set({ job_data: JSON.stringify(tJob) }).where(eq(players.discord_id, targetUser.id)).run();
      result = true;
    })();

    if (!result) return;
    activeCurses.set(userId, now);

    const embed = new EmbedBuilder()
      .setTitle('☠️ Cursed')
      .setColor(0x8B0000)
      .setDescription(`A curse has been placed on **${targetUser.username}**. They deal **-20% damage** for **2 minutes**.`);
    await interaction.editReply({ embeds: [embed] });
  },
};
