const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { db } = require('../db/index');
const { players } = require('../db/schema');
const { eq } = require('drizzle-orm');
const { applyTechnique, getTechsForPlayer } = require('../systems/combat');
const { TECHNIQUES } = require('../data/techniques');

const SPIRITS = [
  { name: 'Training Dummy', grade: 'Low', hp: 80, ce: 50, maxHp: 80, maxCe: 50 },
  { name: 'Cursed Wraith', grade: 'Medium', hp: 150, ce: 80, maxHp: 150, maxCe: 80 },
  { name: 'Shade Stalker', grade: 'High', hp: 250, ce: 120, maxHp: 250, maxCe: 120 },
  { name: 'Vengeful Spirit', grade: 'Elite', hp: 400, ce: 200, maxHp: 400, maxCe: 200 },
];

const AI_ATTACKS = ['punch'];

module.exports = {
  data: new SlashCommandBuilder()
    .setName('spar')
    .setDescription('Practice combat against an AI opponent (no rewards or penalties).')
    .addStringOption(opt => opt.setName('opponent').setDescription('Choose opponent difficulty').setRequired(true)
      .addChoices(
        { name: '🥋 Training Dummy (Easy)', value: '0' },
        { name: '👻 Cursed Wraith (Medium)', value: '1' },
        { name: '🌑 Shade Stalker (Hard)', value: '2' },
        { name: '💀 Vengeful Spirit (Elite)', value: '3' },
      ))
    .addStringOption(opt => opt.setName('technique').setDescription('Which technique to use').setRequired(true).setAutocomplete(true)),

  async autocomplete(interaction) {
    const focused = interaction.options.getFocused().toLowerCase();
    const player = db.select().from(players).where(eq(players.discord_id, interaction.user.id)).get();
    if (!player) return interaction.respond([]);
    const techs = getTechsForPlayer(player);
    const filtered = techs
      .filter(t => t.name.toLowerCase().includes(focused) || t.id.includes(focused))
      .slice(0, 25)
      .map(t => ({ name: `${t.name} (${t.ce_cost} CE)`, value: t.id }));
    await interaction.respond(filtered);
  },

  async execute(interaction) {
    await interaction.deferReply();
    const player = db.select().from(players).where(eq(players.discord_id, interaction.user.id)).get();
    if (!player) return interaction.editReply('❌ Run `/profile` first.');
    if (player.is_broken) return interaction.editReply('❌ You are Broken and cannot spar.');

    const spiritIdx = parseInt(interaction.options.getString('opponent'));
    const spirit = SPIRITS[spiritIdx];
    if (!spirit) return interaction.editReply('❌ Invalid opponent.');

    const techChoice = interaction.options.getString('technique');
    const tech = TECHNIQUES.find(t => t.id === techChoice) || TECHNIQUES.find(t => t.id === 'punch');
    if (!tech) return interaction.editReply('❌ Technique not found.');

    let log = [];
    let playerHp = player.hp;
    let playerCe = player.ce;
    let spiritHp = spirit.hp;
    let spiritCe = spirit.ce;

    const embed = new EmbedBuilder()
      .setTitle(`🥋 Sparring: ${spirit.name}`)
      .setColor(0x3498DB);

    log.push(`⚔️ **${interaction.user.username}** vs **${spirit.name}** — BEGIN!`);

    const MAX_ROUNDS = 10;
    for (let round = 1; round <= MAX_ROUNDS; round++) {
      if (playerHp <= 0 || spiritHp <= 0) break;

      const aiState = {
        discord_id: 'ai_spar',
        username: spirit.name,
        hp: spiritHp,
        max_hp: spirit.maxHp,
        ce: spiritCe,
        max_ce: spirit.maxCe,
        is_broken: false,
        job_data: '{}',
      };
      const playerState = {
        discord_id: player.discord_id,
        username: player.username,
        hp: playerHp,
        max_hp: player.max_hp,
        ce: playerCe,
        max_ce: player.max_ce,
        is_broken: false,
        job_data: player.job_data || '{}',
      };

      // Player's turn
      if (playerCe < tech.ce_cost) {
        log.push(`❌ Not enough CE. Need ${tech.ce_cost}, have ${playerCe}.`);
        break;
      }

      const result = applyTechnique(playerState, aiState, techChoice, null, true);
      if (result.error) {
        log.push(`❌ ${result.error}`);
        break;
      }

      playerCe = result.actor.ce;
      spiritHp = result.targetHp;
      log.push(result.log);

      if (spiritHp <= 0) {
        log.push(`🏆 **${interaction.user.username}** defeated **${spirit.name}**!`);
        break;
      }

      // AI's turn
      const aiAttack = AI_ATTACKS[Math.floor(Math.random() * AI_ATTACKS.length)];
      const aiResult = applyTechnique(aiState, playerState, aiAttack, null, true);
      playerHp = aiResult.targetHp;
      spiritCe = aiResult.actor.ce;
      log.push(aiResult.log);

      if (playerHp <= 0) {
        log.push(`💀 **${spirit.name}** defeated **${interaction.user.username}**!`);
        break;
      }
    }

    const logStr = log.slice(0, 8).join('\n');
    const remaining = log.length > 8 ? `\n*...and ${log.length - 8} more actions*` : '';
    embed.setDescription(`${logStr}${remaining}`);
    embed.addFields(
      { name: `${interaction.user.username}`, value: `❤️ ${playerHp}/${player.max_hp} HP\n💜 ${playerCe}/${player.max_ce} CE`, inline: true },
      { name: `${spirit.name}`, value: `❤️ ${spiritHp}/${spirit.hp} HP\n💜 ${spiritCe}/${spirit.maxCe} CE`, inline: true },
      { name: '⚠️ Note', value: 'No rewards or penalties earned from sparring.', inline: false },
    );

    await interaction.editReply({ embeds: [embed] });
  },
};
