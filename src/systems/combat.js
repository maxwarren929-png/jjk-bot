const { db } = require('../db/index');
const { players } = require('../db/schema');
const { eq } = require('drizzle-orm');
const { getTechniqueById, getPlayerTechniques } = require('./techniques');
const { checkGradeUp } = require('./training');
const { buildEffectContext, resolveEffects, resolveLegacyStatus } = require('./effects');
const { executeDiscordActions } = require('./discord-actions');
const { getDomainMultiplier } = require('./domain-state');

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

  // Deduct CE and apply cooldown
  actorState.ce -= tech.ce_cost;
  userCDs[techniqueId] = now + tech.cooldown_seconds * 1000;

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

    // Black Flash
    if (rollBlackFlash()) {
      damage = Math.floor(damage * 1.5);
      logLine += `✨ **BLACK FLASH!** `;
    }

    targetState.hp = Math.max(0, targetState.hp - damage);
    logLine += `⚔️ **${actor.username}** used **${tech.name}** → **${damage} damage** to **${target.username}** (HP: ${targetState.hp}/${targetState.maxHp})`;
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
    const stolenYen = target.yen + (target.bank_balance || 0);

    targetUpdate.is_broken = true;
    targetUpdate.hp = 0;
    targetUpdate.broken_until = Date.now() + 24 * 60 * 60 * 1000;
    targetUpdate.yen = 0;
    targetUpdate.bank_balance = 0;
    targetUpdate.innate_technique_id = null;
    targetUpdate.innate_removed = true;

    const newWins = actor.fight_wins + 1;
    actorUpdate.fight_wins = newWins;
    actorUpdate.yen = actor.yen + stolenYen;
    actorUpdate.ce = Math.min(actor.ce + 10, actor.max_ce);
    actorUpdate.hp = actor.hp;

    rewards = { winner: actor.discord_id, loser: target.discord_id, yenLoss: stolenYen };

    // Reputation
    let newRep = actor.reputation;
    if (newWins >= 10 && newRep === 'Neutral') newRep = 'Honored';
    if (actor.bounty_kills >= 5) newRep = 'Feared';
    if (newRep !== actor.reputation) actorUpdate.reputation = newRep;

    // Grade up
    const tempPlayer = { ...actor, fight_wins: newWins };
    const gradeUp = checkGradeUp(tempPlayer);
    if (gradeUp) rewards.gradeUp = gradeUp;
  }

  db.update(players).set(actorUpdate).where(eq(players.discord_id, actor.discord_id)).run();
  if (!skipTargetDamage) {
    db.update(players).set(targetUpdate).where(eq(players.discord_id, target.discord_id)).run();
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
