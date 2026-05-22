const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { db, sqlite } = require('../db/index');
const { players } = require('../db/schema');
const { eq } = require('drizzle-orm');
const { formatCooldown } = require('../systems/discord-utils');

const BLESS_RATIO = 2;
const BLESS_MIN = 10;
const BLESS_MAX = 500;
const BLESS_COOLDOWN = 60_000;
const activeBless = new Map();

module.exports = {
  data: new SlashCommandBuilder()
    .setName('bless')
    .setDescription('Heal another player by spending CE.')
    .addUserOption(o => o.setName('target').setDescription('Player to heal').setRequired(true))
    .addIntegerOption(o => o.setName('amount').setDescription('HP to heal').setRequired(true).setMinValue(BLESS_MIN).setMaxValue(BLESS_MAX)),

  async execute(interaction) {
    await interaction.deferReply();
    const userId = interaction.user.id;
    const targetUser = interaction.options.getUser('target');
    const amount = interaction.options.getInteger('amount');

    if (targetUser.id === userId) return interaction.editReply('❌ You cannot bless yourself.');
    if (targetUser.bot) return interaction.editReply('❌ You cannot bless a bot.');

    const now = Date.now();
    const lastUse = activeBless.get(userId);
    if (lastUse && now - lastUse < BLESS_COOLDOWN) {
      return interaction.editReply(`⏳ Bless on cooldown ${formatCooldown(lastUse, BLESS_COOLDOWN)}`);
    }

    const ceCost = amount * BLESS_RATIO;
    let result = null;
    sqlite.transaction(() => {
      const actor = db.select().from(players).where(eq(players.discord_id, userId)).get();
      const target = db.select().from(players).where(eq(players.discord_id, targetUser.id)).get();
      if (!actor) { result = '❌ Run `/profile` first.'; return; }
      if (!target) { result = `❌ **${targetUser.username}** has no profile.`; return; }
      if (actor.ce < ceCost) { result = `❌ Not enough CE. Need **${ceCost}**, you have **${actor.ce}**.`; return; }
      if (target.hp >= target.max_hp) { result = `❌ **${targetUser.username}** already has full HP.`; return; }
      const actualHeal = Math.min(amount, target.max_hp - target.hp);
      const actualCost = actualHeal * BLESS_RATIO;
      db.update(players).set({ ce: actor.ce - actualCost }).where(eq(players.discord_id, userId)).run();
      db.update(players).set({ hp: target.hp + actualHeal }).where(eq(players.discord_id, targetUser.id)).run();
      result = { heal: actualHeal, cost: actualCost };
    })();

    if (typeof result === 'string') return interaction.editReply(result);
    if (!result) return interaction.editReply('❌ Something went wrong. Try again.');
    activeBless.set(userId, now);

    const embed = new EmbedBuilder()
      .setTitle('✨ Blessing')
      .setColor(0x2ECC71)
      .setDescription(`**${targetUser.username}** was healed for **${result.heal} HP**. You spent **${result.cost} CE**.`);
    await interaction.editReply({ embeds: [embed] });
  },
};
