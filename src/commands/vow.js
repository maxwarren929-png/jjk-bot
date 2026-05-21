const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { db, sqlite } = require('../db/index');
const { players } = require('../db/schema');
const { eq } = require('drizzle-orm');

const HP_SACRIFICE_PCT = 0.2;
const MIN_HP = 10;
const DURATION = 30 * 60 * 1000;
const activeVows = new Map();

module.exports = {
  data: new SlashCommandBuilder()
    .setName('vow')
    .setDescription('Create a Binding Vow: sacrifice HP for +25% damage on your next fight.'),

  async execute(interaction) {
    await interaction.deferReply();
    const userId = interaction.user.id;

    const now = Date.now();
    const existing = activeVows.get(userId);
    if (existing && existing.expires > now) {
      return interaction.editReply(`✨ You already have a Binding Vow active. It expires <t:${Math.floor(existing.expires / 1000)}:R>.`);
    }

    let result = null;
    sqlite.transaction(() => {
      const fresh = db.select().from(players).where(eq(players.discord_id, userId)).get();
      if (!fresh) { result = '❌ Run `/profile` first.'; return; }
      const sacrifice = Math.max(MIN_HP, Math.floor(fresh.hp * HP_SACRIFICE_PCT));
      if (fresh.hp <= sacrifice) { result = `❌ Your HP is too low. Need at least **${sacrifice + 1} HP**.`; return; }
      db.update(players).set({ hp: fresh.hp - sacrifice }).where(eq(players.discord_id, userId)).run();
      result = { sacrifice };
    })();

    if (typeof result === 'string') return interaction.editReply(result);
    if (!result) return interaction.editReply('❌ Something went wrong. Try again.');

    const expires = now + DURATION;
    activeVows.set(userId, { expires });

    setTimeout(() => {
      if (activeVows.has(userId) && activeVows.get(userId).expires <= Date.now()) {
        activeVows.delete(userId);
      }
    }, DURATION + 1000);

    const embed = new EmbedBuilder()
      .setTitle('⚔️ Binding Vow')
      .setColor(0xE74C3C)
      .setDescription(`Sacrificed **${result.sacrifice} HP**. Your next fight deals **+25% damage**. Expires <t:${Math.floor(expires / 1000)}:R>.`);
    await interaction.editReply({ embeds: [embed] });
  },

  consumeVow(userId) {
    const vow = activeVows.get(userId);
    if (vow && vow.expires > Date.now()) {
      activeVows.delete(userId);
      return true;
    }
    return false;
  },
};
