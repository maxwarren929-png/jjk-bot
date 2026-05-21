const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { db, sqlite } = require('../db/index');
const { players } = require('../db/schema');
const { eq } = require('drizzle-orm');

// ── Heist state ──────────────────────────────────────────────────────────────
const heists = new Map();
const playerHeists = new Map();
const COOLDOWN_MS = 3600000;
const HEIST_TIMEOUT = 300000;
const MIN_TARGET_BANK = 1000;
const CHANCE_PER_MEMBER = 0.05;
const MAX_CHANCE = 0.75;
const STEAL_PCT = 0.3;
const FAIL_FINE_PCT = 0.1;
const FAIL_FINE_MIN = 50;

const { randomBytes } = require('crypto');

function genId() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let id;
  do {
    const bytes = randomBytes(4);
    id = '';
    for (let i = 0; i < 4; i++) id += chars[bytes[i] % chars.length];
  } while (heists.has(id));
  return id;
}

function cleanupHeist(id) {
  const h = heists.get(id);
  if (h) {
    for (const uid of h.members) playerHeists.delete(uid);
    heists.delete(id);
  }
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('bankrob')
    .setDescription('Plan a group bank robbery.')
    .addSubcommand(sub => sub
      .setName('start')
      .setDescription('Start planning a bank robbery.')
      .addUserOption(opt => opt.setName('target').setDescription('Whose bank to rob').setRequired(true)))
    .addSubcommand(sub => sub
      .setName('join')
      .setDescription('Join a pending bank robbery.')
      .addStringOption(opt => opt.setName('id').setDescription('Heist ID').setRequired(true)))
    .addSubcommand(sub => sub
      .setName('leave')
      .setDescription('Leave your current heist.'))
    .addSubcommand(sub => sub
      .setName('launch')
      .setDescription('Launch the heist (leader only).'))
    .addSubcommand(sub => sub
      .setName('status')
      .setDescription('Check your current heist status.')),

  async execute(interaction) {
    await interaction.deferReply();
    const sub = interaction.options.getSubcommand();
    const userId = interaction.user.id;

    if (sub === 'start') {
      if (playerHeists.has(userId)) return interaction.editReply('❌ You are already in a heist. Leave first.');

      const actor = db.select().from(players).where(eq(players.discord_id, userId)).get();
      if (!actor) return interaction.editReply('❌ Run `/profile` first.');
      if (actor.is_broken) return interaction.editReply('❌ You are Broken.');

      const targetUser = interaction.options.getUser('target');
      if (targetUser.id === userId) return interaction.editReply('❌ Cannot rob your own bank.');
      const target = db.select().from(players).where(eq(players.discord_id, targetUser.id)).get();
      if (!target) return interaction.editReply(`❌ **${targetUser.username}** has no profile.`);
      if ((target.bank_balance || 0) < MIN_TARGET_BANK)
        return interaction.editReply(`❌ **${targetUser.username}**'s bank only has ${target.bank_balance || 0} 💰. Not worth it.`);

      const id = genId();
      const heist = { id, leaderId: userId, targetId: targetUser.id, targetName: targetUser.username, members: new Set([userId]), startedAt: Date.now() };
      heists.set(id, heist);
      playerHeists.set(userId, id);

      setTimeout(() => {
        if (heists.has(id)) {
          cleanupHeist(id);
        }
      }, HEIST_TIMEOUT);

      const embed = new EmbedBuilder()
        .setTitle('🏦 Bank Robbery Planned')
        .setColor(0xE74C3C)
        .setDescription(`Target: **${targetUser.username}**'s bank (${target.bank_balance || 0} 💰)`)
        .addFields(
          { name: '🆔 Heist ID', value: `\`${id}\``, inline: true },
          { name: '👤 Crew', value: `1 (you) — ${heist.members.size * 5}% success`, inline: true },
          { name: '⏳ Expires', value: '5 minutes', inline: true },
        )
        .setFooter({ text: 'Others can join with /bankrob join' });
      return interaction.editReply({ embeds: [embed] });
    }

    if (sub === 'join') {
      if (playerHeists.has(userId)) return interaction.editReply('❌ You are already in a heist. Leave first.');

      const id = interaction.options.getString('id').toUpperCase();
      const heist = heists.get(id);
      if (!heist) return interaction.editReply('❌ Heist not found or expired.');

      if (heist.members.has(userId)) return interaction.editReply('❌ You are already in this heist.');
      if (heist.leaderId === userId) return interaction.editReply('❌ You are the leader of this heist.');

      const player = db.select().from(players).where(eq(players.discord_id, userId)).get();
      if (!player) return interaction.editReply('❌ Run `/profile` first.');
      if (player.is_broken) return interaction.editReply('❌ You are Broken.');

      heist.members.add(userId);
      playerHeists.set(userId, id);

      const memberCount = heist.members.size;
      const chance = Math.min(memberCount * CHANCE_PER_MEMBER, MAX_CHANCE);
      const splitPct = (1 / memberCount) * 100;

      const embed = new EmbedBuilder()
        .setTitle('🔫 Joined Heist')
        .setColor(0xE74C3C)
        .setDescription(`Joined the robbery on **${heist.targetName}**'s bank!`)
        .addFields(
          { name: '👤 Crew', value: `${memberCount} — ${Math.floor(chance * 100)}% success`, inline: true },
          { name: '💰 Your Split', value: `${splitPct.toFixed(1)}% of stolen amount`, inline: true },
        );
      return interaction.editReply({ embeds: [embed] });
    }

    if (sub === 'leave') {
      const id = playerHeists.get(userId);
      if (!id) return interaction.editReply('❌ You are not in a heist.');
      const heist = heists.get(id);
      if (!heist) { playerHeists.delete(userId); return interaction.editReply('❌ Heist no longer active.'); }
      if (heist.leaderId === userId) { cleanupHeist(id); return interaction.editReply('✅ Heist cancelled.'); }
      heist.members.delete(userId);
      playerHeists.delete(userId);
      return interaction.editReply('✅ You left the heist.');
    }

    if (sub === 'launch') {
      const id = playerHeists.get(userId);
      if (!id) return interaction.editReply('❌ You are not in a heist.');
      const heist = heists.get(id);
      if (!heist) { playerHeists.delete(userId); return interaction.editReply('❌ Heist no longer active.'); }
      if (heist.leaderId !== userId) return interaction.editReply('❌ Only the heist leader can launch.');

      const target = db.select().from(players).where(eq(players.discord_id, heist.targetId)).get();
      if (!target || (target.bank_balance || 0) < MIN_TARGET_BANK) {
        cleanupHeist(id);
        return interaction.editReply('❌ Target no longer has enough bank balance.');
      }

      const memberCount = heist.members.size;
      const chance = Math.min(memberCount * CHANCE_PER_MEMBER, MAX_CHANCE);
      const roll = Math.random();
      const success = roll < chance;

      let finalStolenAmount = 0;
      let finalBankRemaining = 0;

      const embed = new EmbedBuilder()
        .setTitle(success ? '💰 Heist Successful!' : '🚔 Heist Failed!')
        .setColor(success ? 0x2ECC71 : 0xE74C3C);

      if (success) {
        let successNames = [];
        sqlite.transaction(() => {
          const freshTarget = db.select().from(players).where(eq(players.discord_id, heist.targetId)).get();
          const bankBalance = freshTarget?.bank_balance || 0;
          finalStolenAmount = Math.floor(bankBalance * STEAL_PCT);
          const splitAmount = Math.floor(finalStolenAmount / memberCount);
          finalBankRemaining = bankBalance - finalStolenAmount;

          db.update(players).set({ bank_balance: finalBankRemaining })
            .where(eq(players.discord_id, heist.targetId)).run();

          for (const uid of heist.members) {
            const p = db.select().from(players).where(eq(players.discord_id, uid)).get();
            if (p) {
              db.update(players).set({ yen: p.yen + splitAmount, last_robbed_at: Date.now() })
                .where(eq(players.discord_id, uid)).run();
              successNames.push(`<@${uid}> (+${splitAmount} 💰)`);
            }
          }
        })();
        embed.setDescription(`Escaped with **${finalStolenAmount} 💰** from **${heist.targetName}**'s bank!`);
        embed.addFields(
          { name: `🤝 Split (${memberCount} ways)`, value: successNames.join('\n'), inline: false },
          { name: `🎯 Target's Bank`, value: `${finalBankRemaining} 💰`, inline: true },
        );
      } else {
        sqlite.transaction(() => {
          for (const uid of heist.members) {
            const p = db.select().from(players).where(eq(players.discord_id, uid)).get();
            if (p) {
              const fine = Math.max(FAIL_FINE_MIN, Math.floor(p.yen * FAIL_FINE_PCT));
              db.update(players).set({ yen: p.yen - fine, last_robbed_at: Date.now() })
                .where(eq(players.discord_id, uid)).run();
            }
          }
        })();
        embed.setDescription(`The robbery on **${heist.targetName}**'s bank was foiled!`);
        embed.addFields({ name: '💸 Fines Paid', value: `${memberCount} members each lost ${FAIL_FINE_PCT * 100}% of wallet (min ${FAIL_FINE_MIN})`, inline: false });
      }

      cleanupHeist(id);
      return interaction.editReply({ embeds: [embed] });
    }

    if (sub === 'status') {
      const id = playerHeists.get(userId);
      if (!id) return interaction.editReply('❌ You are not in a heist.');
      const heist = heists.get(id);
      if (!heist) { playerHeists.delete(userId); return interaction.editReply('❌ Heist no longer active.'); }
      const memberCount = heist.members.size;
      const chance = Math.min(memberCount * CHANCE_PER_MEMBER, MAX_CHANCE);
      const embed = new EmbedBuilder()
        .setTitle('🏦 Heist Status')
        .setColor(0xF1C40F)
        .addFields(
          { name: '🆔 ID', value: `\`${id}\``, inline: true },
          { name: '🎯 Target', value: heist.targetName, inline: true },
          { name: '👤 Crew', value: `${memberCount} — ${Math.floor(chance * 100)}% success`, inline: true },
          { name: '👑 Leader', value: heist.leaderId === userId ? 'You' : `<@${heist.leaderId}>`, inline: true },
          { name: '💰 Your Split', value: `${(1 / memberCount * 100).toFixed(1)}%`, inline: true },
          { name: '⏳ Expires', value: `<t:${Math.floor((heist.startedAt + HEIST_TIMEOUT) / 1000)}:R>`, inline: true },
        );
      return interaction.editReply({ embeds: [embed] });
    }
  },
};
