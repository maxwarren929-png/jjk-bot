const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { db } = require('../db/index');
const { players } = require('../db/schema');
const { eq } = require('drizzle-orm');
const { getPlayerTechniques, getLockedVariants, getTechniqueById } = require('../systems/techniques');
const { getCooldowns } = require('../systems/combat');
const { TECHNIQUES } = require('../data/techniques');

const PAGE_SIZE = 5;

function formatCooldown(techniqueId, userId) {
  const userCDs = getCooldowns(userId);
  const remaining = userCDs[techniqueId];
  if (!remaining || remaining <= Date.now()) return '✅ Ready';
  const secs = Math.ceil((remaining - Date.now()) / 1000);
  if (secs >= 3600) return `⏳ ${Math.floor(secs / 3600)}h ${Math.floor((secs % 3600) / 60)}m`;
  if (secs >= 60) return `⏳ ${Math.floor(secs / 60)}m ${secs % 60}s`;
  return `⏳ ${secs}s`;
}

function techField(t, userId, locked = false) {
  if (locked) {
    let req = null;
    try { req = t.unlock_requires ? JSON.parse(t.unlock_requires) : null; } catch { req = null; }
    const reqText = req
      ? (req.type === 'wins' ? `🔒 Unlock: ${req.count} fight wins` : `🔒 Unlock: ${req.type}`)
      : '🔒 Locked';
    return { name: `~~${t.name}~~`, value: reqText, inline: false };
  }
  const cdText = t.cooldown_seconds > 0 ? `${t.cooldown_seconds}s cooldown` : 'No cooldown';
  const dmgText = t.damage_max > 0 ? `${t.damage_min}–${t.damage_max} damage` : 'No damage';
  const cooldownStatus = formatCooldown(t.id, userId);
  return {
    name: `✨ ${t.name} [${t.type}]`,
    value: `${t.description}\n💜 CE: **${t.ce_cost}** | ⚔️ ${dmgText} | ⏱️ ${cdText} | ${cooldownStatus}`,
    inline: false,
  };
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('techniques')
    .setDescription('View all your techniques and locked variants.'),

  async execute(interaction) {
    await interaction.deferReply();
    const discordId = interaction.user.id;
    const player = db.select().from(players).where(eq(players.discord_id, discordId)).get();
    if (!player) {
      await interaction.editReply('❌ No profile found. Run `/profile` first.');
      return;
    }

    const { innate, unlocked } = getPlayerTechniques(player);
    const locked = getLockedVariants(player);
    const innateDead = player.innate_removed;
    const punch = getTechniqueById('punch');

    const allTechs = [];
    if (innate) allTechs.push({ tech: innate, locked: false });
    for (const t of unlocked) allTechs.push({ tech: t, locked: false });
    for (const t of locked) allTechs.push({ tech: t, locked: true });
    if (punch) allTechs.push({ tech: punch, locked: false });

    if (allTechs.length === 0) {
      const embed = new EmbedBuilder()
        .setTitle(`👁️ ${interaction.user.username}'s Techniques`)
        .setColor(0x7B2FBE);
      if (innateDead) {
        embed.setDescription('💀 Your innate technique was destroyed in combat. Purchase a **Technique Reroll** from the shop to gain a new one.');
      } else {
        embed.setDescription('No techniques yet. Run `/profile` to be assigned an innate technique.');
      }
      return interaction.editReply({ embeds: [embed] });
    }

    let page = 0;
    const maxPage = Math.ceil(allTechs.length / PAGE_SIZE) - 1;

    function buildEmbed(p) {
      const embed = new EmbedBuilder()
        .setTitle(`👁️ ${interaction.user.username}'s Techniques`)
        .setColor(0x7B2FBE)
        .setFooter({ text: `Page ${p + 1}/${maxPage + 1} — ${allTechs.length} total` });
      const start = p * PAGE_SIZE;
      const slice = allTechs.slice(start, start + PAGE_SIZE);
      for (const entry of slice) {
        embed.addFields(techField(entry.tech, discordId, entry.locked));
      }
      return embed;
    }

    if (maxPage === 0) {
      return interaction.editReply({ embeds: [buildEmbed(0)] });
    }

    const prevBtn = new ButtonBuilder().setCustomId('prev').setLabel('◀').setStyle(ButtonStyle.Primary).setDisabled(true);
    const nextBtn = new ButtonBuilder().setCustomId('next').setLabel('▶').setStyle(ButtonStyle.Primary);
    const row = new ActionRowBuilder().addComponents(prevBtn, nextBtn);
    const msg = await interaction.editReply({ embeds: [buildEmbed(0)], components: [row] });

    const col = msg.createMessageComponentCollector({ filter: i => i.user.id === interaction.user.id, time: 120_000 });
    col.on('collect', async btn => {
      await btn.deferUpdate();
      if (btn.customId === 'next') page = Math.min(page + 1, maxPage);
      if (btn.customId === 'prev') page = Math.max(page - 1, 0);
      prevBtn.setDisabled(page === 0);
      nextBtn.setDisabled(page === maxPage);
      await interaction.editReply({ embeds: [buildEmbed(page)], components: [row] });
    });
    col.on('end', () => { interaction.editReply({ components: [] }).catch(() => {}); });
  },
};
