const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { db, sqlite } = require('../db/index');
const { players } = require('../db/schema');
const { eq } = require('drizzle-orm');

const FOCUS_DURATION = 5 * 60 * 1000;
const HP_COST_PCT = 0.1;
const CE_BOOST = 30;
const REGEN_INTERVAL = 60_000;
const REGEN_AMOUNT = 10;

const activeFocus = new Map();

module.exports = {
  data: new SlashCommandBuilder()
    .setName('focus')
    .setDescription('Sacrifice 10% HP to boost CE regen for 5 minutes.'),

  async execute(interaction) {
    await interaction.deferReply();
    const userId = interaction.user.id;

    const existing = activeFocus.get(userId);
    if (existing && existing.until > Date.now()) {
      const remain = Math.ceil((existing.until - Date.now()) / 60000);
      return interaction.editReply(`🧘 Already focusing. **${remain}m** remaining (+${REGEN_AMOUNT} CE/min).`);
    }
    if (existing) activeFocus.delete(userId);

    let result = null;
    sqlite.transaction(() => {
      const fresh = db.select().from(players).where(eq(players.discord_id, userId)).get();
      if (!fresh) { result = '❌ Run `/profile` first.'; return; }
      const cost = Math.max(1, Math.floor(fresh.hp * HP_COST_PCT));
      if (fresh.hp <= cost) { result = `❌ Not enough HP. Need **${cost + 1} HP** to focus.`; return; }
      db.update(players).set({ hp: fresh.hp - cost }).where(eq(players.discord_id, userId)).run();
      result = { cost };
    })();

    if (typeof result === 'string') return interaction.editReply(result);
    if (!result) return interaction.editReply('❌ Something went wrong.');

    const until = Date.now() + FOCUS_DURATION;
    activeFocus.set(userId, { until });

    let ticks = 0;
    const interval = setInterval(async () => {
      ticks++;
      try {
        sqlite.transaction(() => {
          const fresh = db.select().from(players).where(eq(players.discord_id, userId)).get();
          if (!fresh) return;
          const newCe = Math.min(fresh.ce + REGEN_AMOUNT, fresh.max_ce);
          db.update(players).set({ ce: newCe }).where(eq(players.discord_id, userId)).run();
        })();
        const data = activeFocus.get(userId);
        if (!data || data.until <= Date.now() || ticks >= 5) {
          clearInterval(interval);
          activeFocus.delete(userId);
          await interaction.followUp({ content: `✅ Focus session complete! Total **+${REGEN_AMOUNT * ticks} CE** recovered.`, ephemeral: true }).catch(() => {});
        } else {
          await interaction.followUp({ content: `🧘 Focus: +**${REGEN_AMOUNT} CE** (${ticks}/5)`, ephemeral: true }).catch(() => {});
        }
      } catch { clearInterval(interval); activeFocus.delete(userId); }
    }, REGEN_INTERVAL);

    const embed = new EmbedBuilder()
      .setTitle('🧘 Focus')
      .setColor(0x9B59B6)
      .setDescription(`Sacrificed **${result.cost} HP**. CE regen boosted to +${REGEN_AMOUNT} CE/min for **5 min**.`);
    await interaction.editReply({ embeds: [embed] });
  },
};
