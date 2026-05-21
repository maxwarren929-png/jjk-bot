const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { db, sqlite } = require('../db/index');
const { players } = require('../db/schema');
const { eq } = require('drizzle-orm');

const HUNT_COOLDOWN = 30 * 60 * 1000;

const SPIRITS = [
  { name: 'Grade 4 Curse', grade: 'Low', hp: 30, rewardMin: 10, rewardMax: 30, ceCost: 15 },
  { name: 'Grade 3 Curse', grade: 'Medium', hp: 60, rewardMin: 30, rewardMax: 60, ceCost: 25 },
  { name: 'Grade 2 Curse', grade: 'High', hp: 100, rewardMin: 50, rewardMax: 120, ceCost: 35 },
  { name: 'Grade 1 Curse', grade: 'High', hp: 150, rewardMin: 80, rewardMax: 200, ceCost: 50 },
  { name: 'Special Grade Curse', grade: 'Elite', hp: 300, rewardMin: 150, rewardMax: 400, ceCost: 75 },
];

const HUNT_RESULTS = [
  { emoji: '⚡', text: 'struck it down with a clean blow', mult: 1.5 },
  { emoji: '🔥', text: 'overwhelmed it with cursed energy', mult: 1.3 },
  { emoji: '💥', text: 'barely defeated it after a tough fight', mult: 1.0 },
  { emoji: '🩸', text: 'took heavy damage but prevailed', mult: 0.8 },
  { emoji: '🌀', text: 'escaped with minor injuries', mult: 0.5 },
];

function canHunt(player) {
  if (!player.last_hunt_at) return { ok: true };
  const elapsed = Date.now() - player.last_hunt_at;
  if (elapsed < HUNT_COOLDOWN) {
    const remaining = Math.ceil((HUNT_COOLDOWN - elapsed) / 60000);
    return { ok: false, remaining };
  }
  return { ok: true };
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('hunt')
    .setDescription('Hunt cursed spirits for CE, yen, and items.'),

  async execute(interaction) {
    await interaction.deferReply();

    const player = db.select().from(players).where(eq(players.discord_id, interaction.user.id)).get();
    if (!player) return interaction.editReply('❌ Run `/profile` first.');

    const check = canHunt(player);
    if (!check.ok) return interaction.editReply(`❌ You must wait **${check.remaining} min** before hunting again.`);

    const spirit = SPIRITS[Math.floor(Math.random() * SPIRITS.length)];
    if (player.ce < spirit.ceCost) return interaction.editReply(`❌ Need **${spirit.ceCost}** 💜 CE to hunt. You have **${player.ce}** 💜.`);

    const result = HUNT_RESULTS[Math.floor(Math.random() * HUNT_RESULTS.length)];
    const baseReward = Math.floor(Math.random() * (spirit.rewardMax - spirit.rewardMin + 1)) + spirit.rewardMin;
    const reward = Math.floor(baseReward * result.mult);

    const damageTaken = Math.floor(spirit.hp * (1 - result.mult / 2));
    const playerHp = Math.max(1, (player.hp || 100) - damageTaken);

    sqlite.transaction(() => {
      db.update(players).set({
        ce: Math.max(0, player.ce - spirit.ceCost + Math.floor(reward * 0.3)),
        yen: (player.yen || 0) + Math.floor(reward * 0.7),
        hp: playerHp,
        last_hunt_at: Date.now(),
      }).where(eq(players.discord_id, interaction.user.id)).run();
    })();

    const embed = new EmbedBuilder()
      .setTitle(`👹 ${spirit.name}`)
      .setColor(spirit.grade === 'Elite' ? 0xE74C3C : spirit.grade === 'High' ? 0xF39C12 : 0x3498DB)
      .setDescription(`**${interaction.user.username}** ${result.emoji} ${result.text} the **${spirit.name}**!`)
      .addFields(
        { name: '💰 Reward', value: `${Math.floor(reward * 0.7)} 💰 yen`, inline: true },
        { name: '💜 CE Gained', value: `${Math.floor(reward * 0.3)} 💜`, inline: true },
        { name: '💔 Damage Taken', value: `-${damageTaken} HP (${playerHp} HP remaining)`, inline: true },
      );
    await interaction.editReply({ embeds: [embed] });
  },
};
