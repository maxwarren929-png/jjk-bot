const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { db, sqlite } = require('../db/index');
const { players } = require('../db/schema');
const { eq } = require('drizzle-orm');

const REST_DURATION = 30_000;
const REST_HP_PCT = 0.3;
const activeRests = new Map();

module.exports = {
  data: new SlashCommandBuilder()
    .setName('rest')
    .setDescription('Rest for 30 seconds to recover 30% of your max HP.'),

  async execute(interaction) {
    await interaction.deferReply();
    const player = db.select().from(players).where(eq(players.discord_id, interaction.user.id)).get();
    if (!player) return interaction.editReply('❌ Run `/profile` first.');

    const job = (() => { try { return JSON.parse(player.job_data || '{}'); } catch { return {}; } })();
    const restUntil = job.__rest_until;
    if (restUntil && restUntil > Date.now()) {
      const remaining = restUntil - Date.now();
      if (remaining > REST_DURATION * 2) {
        delete job.__rest_until;
        sqlite.transaction(() => {
          db.update(players).set({ job_data: JSON.stringify(job) }).where(eq(players.discord_id, interaction.user.id)).run();
        })();
      } else {
        const secs = Math.ceil(remaining / 1000);
        return interaction.editReply(`❌ You are already resting. **${secs}s** remaining.`);
      }
    }

    if (player.hp >= player.max_hp) return interaction.editReply('❌ Your HP is already full.');

    const recover = Math.floor(player.max_hp * REST_HP_PCT);
    sqlite.transaction(() => {
      const fresh = db.select().from(players).where(eq(players.discord_id, interaction.user.id)).get();
      if (!fresh) return;
      const fJob = (() => { try { return JSON.parse(fresh.job_data || '{}'); } catch { return {}; } })();
      fJob.__rest_until = Date.now() + REST_DURATION;
      db.update(players).set({ job_data: JSON.stringify(fJob) }).where(eq(players.discord_id, interaction.user.id)).run();
    })();

    await interaction.editReply(`💤 You start resting. You'll recover **${recover} HP** in **30s**.`);

    const userId = interaction.user.id;
    if (activeRests.has(userId)) {
      clearTimeout(activeRests.get(userId));
      activeRests.delete(userId);
    }

    const timeout = setTimeout(async () => {
      try {
        sqlite.transaction(() => {
          const fresh = db.select().from(players).where(eq(players.discord_id, interaction.user.id)).get();
          if (!fresh) return;
          const fJob = (() => { try { return JSON.parse(fresh.job_data || '{}'); } catch { return {}; } })();
          delete fJob.__rest_until;
          const newHp = Math.min(fresh.hp + recover, fresh.max_hp);
          db.update(players).set({ hp: newHp, job_data: JSON.stringify(fJob) }).where(eq(players.discord_id, interaction.user.id)).run();
        })();
        await interaction.followUp({ content: `✅ Rest complete! Recovered **${recover} HP**.`, ephemeral: true });
      } catch { /* ok */ }
      finally { activeRests.delete(userId); }
    }, REST_DURATION);
    activeRests.set(userId, timeout);
  },
};
