const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { db, sqlite } = require('../db/index');
const { players } = require('../db/schema');
const { eq } = require('drizzle-orm');
const { applyTechnique, buildBar, getTechsForPlayer } = require('../systems/combat');
const { TECHNIQUES } = require('../data/techniques');
const { isFlying } = require('../systems/fly-state');
const { isTechniqueLocked } = require('../systems/technique-locker');
const { getBoss, attackBoss } = require('../systems/mahoraga-boss');
const { isTechniquesEnabled } = require('../systems/techniques-toggle');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('use')
    .setDescription('Use a cursed technique on a target.')
    .addStringOption(opt =>
      opt.setName('technique')
        .setDescription('Which technique to use')
        .setRequired(true)
        .setAutocomplete(true))
    .addUserOption(opt =>
      opt.setName('target')
        .setDescription('Who to target')
        .setRequired(true)),

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
    const discordId = interaction.user.id;
    const targetUser = interaction.options.getUser('target');
    const techniqueId = interaction.options.getString('technique');

    if (targetUser.id === discordId) {
      await interaction.editReply('❌ You cannot target yourself.');
      return;
    }

    if (!isTechniquesEnabled(interaction.guild?.id)) {
      await interaction.editReply('❌ Techniques are currently disabled by an admin on this server.');
      return;
    }

    const actor = db.select().from(players).where(eq(players.discord_id, discordId)).get();
    const target = db.select().from(players).where(eq(players.discord_id, targetUser.id)).get();

    if (!actor) { await interaction.editReply('❌ Run `/profile` first.'); return; }
    if (!target) { await interaction.editReply(`❌ **${targetUser.username}** has no profile.`); return; }

    // Check if actor is flying
    if (isFlying(discordId)) {
      await interaction.editReply('❌ You are flying with **Nue** — you cannot use techniques while airborne.');
      return;
    }

    // Check if technique is locked (Confiscation)
    if (isTechniqueLocked(discordId, techniqueId)) {
      await interaction.editReply(`❌ **${techniqueId}** has been confiscated by the court. You cannot use it.`);
      return;
    }

    // Check if Mahoraga boss is active and damage should redirect
    const channelId = interaction.channel.id;
    const bossState = getBoss(channelId);
    let finalTarget = target;
    let bossRedirect = false;
    if (bossState && targetUser.id === bossState.summonerId) {
      bossRedirect = true;
    }

    // Check for consumable items before technique (consumed atomically inside combat transaction)
    const fActorPre = db.select().from(players).where(eq(players.discord_id, discordId)).get();
    const preJob = (() => { try { return JSON.parse(fActorPre?.job_data || '{}'); } catch { return {}; } })();
    const preInv = preJob.__items || [];
    const itemEffects = {
      bonusDamage: preInv.includes('BONUS_DAMAGE_20'),
      silenceTarget: preInv.includes('SILENCE_NEXT'),
    };

    const tech = TECHNIQUES.find(t => t.id === techniqueId);

    const result = applyTechnique(actor, finalTarget, techniqueId, interaction, bossRedirect, itemEffects);
    if (result.error) {
      await interaction.editReply(`❌ ${result.error}`);
      return;
    }

    let silencedTarget = false;
    if (itemEffects.silenceTarget) {
      silencedTarget = true;
    }
    if (silencedTarget) {
      result.log += ` 🔇 *Target silenced — next attack will fizzle!*`;
    }

    // Persist last fight info
    if (result.damage > 0) {
      sqlite.transaction(() => {
        const pf = db.select().from(players).where(eq(players.discord_id, discordId)).get();
        if (!pf) return;
        const pj = (() => { try { return JSON.parse(pf.job_data || '{}'); } catch { return {}; } })();
        pj.__last_fight = {
          target: targetUser?.username || 'unknown',
          technique: tech?.name || techniqueId,
          damage: result.damage,
          won: result.rewards?.winner === discordId,
          yenEarned: (result.rewards?.yenLoss || 0) + (result.rewards?.yenBonus || 0) + (result.rewards?.bountyTotal || 0),
          time: Date.now(),
        };
        db.update(players).set({ job_data: JSON.stringify(pj) }).where(eq(players.discord_id, discordId)).run();
      })();
    }

    // If boss is active and damage was dealt, redirect to boss
    if (bossRedirect && result.damage > 0 && bossState && !bossState.dead) {
      const bossResult = attackBoss(channelId, discordId, result.damage);
      if (bossResult) {
        if (bossResult.killed) {
          result.log += `\n\n⚔️ **Mahoraga has been slain!** All participants are victorious!`;
          try {
            await interaction.channel.send({ content: `⚔️ **Mahoraga has been slain!** All participants are victorious! The target (<@${bossState.targetId}>) is saved!` });
          } catch { /* ok */ }
        } else {
          result.log += `\n\n🌀 **Damage redirected to Mahoraga!** (${bossResult.bossHp}/${bossState.maxHp} HP remaining)`;
        }
      }
    }

    const embed = new EmbedBuilder()
      .setTitle(`⚔️ ${tech?.name || 'Cursed Technique Used'}`)
      .setColor(0xE74C3C)
      .setDescription(result.log)
      .setImage(tech?.gif || null)
      .addFields({ name: '📜 Lore', value: `*${tech?.lore || 'A technique of unknown origin.'}*`, inline: false })
      .setFooter(tech?.lore ? { text: tech.lore.slice(0, 100) } : null)
      .addFields(
        { name: `${actor.username}`, value: `${buildBar(result.actor.ce, result.actor.maxCe, '🟪', '⬛', 10)} ${result.actor.ce}/${result.actor.maxCe} CE`, inline: true },
        { name: `${targetUser.username}`, value: `${buildBar(result.targetHp, target.max_hp)} ${result.targetHp}/${target.max_hp} HP\n${buildBar(result.target.ce, result.target.maxCe, '🟪', '⬛', 10)} ${result.target.ce}/${result.target.maxCe} CE`, inline: true },
      );

    // Statuses on target
    if (result.target?.statuses?.length > 0) {
      embed.addFields({ name: '⚡ Status Effects', value: result.target.statuses.join(', '), inline: false });
    }

    if (result.rewards) {
      const r = result.rewards;
      let rewardText = `🏆 **${targetUser.username}** is BROKEN. Bank + wallet wiped (${r.yenLoss}💰 stolen). +10 CE`;
      if (r.yenBonus) rewardText += `\n💰 **Clan yen bonus: +${r.yenBonus} 💰**`;
      if (r.bountyTotal) rewardText += `\n💰 **Bounty claimed: +${r.bountyTotal} 💰**`;
      if (r.gradeUp) rewardText += `\n⬆️ **Grade Up!** Advanced to **${r.gradeUp}**`;
      embed.addFields({ name: '💀 Target Defeated', value: rewardText, inline: false });
      embed.setColor(0x000000);
    }

    await interaction.editReply({ embeds: [embed] });

    // Achievement tracking
    try {
      const { checkAndUnlock } = require('../systems/achievements');
      if (result.rewards) {
        const ach1 = checkAndUnlock(discordId, 'first_kill');
        if (ach1) await interaction.followUp({ content: `🏆 **Achievement Unlocked: ${ach1.icon} ${ach1.name}!**`, ephemeral: true }).catch(() => {});
        if (result.rewards.bountyTotal) {
          const ach2 = checkAndUnlock(discordId, 'first_bounty');
          if (ach2) await interaction.followUp({ content: `🏆 **Achievement Unlocked: ${ach2.icon} ${ach2.name}!**`, ephemeral: true }).catch(() => {});
        }
        if ((actor.fight_wins || 0) >= 99 && (actor.fight_wins || 0) < 100) {
          const ach3 = checkAndUnlock(discordId, 'centurion');
          if (ach3) await interaction.followUp({ content: `🏆 **Achievement Unlocked: ${ach3.icon} ${ach3.name}!**`, ephemeral: true }).catch(() => {});
        }
      }
      if (techniqueId === 'domain_expansion' || techniqueId === 'simple_domain') {
        const ach = checkAndUnlock(discordId, 'domain_master');
        if (ach) await interaction.followUp({ content: `🏆 **Achievement Unlocked: ${ach.icon} ${ach.name}!**`, ephemeral: true }).catch(() => {});
      }
    } catch { /* ok */ }
  },
};
