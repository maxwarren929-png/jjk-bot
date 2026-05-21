const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { db } = require('../db/index');
const { players } = require('../db/schema');
const { eq } = require('drizzle-orm');
const { assignInnate, getTechniqueById } = require('../systems/techniques');
const { getMembership, getClan } = require('../systems/clans');
const { buildBar, buildCeBar } = require('../systems/combat');

const GRADE_EMOJI = {
  'Grade 4': '🔵', 'Grade 3': '🟢', 'Grade 2': '🟡',
  'Grade 1': '🟠', 'Semi-Special Grade': '🔴', 'Special Grade': '👁️',
};
const REP_COLOR = {
  Neutral: 0x7B2FBE, Honored: 0x2ECC71, Feared: 0xE74C3C, Criminal: 0xFF6600,
};

module.exports = {
  data: new SlashCommandBuilder()
    .setName('profile')
    .setDescription('View your sorcerer profile. Creates one if you are new.')
    .addUserOption(opt => opt.setName('user').setDescription('Player to view (defaults to you)').setRequired(false)),

  async execute(interaction) {
    await interaction.deferReply();
    const targetUser = interaction.options.getUser('user') || interaction.user;
    const discordId = targetUser.id;
    const username = targetUser.username;

    let player = db.select().from(players).where(eq(players.discord_id, discordId)).get();

    // Only auto-create profile when viewing self
    if (!player && targetUser.id !== interaction.user.id) {
      await interaction.editReply(`❌ **${username}** has no profile yet.`);
      return;
    }

    if (!player) {
      db.insert(players).values({
        discord_id: discordId,
        username,
        hp: 1000, max_hp: 1000,
        ce: 100, max_ce: 100,
        grade: 'Grade 4',
        yen: 50,
        unlocked_techniques: '[]',
        reputation: 'Neutral',
        is_broken: false,
        fight_wins: 0,
        bounty_kills: 0,
        created_at: Date.now(),
      }).run();
      player = db.select().from(players).where(eq(players.discord_id, discordId)).get();
      assignInnate(discordId);
      player = db.select().from(players).where(eq(players.discord_id, discordId)).get();
    }

    // Auto-resolve broken state after 24h
    if (player.is_broken && player.broken_until && player.broken_until < Date.now()) {
      db.update(players).set({ is_broken: false, broken_until: null, hp: Math.floor(player.max_hp * 0.3) })
        .where(eq(players.discord_id, discordId)).run();
      player = db.select().from(players).where(eq(players.discord_id, discordId)).get();
    }

    const innateDead = player.innate_removed;
    const innate = innateDead ? null : getTechniqueById(player.innate_technique_id);
    const membership = getMembership(discordId);
    const clan = membership ? getClan(membership.clan_id) : null;

    const hpBar = buildBar(player.hp, player.max_hp, '🟥', '⬛', 10);
    const ceBar = buildCeBar(player.ce, player.max_ce);

    const embed = new EmbedBuilder()
      .setTitle(`${GRADE_EMOJI[player.grade] || '⚔️'} ${username}'s Profile`)
      .setColor(REP_COLOR[player.reputation] || 0x7B2FBE)
      .addFields(
        { name: '🩸 HP', value: `${hpBar} ${player.hp}/${player.max_hp}`, inline: false },
        { name: '🟪 CE', value: `${ceBar} ${player.ce}/${player.max_ce}`, inline: false },
        { name: '🏅 Grade', value: `${GRADE_EMOJI[player.grade]} ${player.grade}`, inline: true },
        { name: '💰 Yen', value: `${player.yen} yen`, inline: true },
        { name: '🏆 Wins', value: `${player.fight_wins}`, inline: true },
        {
          name: '👁️ Innate Technique',
          value: innate ? `**${innate.name}**\n${innate.description}` : innateDead ? '~~Destroyed~~' : 'None',
          inline: false,
        },
        { name: '⚔️ Clan', value: clan ? `**${clan.name}**` : 'Clanless', inline: true },
        { name: '🎭 Reputation', value: player.reputation, inline: true },
      );

    if (player.is_broken) {
      const brokenText = player.innate_removed
        ? 'You are broken. Your innate technique was destroyed. You cannot fight or use your domain.'
        : 'You are broken. You cannot fight or use your domain.';
      embed.addFields({ name: '💀 BROKEN', value: brokenText, inline: false });
      embed.setColor(0x111111);
    }

    if (player.training_until && player.training_until > Date.now()) {
      const remainMin = Math.ceil((player.training_until - Date.now()) / 60000);
      embed.addFields({ name: '🏋️ Training', value: `${player.training_type} — **${remainMin}m remaining**`, inline: false });
    }

    await interaction.editReply({ embeds: [embed] });
  },
};
