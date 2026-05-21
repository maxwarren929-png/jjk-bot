const { db, sqlite } = require('../db/index');
const { players } = require('../db/schema');
const { eq } = require('drizzle-orm');
const { getTechniqueById, getPlayerTechniques } = require('./techniques');
const { checkGradeUp } = require('./training');
const { buildEffectContext, resolveEffects, resolveLegacyStatus } = require('./effects');
const { executeDiscordActions } = require('./discord-actions');
const { getDomainMultiplier } = require('./domain-state');
const { claimBounties } = require('./bounties');
const { getPlayerClanBonus } = require('./clans');

// In-memory cooldown tracking: userId -> { techniqueId -> timestamp }
const cooldowns = new Map();

function getCooldowns(userId) {
  if (!cooldowns.has(userId)) cooldowns.set(userId, {});
  return cooldowns.get(userId);
}

function getTechsForPlayer(player) {
  const { innate, unlocked } = getPlayerTechniques(player);
  const punch = getTechniqueById('punch');
  return [innate, ...unlocked, punch].filter(Boolean);
}

function buildBar(current, max, filled = '🟥', empty = '⬛', blocks = 10) {
  const pct = Math.max(0, current / max);
  const filledCount = Math.round(pct * blocks);
  return filled.repeat(filledCount) + empty.repeat(blocks - filledCount);
}

function buildCeBar(current, max) {
  return buildBar(current, max, '🟪', '⬛', 10);
}

function rollBlackFlash() {
  return Math.random() < 0.05;
}

