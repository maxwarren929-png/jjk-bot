const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { db, sqlite } = require('../db/index');
const { players } = require('../db/schema');
const { eq } = require('drizzle-orm');

const SACRIFICE_RATIO = 2;
const SACRIFICE_MIN_HP = 20;
const SACRIFICE_MAX_HP = 500;
const COOLDOWN = 30_000;
const activeSacrifice = new Map();

module.exports = {
  data: new SlashCommandBuilder()
    .setName('sacrifice')
    .setDescription('Convert HP into CE at a 2:1 ratio (costs 2 HP per 1 CE).')
    .addIntegerOption(o => o.setName('hp').setDescription('HP to sacrifice').setRequired(true).setMinValue(SACRIFICE_MIN_HP).setMaxValue(SACRIFICE_MAX_HP)),

  async execute(interaction) {
    await interaction.deferReply();
    const userId = interaction.user.id;
    const hpAmount = interaction.options.getInteger('hp');

    const now = Date.now();
    const lastUse = activeSacrifice.get(userId);
    if (lastUse && now - lastUse < COOLDOWN) {
      const secs = Math.ceil((COOLDOWN - (now - lastUse)) / 1000);
      return interaction.editReply(`⏳ Sacrifice cooldown: **${secs}s** remaining.`);
    }

    let result = null;
    sqlite.transaction(() => {
      const fresh = db.select().from(players).where(eq(players.discord_id, userId)).get();
      if (!fresh) { result = '❌ Run `/profile` first.'; return; }
      if (fresh.hp < hpAmount + 1) { result = `❌ Not enough HP. Need **${hpAmount}**, have **${fresh.hp}**.`; return; }
      if (fresh.ce >= fresh.max_ce) { result = '❌ Your CE is already full.'; return; }
      const actualSacrifice = Math.min(hpAmount, fresh.hp - 1, (fresh.max_ce - fresh.ce) * SACRIFICE_RATIO);
      if (actualSacrifice < SACRIFICE_MIN_HP) { result = `❌ Sacrifice would yield too little CE. Need at least **${SACRIFICE_MIN_HP} HP** to convert.`; return; }
      const ceGain = Math.floor(actualSacrifice / SACRIFICE_RATIO);
      db.update(players).set({ hp: fresh.hp - actualSacrifice, ce: Math.min(fresh.ce + ceGain, fresh.max_ce) }).where(eq(players.discord_id, userId)).run();
      result = { hp: actualSacrifice, ce: ceGain };
    })();

    if (typeof result === 'string') return interaction.editReply(result);
    if (!result) return interaction.editReply('❌ Something went wrong. Try again.');
    activeSacrifice.set(userId, now);

    const embed = new EmbedBuilder()
      .setTitle('🔥 Sacrifice')
      .setColor(0xE74C3C)
      .setDescription(`Sacrificed **${result.hp} HP** → gained **${result.ce} CE**.`);
    await interaction.editReply({ embeds: [embed] });
  },
};
