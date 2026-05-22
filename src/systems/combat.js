const { db, sqlite } = require('../db/index');
const { players, bounties } = require('../db/schema');
const { eq } = require('drizzle-orm');
const { EmbedBuilder } = require('discord.js');
const { getTechniqueById, getPlayerTechniques } = require('./techniques');
const { checkGradeUp } = require('./training');
const { buildEffectContext, resolveEffects, resolveLegacyStatus } = require('./effects');
const { executeDiscordActions } = require('./discord-actions');
const { getDomainMultiplier } = require('./domain-state');
const { getPlayerClanBonus } = require('./clans');
const { getEquipmentBonuses } = require('./equipment');
const vowCommand = require('../commands/vow');

// In-memory cooldown tracking: userId -> { techniqueId -> timestamp }
const cooldowns = new Map();

function getCooldowns(userId) {
  if (!cooldowns.has(userId)) cooldowns.set(userId, {});
  return cooldowns.get(userId);
}

function getTechsForPlayer(player) {
  const { innate, unlocked } = getPlayerTechniques(player);
  return [innate, ...unlocked].filter(Boolean);
}

function buildBar(current, max, filled = '🟥', empty = '⬛', blocks = 10) {
  const pct = max > 0 ? Math.max(0, current / max) : 0;
  const filledCount = Math.round(pct * blocks);
  return filled.repeat(filledCount) + empty.repeat(blocks - filledCount);
}

function buildCeBar(current, max) {
  return buildBar(current, max, '🟪', '⬛', 10);
}

function rollBlackFlash() {
  return Math.random() < 0.05;
}