function applyTechnique(actor, target, techniqueId, interaction = null, skipTargetDamage = false) {
  const tech = getTechniqueById(techniqueId);
  if (!tech) return { error: 'Unknown technique.' };

  // Broken check
  if (actor.is_broken) return { error: 'You are Broken and cannot use techniques.' };

  // CE check
  if (actor.ce < tech.ce_cost) return { error: `Not enough CE. Need ${tech.ce_cost}, have ${actor.ce}.` };

  // Cooldown check (in-memory)
  const userCDs = getCooldowns(actor.discord_id);
  const now = Date.now();
  if (userCDs[techniqueId] && userCDs[techniqueId] > now) {
    const secs = Math.ceil((userCDs[techniqueId] - now) / 1000);
    return { error: `${tech.name} is on cooldown for ${secs}s.` };
  }

  // Build in-memory combat snapshots (don't persist, just for effect resolution)
  const actorState = {
    id: actor.discord_id,
    username: actor.username,
    hp: actor.hp,
    maxHp: actor.max_hp,
    ce: actor.ce,
    maxCe: actor.max_ce,
    shield: 0,
    statuses: [],
    cooldowns: {},
  };
  const targetState = {
    id: target.discord_id,
    username: target.username,
    hp: target.hp,
    maxHp: target.max_hp,
    ce: target.ce,
    maxCe: target.max_ce,
    shield: 0,
    statuses: [],
    cooldowns: {},
  };

  // Deduct CE and apply cooldown (in memory — persisted after DB write succeeds)
  actorState.ce -= tech.ce_cost;

  // Check if actor is silenced (Binding Ring effect — persisted via job_data.__statuses.silenced_until)
  const actorJobData = (() => { try { return JSON.parse(actor.job_data || '{}'); } catch { return {}; } })();
  const actorStatuses = actorJobData.__statuses || {};
  if (actorStatuses.silenced_until && actorStatuses.silenced_until > Date.now()) {
    delete actorStatuses.silenced_until;
    actorJobData.__statuses = actorStatuses;
    sqlite.transaction(() => {
      const fresh = db.select().from(players).where(eq(players.discord_id, actor.discord_id)).get();
      if (!fresh) return;
      const freshJob = (() => { try { return JSON.parse(fresh.job_data || '{}'); } catch { return {}; } })();
      if (freshJob.__statuses) delete freshJob.__statuses.silenced_until;
      db.update(players).set({ ce: Math.max(0, fresh.ce - tech.ce_cost), job_data: JSON.stringify(freshJob) }).where(eq(players.discord_id, actor.discord_id)).run();
    })();
    return { ok: true, damage: 0, log: `🔇 **${actor.username}** is silenced — the attack fizzled!`, targetHp: targetState.hp, rewards: null, actor: actorState, target: targetState };
  }

  // Resolve on-use effects
  const ctx = buildEffectContext(actorState, targetState, null);
  const useResults = resolveEffects(tech, 'onUse', ctx);

  let damage = 0;
  let logLine = '';

  // Resolve on-hit effects
  const hitResults = resolveEffects(tech, 'onHit', ctx);
  damage = hitResults.damage || 0;

  if (damage > 0) {
    // Idle Transfiguration bypasses shields
    if (techniqueId !== 'idle_transfiguration' && targetState.shield > 0) {
      const absorbed = Math.min(targetState.shield, damage);
      targetState.shield -= absorbed;
      damage -= absorbed;
      logLine += `🛡️ Shield absorbed ${absorbed} damage. `;
    }

    // Projection Sorcery double hit (legacy compat)
    if (tech.status_effect === 'DOUBLE_HIT' && (!tech.effects || tech.effects.length === 0)) {
      damage += Math.floor(damage * 0.7);
      logLine += `⚡ Double strike! `;
    }

    // Domain Expansion 1.25x damage bonus
    const domainMult = getDomainMultiplier(actor.discord_id);
    if (domainMult > 1.0) {
      const bonusDamage = Math.floor(damage * (domainMult - 1));
      damage += bonusDamage;
      logLine += `🔮 *Domain amplification +${bonusDamage} damage!* `;
    }

    // Clan passive: DAMAGE_BOOST +5%
    const clanBonus = getPlayerClanBonus(actor.discord_id);
    if (clanBonus === 'DAMAGE_BOOST') {
      const boostDmg = Math.floor(damage * 0.05);
      damage += boostDmg;
      logLine += ` ⚔️ *Clan damage boost +${boostDmg}!* `;
    }

    // Black Flash
    if (rollBlackFlash()) {
      damage = Math.floor(damage * 1.5);
      logLine += `✨ **BLACK FLASH!** `;
    }

    targetState.hp = Math.max(0, targetState.hp - damage);
    logLine += `⚔️ **${actor.username}** used **${tech.name}** → **${damage} damage** to **${target.username}** (HP: ${targetState.hp}/${targetState.maxHp})`;
    logLine += ` 💜 CE: ${actorState.ce}/${actorState.maxCe}`;
  } else {
    logLine += `✨ **${actor.username}** used **${tech.name}**`;
  }

  // Legacy status effects
  if (!tech.effects && tech.status_effect) {
    const rs = resolveLegacyStatus(tech.status_effect);
    if (rs === 'DOUBLE_HIT') {} // handled
    else if (['BURN', 'BLEED', 'FREEZE', 'SKIP', 'CONFUSE', 'SLEEP', 'STOP', 'EXPLODE'].includes(rs)) {
      targetState.statuses.push(rs);
      logLine += ` 💫 *${rs} applied*`;
    } else if (rs === 'SHIELD') { actorState.shield += 40; logLine += ` 🛡️ *Shield +40*`; }
    else if (rs === 'POWER_UP') { actorState.statuses.push('POWER_UP'); logLine += ` 💪 *Power Up*`; }
    else if (rs === 'NULLIFY') { actorState.statuses.push('NULLIFY'); logLine += ` 🚫 *Nullify ready*`; }
    else if (rs === 'COOLDOWN_MANIP') { logLine += ` ⏱️ *Cooldowns reset*`; }
  }

  // Status effect logs from effects pipeline
  for (const entry of useResults.logEntries) {
    if (!logLine.includes(entry)) logLine += ` ${entry}`;
  }
  for (const entry of hitResults.logEntries) {
    if (!logLine.includes(entry)) logLine += ` ${entry}`;
  }

  // Tick DoTs
  if (targetState.statuses.includes('BURN')) {
    targetState.hp = Math.max(0, targetState.hp - 8);
    logLine += ` 🔥 *Burn ticks: -8 HP*`;
  }
  if (targetState.statuses.includes('BLEED')) {
    targetState.hp = Math.max(0, targetState.hp - 5);
    logLine += ` 🩸 *Bleed ticks: -5 HP*`;
  }
  if (targetState.statuses.includes('EXPLODE')) {
    targetState.hp = Math.max(0, targetState.hp - 20);
    targetState.statuses = targetState.statuses.filter(s => s !== 'EXPLODE');
    logLine += ` 💥 *Explode triggers: -20 HP*`;
  }

  // Persist to DB
  const actorUpdate = { ce: actorState.ce };
  const targetUpdate = { hp: targetState.hp, ce: targetState.ce };

  // Handle target death
  let rewards = null;
  if (!skipTargetDamage && targetState.hp <= 0) {
    let stolenYen = target.yen + (target.bank_balance || 0);
    const targetClanBonus = getPlayerClanBonus(target.discord_id);
    if (targetClanBonus === 'DEATH_REDUCTION') {
      const saved = Math.floor(stolenYen * 0.1);
      stolenYen -= saved;
    }

    targetUpdate.is_broken = true;
    targetUpdate.hp = 0;
    targetUpdate.broken_until = Date.now() + 24 * 60 * 60 * 1000;
    targetUpdate.yen = 0;
    targetUpdate.bank_balance = 0;
    if (target.innate_technique_id) {
      targetUpdate.innate_technique_id = null;
      targetUpdate.innate_removed = true;
    }

    const newWins = actor.fight_wins + 1;
    actorUpdate.fight_wins = newWins;
    const actorClanBonus = getPlayerClanBonus(actor.discord_id);
    const yenBonus = actorClanBonus === 'YEN_BOOST' ? Math.floor(stolenYen * 0.1) : 0;
    actorUpdate.yen = actor.yen + stolenYen + yenBonus;
    actorUpdate.ce = Math.min(actorState.ce + 10, actor.max_ce);
    actorUpdate.hp = actor.hp;

    rewards = { winner: actor.discord_id, loser: target.discord_id, yenLoss: stolenYen, yenBonus };

    // Bounty rewards
    const bountyResult = claimBounties(actor.discord_id, target.discord_id);
    if (bountyResult) {
      rewards.bountyTotal = bountyResult.total;
      actorUpdate.yen += bountyResult.total;
    }

    // Reputation
    let newRep = actor.reputation;
    if (newWins >= 10 && newRep === 'Neutral') newRep = 'Honored';
    if (actor.bounty_kills >= 5) newRep = 'Feared';
    if (newRep !== actor.reputation) actorUpdate.reputation = newRep;

    // Grade up
    const tempPlayer = { ...actor, fight_wins: newWins };
    const gradeUp = checkGradeUp(tempPlayer);
    if (gradeUp) {
      rewards.gradeUp = gradeUp;
      actorUpdate.grade = gradeUp;
    }
  }

  sqlite.transaction(() => {
    const freshActor = db.select().from(players).where(eq(players.discord_id, actor.discord_id)).get();
    const freshTarget = db.select().from(players).where(eq(players.discord_id, target.discord_id)).get();
    if (freshActor) {
      const setData = { ...actorUpdate };
      if (actorUpdate.yen !== undefined) {
        setData.yen = (freshActor.yen || 0) + (actorUpdate.yen - (actor.yen || 0));
      }
      db.update(players).set(setData).where(eq(players.discord_id, actor.discord_id)).run();
    }
    if (!skipTargetDamage && freshTarget) {
      db.update(players).set(targetUpdate).where(eq(players.discord_id, target.discord_id)).run();
    }
  })();

  // Persist cooldown in memory only after DB write succeeds
  userCDs[techniqueId] = now + tech.cooldown_seconds * 1000;

  // Send death notification DM
  if (rewards && interaction) {
    interaction.client.users.fetch(target.discord_id).then(targetUser => {
      if (!targetUser) return;
      const { EmbedBuilder } = require('discord.js');
      const deathEmbed = new EmbedBuilder()
        .setTitle('💀 You have been defeated!')
        .setColor(0x000000)
        .setDescription(`**${actor.username}** destroyed you in combat!`)
        .addFields(
          { name: '💰 Losses', value: `All yen lost (${rewards.yenLoss} 💰)`, inline: false },
          { name: '🩸 Status', value: 'You are **Broken** for 24 hours.', inline: false },
        );
      if (rewards.bountyTotal) {
        deathEmbed.addFields({ name: '💰 Bounty Collected', value: `Your bounty of **${rewards.bountyTotal} 💰** was claimed.`, inline: false });
      }
      targetUser.send({ embeds: [deathEmbed] }).catch(() => {});
    }).catch(() => {});
  }

  if (interaction && tech) {
    const ctx = {
      interaction,
      actor,
      target,
      channel: interaction.channel,
      guild: interaction.guild,
    };
    executeDiscordActions(tech.discord_actions || (tech.discord_action ? [tech.discord_action] : []), ctx);
  }

  return { ok: true, damage, log: logLine, targetHp: targetState.hp, rewards, actor: actorState, target: targetState };
}

module.exports = { applyTechnique, buildBar, buildCeBar, getTechsForPlayer, getCooldowns };
