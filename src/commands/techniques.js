const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { db } = require('../db/index');
const { players } = require('../db/schema');
const { eq } = require('drizzle-orm');
const { getPlayerTechniques, getLockedVariants, getTechniqueById } = require('../systems/techniques');
const { getCooldowns } = require('../systems/combat');
const { getLockedTechniques } = require('../systems/technique-locker');
const { TECHNIQUES } = require('../data/techniques');

function formatCooldown(techniqueId, userId) {
  const userCDs = getCooldowns(userId);
  const remaining = userCDs[techniqueId];
  if (!remaining || remaining <= Date.now()) return '✅ Ready';
  const secs = Math.ceil((remaining - Date.now()) / 1000);
  if (secs >= 3600) return `⏳ ${Math.floor(secs / 3600)}h ${Math.floor((secs % 3600) / 60)}m`;
  if (secs >= 60) return `⏳ ${Math.floor(secs / 60)}m ${secs % 60}s`;
  return `⏳ ${secs}s`;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('techniques')
    .setDescription('View techniques for yourself or another player.')
    .addUserOption(opt =>
      opt.setName('user')
        .setDescription('Player to inspect (defaults to you)')
        .setRequired(false)),

  async execute(interaction) {
    await interaction.deferReply();
    const targetUser = interaction.options.getUser('user') || interaction.user;
    const player = db.select().from(players).where(eq(players.discord_id, targetUser.id)).get();
    if (!player) {
      return interaction.editReply(`❌ **${targetUser.username}** has no profile.`);
    }

    const { innate, unlocked } = getPlayerTechniques(player);
    const jobData = (() => { try { return JSON.parse(player.job_data || '{}'); } catch { return {}; } })();
    const mastery = jobData.__mastery || {};

    if (!innate) {
      const embed = new EmbedBuilder()
        .setTitle(`⚔️ ${targetUser.username}'s Techniques`)
        .setColor(0x7B2FBE)
        .setDescription(player.innate_removed
          ? '💀 Their innate technique was **destroyed**.'
          : '❌ No innate technique assigned yet. Run `/profile` to get one.');
      return interaction.editReply({ embeds: [embed] });
    }

    const embed = new EmbedBuilder()
      .setTitle(`⚔️ ${targetUser.username}'s Techniques`)
      .setColor(0x9B59B6)
      .setDescription(`**Innate:** ${innate.name}`);

    const innateField = [
      `**Cost:** ${innate.ce_cost} CE | **Type:** ${innate.type}`,
      `**Cooldown:** ${innate.cooldown_seconds}s | ${formatCooldown(innate.id, player.discord_id)}`,
      '',
      innate.description,
    ].join('\n');
    embed.addFields({ name: `🔹 ${innate.name}`, value: innateField, inline: false });

    const lockedTechs = getLockedTechniques(player.discord_id);

    if (unlocked.length > 1) {
      const variantLines = unlocked.filter(t => t.id !== 'punch').map(t => {
        const cdStatus = formatCooldown(t.id, player.discord_id);
        const confiscated = lockedTechs.includes(t.id) ? ' 🔒 **Confiscated**' : '';
        const mCount = mastery[t.id] || 0;
        const mBonus = mCount >= 20 ? 20 : mCount >= 15 ? 15 : mCount >= 10 ? 10 : mCount >= 5 ? 5 : 0;
        const mStr = mBonus > 0 ? ` 🌟 Mastery +${mBonus}%` : '';
        return `**${t.name}** — ${t.ce_cost} CE — ${cdStatus}${confiscated}${mStr}\n└ ${t.description}`;
      });
      if (variantLines.length > 0) {
        embed.addFields({ name: '🎯 Unlocked Variants', value: variantLines.join('\n\n'), inline: false });
      }
    }

    const punch = getTechniqueById('punch');
    if (punch && unlocked.some(t => t.id === 'punch')) {
      embed.addFields({ name: '👊 Basic Punch', value: `**Cost:** ${punch.ce_cost} CE | **Damage:** ${punch.damage_min}–${punch.damage_max}\n**Cooldown:** ${punch.cooldown_seconds}s | ${formatCooldown('punch', player.discord_id)}\n└ ${punch.description}`, inline: false });
    }

    const lockedVariants = getLockedVariants(player);
    if (lockedVariants.length > 0) {
      const lockedLines = lockedVariants.slice(0, 10).map(t => {
        let req = null;
        try { req = t.unlock_requires ? JSON.parse(t.unlock_requires) : null; } catch { req = null; }
        const reqText = req
          ? (req.type === 'wins' ? `🔒 ${req.count} wins` : `🔒 ${req.type}`)
          : '🔒 Locked';
        return `**${t.name}** — ${t.ce_cost} CE — ${reqText}`;
      });
      if (lockedVariants.length > 10) lockedLines.push(`… and ${lockedVariants.length - 10} more`);
      embed.addFields({ name: '🔒 Locked Variants', value: lockedLines.join('\n'), inline: false });
    }

    if (lockedTechs.length > 0) {
      const names = lockedTechs.map(id => {
        const t = TECHNIQUES.find(tech => tech.id === id);
        return t ? t.name : id;
      });
      embed.addFields({ name: '🏛️ Confiscated by Court', value: names.join(', '), inline: false });
    }

    await interaction.editReply({ embeds: [embed] });
  },
};