function applyTechnique(actor, target, techniqueId, interaction = null, skipTargetDamage = false, itemEffects = null) {
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

  // Technique mastery tracking
  const masteryData = (() => {
    try {
      const jd = JSON.parse(actor.job_data || '{}');
      return jd.__mastery || {};
    } catch { return {}; }
  })();
  const masteryCount = masteryData[techniqueId] || 0;
  const masteryBonus = masteryCount >= 20 ? 20 : masteryCount >= 15 ? 15 : masteryCount >= 10 ? 10 : masteryCount >= 5 ? 5 : 0;

  // Build in-memory combat snapshots (don't persist, just for effect resolution)
  const actorBonuses = getEquipmentBonuses(actor.discord_id);
  const targetBonuses = getEquipmentBonuses(target.discord_id);
  const targetCDs = getCooldowns(target.discord_id);
  const actorState = {
    id: actor.discord_id,
    username: actor.username,
    hp: actor.hp,
    maxHp: actor.max_hp + (actorBonuses.bonusMaxHp || 0),
    ce: actor.ce,
    maxCe: actor.max_ce + (actorBonuses.bonusMaxCe || 0),
    shield: 0,
    statuses: [],
    cooldowns: userCDs,
  };
  const targetState = {
    id: target.discord_id,
    username: target.username,
    hp: target.hp,
    maxHp: target.max_hp + (targetBonuses.bonusMaxHp || 0),
    ce: target.ce,
    maxCe: target.max_ce + (targetBonuses.bonusMaxCe || 0),
    shield: 0,
    statuses: [],
    cooldowns: targetCDs,
  };

  // Deduct CE and apply cooldown (in memory — persisted after DB write succeeds)
  actorState.ce -= tech.ce_cost;

  // Re-fetch to verify silence is still active (data may be stale)
  const freshActorData = db.select().from(players).where(eq(players.discord_id, actor.discord_id)).get();
  if (freshActorData) {
    const freshJob = (() => { try { return JSON.parse(freshActorData.job_data || '{}'); } catch { return {}; } })();
    const freshStatuses = freshJob.__statuses || {};
    if (freshStatuses.silenced_until && freshStatuses.silenced_until > Date.now()) {
      sqlite.transaction(() => {
        const reFetch = db.select().from(players).where(eq(players.discord_id, actor.discord_id)).get();
        if (!reFetch) return;
        const reJob = (() => { try { return JSON.parse(reFetch.job_data || '{}'); } catch { return {}; } })();
        if (reJob.__statuses) delete reJob.__statuses.silenced_until;
        db.update(players).set({ job_data: JSON.stringify(reJob) }).where(eq(players.discord_id, actor.discord_id)).run();
      })();
      return { ok: true, damage: 0, log: `🔇 **${actor.username}** is silenced — the attack fizzled!`, targetHp: targetState.hp, rewards: null, actor: actorState, target: targetState };
    }
  }

  // Resolve on-use effects
  const ctx = buildEffectContext(actorState, targetState, null);
  const useResults = resolveEffects(tech, 'onUse', ctx);

  let damage = 0;
  let logLine = '';

  // Resolve on-hit effects
  const hitResults = resolveEffects(tech, 'onHit', ctx);
  damage = (hitResults.damage || 0) + (hitResults.bonusDamage || 0) + (hitResults.aoeDamage || 0);

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

    // Binding Vow damage buff (+25%)
    if (vowCommand.consumeVow(actor.discord_id)) {
      const vowDmg = Math.floor(damage * 0.25);
      damage += vowDmg;
      logLine += ` ⚔️ *Binding Vow +${vowDmg}!* `;
    }

    // Technique mastery bonus
    if (masteryBonus > 0) {
      const masteryDmg = Math.floor(damage * masteryBonus / 100);
      damage += masteryDmg;
      logLine += ` 🌟 *Mastery +${masteryDmg}!* `;
    }

    // Equipment weapon bonus (actorBonuses from outer scope)
    if (actorBonuses.bonusDamage > 0) {
      damage += actorBonuses.bonusDamage;
      logLine += ` ⚔️ *Weapon +${actorBonuses.bonusDamage}!* `;
    }

    // Item bonus damage (Split Soul Katana)
    if (itemEffects && itemEffects.bonusDamage) {
      damage += 20;
      logLine += ` 🗡️ *Split Soul Katana +20 damage!* `;
    }

    // Black Flash
    if (rollBlackFlash()) {
      damage = Math.floor(damage * 1.5);
      logLine += `✨ **BLACK FLASH!** `;
    }

    // Equipment armor reduction (targetBonuses from outer scope)
    if (targetBonuses.damageReduction > 0) {
      const reduced = Math.floor(damage * targetBonuses.damageReduction);
      damage -= reduced;
      logLine += ` 🛡️ *Armor -${reduced}!* `;
    }

    // Curse debuff: -20% damage if target has an active curse
    const curseJob = (() => { try { return JSON.parse(target.job_data || '{}'); } catch { return {}; } })();
    const curses = curseJob.__curses || {};
    const hasActiveCurse = Object.values(curses).some(c => c.until > Date.now());
    if (hasActiveCurse) {
      const curseReduction = Math.floor(damage * 0.2);
      damage -= curseReduction;
      logLine += ` ☠️ *Cursed -${curseReduction}!* `;
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
  // Handle target death
  let rewards = null;
  if (!skipTargetDamage && targetState.hp <= 0) {
    rewards = { winner: actor.discord_id, loser: target.discord_id, yenBonus: 0, yenLoss: 0 };
  }

  sqlite.transaction(() => {
    const freshActor = db.select().from(players).where(eq(players.discord_id, actor.discord_id)).get();
    const freshTarget = db.select().from(players).where(eq(players.discord_id, target.discord_id)).get();
    const targetClanBonus = freshTarget ? getPlayerClanBonus(target.discord_id) : null;
    if (freshActor) {
      if (itemEffects) {
        const job = (() => { try { return JSON.parse(freshActor.job_data || '{}'); } catch { return {}; } })();
        const inv = job.__items || [];
        if (itemEffects.bonusDamage && inv.includes('BONUS_DAMAGE_20')) {
          const idx = inv.indexOf('BONUS_DAMAGE_20');
          inv.splice(idx, 1);
          job.__items = inv;
          db.update(players).set({ job_data: JSON.stringify(job) }).where(eq(players.discord_id, actor.discord_id)).run();
        }
        if (itemEffects.silenceTarget && inv.includes('SILENCE_NEXT')) {
          const idx = inv.indexOf('SILENCE_NEXT');
          inv.splice(idx, 1);
          job.__items = inv;
          if (freshTarget) {
            const targetData = (() => { try { return JSON.parse(freshTarget.job_data || '{}'); } catch { return {}; } })();
            if (!targetData.__statuses) targetData.__statuses = {};
            targetData.__statuses.silenced_until = Date.now() + 3600_000;
            db.update(players).set({ job_data: JSON.stringify(job) }).where(eq(players.discord_id, actor.discord_id)).run();
            db.update(players).set({ job_data: JSON.stringify(targetData) }).where(eq(players.discord_id, target.discord_id)).run();
          }
        }
      }
      const setData = { ce: Math.max(0, freshActor.ce - tech.ce_cost) };
      if (rewards && freshTarget) {
        let stolenYen = freshTarget.yen + (freshTarget.bank_balance || 0);
        if (targetClanBonus === 'DEATH_REDUCTION') {
          const saved = Math.floor(stolenYen * 0.1);
          stolenYen -= saved;
        }
        const actorClanBonus = getPlayerClanBonus(actor.discord_id);
        const yenBonus = actorClanBonus === 'YEN_BOOST' ? Math.floor(stolenYen * 0.1) : 0;
        const newWins = freshActor.fight_wins + 1;

        setData.yen = freshActor.yen + stolenYen + yenBonus;
        setData.fight_wins = newWins;
        setData.ce = Math.min(Math.max(0, freshActor.ce - tech.ce_cost) + 10, freshActor.max_ce);
        setData.hp = freshActor.hp;

        rewards.yenLoss = stolenYen;
        rewards.yenBonus = yenBonus;

        // Inline bounty claim (no nested transaction)
        const bountyRows = db.select().from(bounties).where(eq(bounties.target_id, target.discord_id)).all();
        let bountyCount = 0;
        if (bountyRows.length > 0) {
          const total = bountyRows.reduce((sum, b) => sum + b.amount, 0);
          for (const b of bountyRows) {
            db.delete(bounties).where(eq(bounties.id, b.id)).run();
          }
          setData.yen += total;
          setData.bounty_kills = (freshActor.bounty_kills || 0) + bountyRows.length;
          rewards.bountyTotal = total;
          bountyCount = bountyRows.length;
        }

        let newRep = freshActor.reputation;
        if (newWins >= 10 && newRep === 'Neutral') newRep = 'Honored';
        if ((freshActor.bounty_kills || 0) + bountyCount >= 5) newRep = 'Feared';
        if (newRep !== freshActor.reputation) setData.reputation = newRep;

        const tempPlayer = { ...freshActor, fight_wins: newWins };
        const gradeUp = checkGradeUp(tempPlayer);
        if (gradeUp) {
          rewards.gradeUp = gradeUp;
          setData.grade = gradeUp;
        }
      }
      db.update(players).set(setData).where(eq(players.discord_id, actor.discord_id)).run();
    }
    if (!skipTargetDamage && freshTarget) {
      const targetSet = {
        hp: targetState.hp,
        ce: freshTarget.ce,
      };
      if (targetState.hp <= 0) {
        targetSet.is_broken = true;
        targetSet.hp = 0;
        targetSet.broken_until = Date.now() + 24 * 60 * 60 * 1000;
        targetSet.fight_losses = (freshTarget.fight_losses || 0) + 1;
        if (targetClanBonus === 'DEATH_REDUCTION') {
          const savedAmount = Math.floor((freshTarget.yen + (freshTarget.bank_balance || 0)) * 0.1);
          targetSet.yen = Math.min(savedAmount, freshTarget.yen);
          targetSet.bank_balance = Math.max(0, savedAmount - targetSet.yen);
        } else {
          targetSet.yen = 0;
          targetSet.bank_balance = 0;
        }
        if (freshTarget.innate_technique_id) {
          targetSet.innate_technique_id = null;
          targetSet.innate_removed = true;
        }
      }
      db.update(players).set(targetSet).where(eq(players.discord_id, target.discord_id)).run();
    }
    // Increment technique mastery (re-query to pick up item consumption writes)
    const masteryFresh = db.select().from(players).where(eq(players.discord_id, actor.discord_id)).get();
    if (masteryFresh) {
      const actorJob = (() => { try { return JSON.parse(masteryFresh.job_data || '{}'); } catch { return {}; } })();
      if (!actorJob.__mastery) actorJob.__mastery = {};
      actorJob.__mastery[techniqueId] = (actorJob.__mastery[techniqueId] || 0) + 1;
      // Preserve any __items that were written by item consumption above
      db.update(players).set({ job_data: JSON.stringify(actorJob) }).where(eq(players.discord_id, actor.discord_id)).run();
    }
    // ELO rating update (must use latest job_data to preserve mastery write)
    if (!skipTargetDamage && freshTarget && targetState.hp <= 0) {
      const eloActor = db.select().from(players).where(eq(players.discord_id, actor.discord_id)).get();
      const eloTarget = db.select().from(players).where(eq(players.discord_id, target.discord_id)).get();
      if (eloActor && eloTarget) {
        const RATING_K = 32;
        const actorElo = (() => { try { return JSON.parse(eloActor.job_data || '{}').__elo || 1000; } catch { return 1000; } })();
        const targetElo = (() => { try { return JSON.parse(eloTarget.job_data || '{}').__elo || 1000; } catch { return 1000; } })();
        const expected = 1 / (1 + Math.pow(10, (targetElo - actorElo) / 400));
        const newActorElo = Math.round(actorElo + RATING_K * (1 - expected));
        const newTargetElo = Math.round(targetElo + RATING_K * (0 - (1 - expected)));
        const actorJobElo = (() => { try { return JSON.parse(eloActor.job_data || '{}'); } catch { return {}; } })();
        const targetJobElo = (() => { try { return JSON.parse(eloTarget.job_data || '{}'); } catch { return {}; } })();
        if (!actorJobElo.__elo) actorJobElo.__elo = 1000;
        if (!targetJobElo.__elo) targetJobElo.__elo = 1000;
        actorJobElo.__elo = newActorElo;
        targetJobElo.__elo = newTargetElo;
        db.update(players).set({ job_data: JSON.stringify(actorJobElo) }).where(eq(players.discord_id, actor.discord_id)).run();
        db.update(players).set({ job_data: JSON.stringify(targetJobElo) }).where(eq(players.discord_id, target.discord_id)).run();
      }
    }
    // Store fight history for both participants (re-fetch to catch all prior writes)
    if (rewards) {
      const histActor = db.select().from(players).where(eq(players.discord_id, actor.discord_id)).get();
      if (histActor) {
        const haJob = (() => { try { return JSON.parse(histActor.job_data || '{}'); } catch { return {}; } })();
        if (!haJob.__fight_history) haJob.__fight_history = [];
        haJob.__fight_history.unshift({ timestamp: now, opponent: target.username, opponentId: target.discord_id, technique: tech.name, damage, result: 'win', yenEarned: rewards.yenBonus || 0 });
        if (haJob.__fight_history.length > 10) haJob.__fight_history.length = 10;
        db.update(players).set({ job_data: JSON.stringify(haJob) }).where(eq(players.discord_id, actor.discord_id)).run();
      }
      const histTarget = db.select().from(players).where(eq(players.discord_id, target.discord_id)).get();
      if (histTarget) {
        const htJob = (() => { try { return JSON.parse(histTarget.job_data || '{}'); } catch { return {}; } })();
        if (!htJob.__fight_history) htJob.__fight_history = [];
        htJob.__fight_history.unshift({ timestamp: now, opponent: actor.username, opponentId: actor.discord_id, technique: tech.name, damage, result: 'loss', yenLost: rewards.yenLoss || 0 });
        if (htJob.__fight_history.length > 10) htJob.__fight_history.length = 10;
        db.update(players).set({ job_data: JSON.stringify(htJob) }).where(eq(players.discord_id, target.discord_id)).run();
      }
    }
    userCDs[techniqueId] = now + tech.cooldown_seconds * 1000;
  })();

  // Send death notification DM
  if (rewards && interaction) {
    const freshTargetNotify = db.select().from(players).where(eq(players.discord_id, target.discord_id)).get();
    const targetJob = (() => { try { return JSON.parse(freshTargetNotify?.job_data || '{}'); } catch { return {}; } })();
    const tPrefs = targetJob.__notifications || {};
    if (tPrefs.death !== false) {
      interaction.client.users.fetch(target.discord_id).then(targetUser => {
        if (!targetUser) return;
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
