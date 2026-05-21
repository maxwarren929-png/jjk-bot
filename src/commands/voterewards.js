const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { db, sqlite } = require('../db/index');
const { players } = require('../db/schema');
const { eq } = require('drizzle-orm');

const VOTE_COOLDOWN = 12 * 60 * 60 * 1000; // 12 hours
const VOTE_CE = 30;
const VOTE_YEN = 200;

module.exports = {
  data: new SlashCommandBuilder()
    .setName('voterewards')
    .setDescription('Claim your daily voting reward (CE + yen).'),

  async execute(interaction) {
    await interaction.deferReply();
    const player = db.select().from(players).where(eq(players.discord_id, interaction.user.id)).get();
    if (!player) return interaction.editReply('❌ Run `/profile` first.');

    const job = (() => { try { return JSON.parse(player.job_data || '{}'); } catch { return {}; } })();
    const lastVote = job.__last_vote || 0;
    const elapsed = Date.now() - lastVote;
    if (elapsed < VOTE_COOLDOWN) {
      const remaining = Math.ceil((VOTE_COOLDOWN - elapsed) / 3600000);
      return interaction.editReply(`❌ You already claimed your voting reward. Come back in **${remaining}h**.`);
    }

    sqlite.transaction(() => {
      const fresh = db.select().from(players).where(eq(players.discord_id, interaction.user.id)).get();
      if (!fresh) return;
      const fJob = (() => { try { return JSON.parse(fresh.job_data || '{}'); } catch { return {}; } })();
      fJob.__last_vote = Date.now();
      db.update(players).set({
        ce: Math.min(fresh.ce + VOTE_CE, fresh.max_ce),
        yen: fresh.yen + VOTE_YEN,
        job_data: JSON.stringify(fJob),
      }).where(eq(players.discord_id, interaction.user.id)).run();
    })();

    const embed = new EmbedBuilder()
      .setTitle('🗳️ Voting Reward Claimed!')
      .setColor(0xF1C40F)
      .setDescription(`Thanks for supporting the server!`)
      .addFields(
        { name: '💜 CE Gained', value: `+${VOTE_CE}`, inline: true },
        { name: '💰 Yen Gained', value: `+${VOTE_YEN}`, inline: true },
        { name: '⏱️ Next Vote', value: `In **12h**`, inline: true },
      );
    await interaction.editReply({ embeds: [embed] });
  },
};
