const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { db, sqlite } = require('../db/index');
const { players } = require('../db/schema');
const { eq } = require('drizzle-orm');

const CE_TO_HP_RATIO = 3;
const MAX_HEAL = 100;
const MIN_CE = 5;
const COOLDOWN = 30_000;
const activeHeals = new Map();

module.exports = {
  data: new SlashCommandBuilder()
    .setName('heal')
    .setDescription('Use Reverse Cursed Technique: convert CE into HP (1 CE → 3 HP).')
    .addIntegerOption(o => o.setName('hp').setDescription('HP to restore').setRequired(true).setMinValue(10).setMaxValue(MAX_HEAL)),

  async execute(interaction) {
    await interaction.deferReply();
    const userId = interaction.user.id;
    const hpAmount = interaction.options.getInteger('hp');

    const now = Date.now();
    const lastUse = activeHeals.get(userId);
    if (lastUse && now - lastUse < COOLDOWN) {
      const secs = Math.ceil((COOLDOWN - (now - lastUse)) / 1000);
      return interaction.editReply(`⏳ Heal cooldown: **${secs}s** remaining.`);
    }

    const ceCost = Math.ceil(hpAmount / CE_TO_HP_RATIO);
    if (ceCost < MIN_CE) return interaction.editReply(`❌ Need at least **${MIN_CE} CE** for Reverse Cursed Technique.`);

    let result = null;
    sqlite.transaction(() => {
      const fresh = db.select().from(players).where(eq(players.discord_id, userId)).get();
      if (!fresh) { result = '❌ Run `/profile` first.'; return; }
      if (fresh.hp >= fresh.max_hp) { result = '❌ Your HP is already full.'; return; }
      if (fresh.ce < ceCost) { result = `❌ Not enough CE. Need **${ceCost}**, have **${fresh.ce}**.`; return; }
      const actualHeal = Math.min(hpAmount, fresh.max_hp - fresh.hp);
      const actualCost = Math.ceil(actualHeal / CE_TO_HP_RATIO);
      db.update(players).set({ hp: fresh.hp + actualHeal, ce: fresh.ce - actualCost }).where(eq(players.discord_id, userId)).run();
      result = { heal: actualHeal, cost: actualCost };
    })();

    if (typeof result === 'string') return interaction.editReply(result);
    if (!result) return interaction.editReply('❌ Something went wrong. Try again.');
    activeHeals.set(userId, now);

    const embed = new EmbedBuilder()
      .setTitle('💚 Reverse Cursed Technique')
      .setColor(0x2ECC71)
      .setDescription(`Healed **${result.heal} HP** using **${result.cost} CE**.`);
    await interaction.editReply({ embeds: [embed] });
  },
};
