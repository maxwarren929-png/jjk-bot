const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { db, sqlite } = require('../db/index');
const { players } = require('../db/schema');
const { eq } = require('drizzle-orm');

const MEDITATE_DURATION = 60_000;
const MEDITATE_TICKS = 6;
const MEDITATE_INTERVAL = MEDITATE_DURATION / MEDITATE_TICKS;
const MEDITATE_CE_PER_TICK = 15;

module.exports = {
  data: new SlashCommandBuilder()
    .setName('meditate')
    .setDescription('Meditate for 60s to recover 90 CE in bursts.'),

  async execute(interaction) {
    await interaction.deferReply();
    const player = db.select().from(players).where(eq(players.discord_id, interaction.user.id)).get();
    if (!player) return interaction.editReply('❌ Run `/profile` first.');

    const job = (() => { try { return JSON.parse(player.job_data || '{}'); } catch { return {}; } })();
    const meditateUntil = job.__meditate_until;
    if (meditateUntil && meditateUntil > Date.now()) {
      const remaining = meditateUntil - Date.now();
      if (remaining > MEDITATE_DURATION * 2) {
        delete job.__meditate_until;
        sqlite.transaction(() => {
          db.update(players).set({ job_data: JSON.stringify(job) }).where(eq(players.discord_id, interaction.user.id)).run();
        })();
      } else {
        return interaction.editReply('❌ You are already meditating. Wait for it to finish.');
      }
    }

    if (player.ce >= player.max_ce) return interaction.editReply('❌ Your CE is already full.');

    sqlite.transaction(() => {
      const fresh = db.select().from(players).where(eq(players.discord_id, interaction.user.id)).get();
      if (!fresh) return;
      const fJob = (() => { try { return JSON.parse(fresh.job_data || '{}'); } catch { return {}; } })();
      fJob.__meditate_until = Date.now() + MEDITATE_DURATION;
      db.update(players).set({ job_data: JSON.stringify(fJob) }).where(eq(players.discord_id, interaction.user.id)).run();
    })();

    await interaction.editReply('🧘 You begin meditating, focusing your cursed energy. You will recover CE every 10s for 60s.');

    let tick = 0;
    const interval = setInterval(async () => {
      tick++;
      try {
        sqlite.transaction(() => {
          const fresh = db.select().from(players).where(eq(players.discord_id, interaction.user.id)).get();
          if (!fresh) return;
          const newCe = Math.min(fresh.ce + MEDITATE_CE_PER_TICK, fresh.max_ce);
          db.update(players).set({ ce: newCe }).where(eq(players.discord_id, interaction.user.id)).run();
        })();
        if (tick < MEDITATE_TICKS) {
          await interaction.followUp({ content: `✨ +**${MEDITATE_CE_PER_TICK}** CE recovered... (${tick}/${MEDITATE_TICKS})`, ephemeral: true });
        } else {
          clearInterval(interval);
          const fresh = db.select().from(players).where(eq(players.discord_id, interaction.user.id)).get();
          const fJob = (() => { try { return JSON.parse(fresh?.job_data || '{}'); } catch { return {}; } })();
          delete fJob.__meditate_until;
          db.update(players).set({ job_data: JSON.stringify(fJob) }).where(eq(players.discord_id, interaction.user.id)).run();
          await interaction.followUp({ content: `✅ Meditation complete! Total **${MEDITATE_CE_PER_TICK * MEDITATE_TICKS} CE** recovered.`, ephemeral: true });
        }
      } catch { clearInterval(interval); }
    }, MEDITATE_INTERVAL);
  },
};
