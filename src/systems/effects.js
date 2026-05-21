// ── Effect Registry ─────────────────────────────────────────────────────────
const registry = new Map();

function defineEffect(id, handler) {
  registry.set(id, handler);
}

// ── Phase System ────────────────────────────────────────────────────────────
// Phases: onUse, onHit, onTurnStart, onTurnEnd, onAftermath, onFightEnd

// ── Built-in Effects ────────────────────────────────────────────────────────

defineEffect('damage', {
  phases: ['onHit'],
  resolve(ctx, config) {
    const min = config.min ?? 0;
    const max = config.max ?? 0;
    if (max <= 0) return 0;
    const dmg = Math.floor(Math.random() * (max - min + 1)) + min;
    return { damage: dmg, log: null };
  },
});

defineEffect('multi_hit', {
  phases: ['onHit'],
  resolve(ctx, config) {
    const hits = config.hits ?? 2;
    const perHit = config.perHit ?? { min: 5, max: 10 };
    let total = 0;
    const parts = [];
    for (let i = 0; i < hits; i++) {
      const d = Math.floor(Math.random() * (perHit.max - perHit.min + 1)) + perHit.min;
      total += d;
      parts.push(d);
    }
    return { damage: total, log: `⚡ ${hits}x hit! [${parts.join(', ')}]` };
  },
});

defineEffect('apply_status', {
  phases: ['onHit'],
  resolve(ctx, config) {
    const status = config.status;
    if (!status) return {};
    ctx.target.statuses.push(status);
    return { statuses: [status], log: `💫 *${status} applied*` };
  },
});

defineEffect('remove_status', {
  phases: ['onUse'],
  resolve(ctx, config) {
    const status = config.status;
    if (!status) return {};
    ctx.actor.statuses = ctx.actor.statuses.filter(s => s !== status);
    return { log: `✨ *${status} removed from self*` };
  },
});

defineEffect('shield', {
  phases: ['onUse'],
  resolve(ctx, config) {
    const amount = config.amount ?? 40;
    ctx.actor.shield += amount;
    return { log: `🛡️ *Shield +${amount}*` };
  },
});

defineEffect('power_up', {
  phases: ['onUse'],
  resolve(ctx, config) {
    const turns = config.turns ?? 2;
    ctx.actor.statuses.push('POWER_UP');
    return { log: `💪 *Power Up: next ${turns} attacks +${config.bonus ?? 15} dmg*` };
  },
});

defineEffect('nullify', {
  phases: ['onUse'],
  resolve(ctx, config) {
    ctx.actor.statuses.push('NULLIFY');
    return { log: `🚫 *Next enemy technique will be nullified*` };
  },
});

defineEffect('cooldown_reset', {
  phases: ['onUse'],
  resolve(ctx, config) {
    const who = config.target === 'self' ? ctx.actor : (config.target === 'enemy' ? ctx.target : ctx.actor);
    who.cooldowns = {};
    return { log: `⏱️ *Cooldowns reset for ${who === ctx.actor ? 'self' : 'enemy'}*` };
  },
});

defineEffect('cooldown_extend', {
  phases: ['onUse'],
  resolve(ctx, config) {
    const seconds = config.seconds ?? 10;
    for (const key of Object.keys(ctx.target.cooldowns)) {
      if (ctx.target.cooldowns[key] > Date.now()) {
        ctx.target.cooldowns[key] += seconds * 1000;
      }
    }
    return { log: `⏱️ *Enemy cooldowns extended by ${seconds}s*` };
  },
});

defineEffect('heal', {
  phases: ['onUse'],
  resolve(ctx, config) {
    const amount = config.amount ?? 20;
    const who = config.target === 'self' ? ctx.actor : ctx.target;
    who.hp = Math.min(who.hp + amount, who.maxHp);
    return { log: `💚 *${who === ctx.actor ? 'Self' : 'Target'} healed ${amount} HP*` };
  },
});

defineEffect('ce_drain', {
  phases: ['onUse'],
  resolve(ctx, config) {
    const amount = config.amount ?? 20;
    const drained = Math.min(ctx.target.ce, amount);
    ctx.target.ce -= drained;
    ctx.actor.ce = Math.min(ctx.actor.ce + drained, ctx.actor.maxCe);
    return { log: `💜 *Drained ${drained} CE from enemy*` };
  },
});

defineEffect('ce_restore', {
  phases: ['onUse'],
  resolve(ctx, config) {
    const amount = config.amount ?? 30;
    const who = config.target === 'self' ? ctx.actor : ctx.target;
    who.ce = Math.min(who.ce + amount, who.maxCe);
    return { log: `💜 *${who === ctx.actor ? 'Self' : 'Target'} restored ${amount} CE*` };
  },
});

defineEffect('skip_turn', {
  phases: ['onUse'],
  resolve(ctx, config) {
    ctx.target.statuses.push('SKIP');
    return { log: `💤 *Enemy will skip next turn*` };
  },
});

defineEffect('confuse', {
  phases: ['onUse'],
  resolve(ctx, config) {
    ctx.target.statuses.push('CONFUSE');
    return { log: `🌀 *Confused*` };
  },
});

defineEffect('expose', {
  phases: ['onUse'],
  resolve(ctx, config) {
    ctx.target.statuses.push('EXPOSED');
    return { log: `👁️ *Target exposed — next hit deals +30%*` };
  },
});

defineEffect('conditional_bonus', {
  phases: ['onHit'],
  resolve(ctx, config) {
    const condition = config.condition;
    let bonus = 0;
    let reason = '';
    if (condition === 'has_reactions' && ctx.discord?.message) {
      // Count reactions on the interaction message
      bonus = config.bonus ?? 10;
      reason = ` (+${bonus} reaction bonus)`;
    }
    if (condition === 'low_hp' && ctx.target.hp < ctx.target.maxHp * 0.2) {
      bonus = config.bonus ?? 15;
      reason = ` (+${bonus} execution bonus)`;
    }
    if (condition === 'full_ce' && ctx.actor.ce === ctx.actor.maxCe) {
      bonus = config.bonus ?? 20;
      reason = ` (+${bonus} full CE bonus)`;
    }
    if (condition === 'higher_role') {
      bonus = config.bonus ?? 10;
      reason = ` (+${bonus} authority bonus)`;
    }
    return { bonusDamage: bonus, log: reason || null };
  },
});

defineEffect('dot_tick', {
  phases: ['onTurnEnd'],
  resolve(ctx, config) {
    const status = config.status;
    const damage = config.damage ?? 5;
    if (ctx.target.statuses.includes(status)) {
      ctx.target.hp = Math.max(0, ctx.target.hp - damage);
      return { damage, log: `🔥 *${status} ticks: -${damage} HP*` };
    }
    return {};
  },
});

defineEffect('aoe', {
  phases: ['onHit'],
  resolve(ctx, config) {
    const min = config.min ?? 5;
    const max = config.max ?? 15;
    const splash = Math.floor(Math.random() * (max - min + 1)) + min;
    return { aoeDamage: splash, log: `💥 *Splash: -${splash} HP to others*` };
  },
});

defineEffect('reflect', {
  phases: ['onUse'],
  resolve(ctx, config) {
    const pct = config.percent ?? 0.3;
    ctx.actor.statuses.push(`REFLECT_${Math.floor(pct * 100)}`);
    return { log: `🪞 *${Math.floor(pct * 100)}% damage reflect active*` };
  },
});

// ── Context Builders ────────────────────────────────────────────────────────

function buildEffectContext(actor, target, state, phaseOverrides = {}) {
  return {
    actor,
    target,
    state,
    damage: 0,
    bonusDamage: 0,
    discord: phaseOverrides.discord || null,
    logs: [],
    extraStatuses: [],
  };
}

// ── Effect Resolver ─────────────────────────────────────────────────────────

function resolveEffects(technique, phase, ctx) {
  const results = { damage: 0, bonusDamage: 0, aoeDamage: 0, logEntries: [], statuses: [] };

  if (!technique.effects || technique.effects.length === 0) {
    // Default: use damage fields from technique
    if (phase === 'onHit' && technique.damage_max > 0) {
      const dmg = Math.floor(Math.random() * (technique.damage_max - technique.damage_min + 1)) + technique.damage_min;
      results.damage = dmg;
    }
    // Default: resolve old-style status_effect
    if (phase === 'onUse' && technique.status_effect) {
      const resolvedStatus = resolveLegacyStatus(technique.status_effect);
      if (resolvedStatus) {
        applyLegacyStatus(ctx, resolvedStatus, results);
      }
    }
    return results;
  }

  for (const effectConfig of technique.effects) {
    const id = typeof effectConfig === 'string' ? effectConfig : effectConfig.use;
    const config = typeof effectConfig === 'string' ? {} : effectConfig.with || {};
    const handler = registry.get(id);
    if (!handler) continue;
    if (!handler.phases.includes(phase)) continue;

    const result = handler.resolve(ctx, config);
    if (!result) continue;

    if (result.damage) results.damage += result.damage;
    if (result.bonusDamage) results.bonusDamage += result.bonusDamage;
    if (result.aoeDamage) results.aoeDamage += result.aoeDamage;
    if (result.log) results.logEntries.push(result.log);
    if (result.statuses) results.statuses.push(...result.statuses);
  }

  return results;
}

// ── Legacy Status Resolution (backward compat) ──────────────────────────────

function resolveLegacyStatus(effect) {
  if (effect === 'RANDOM_COMMAND') {
    const options = ['SLEEP', 'STOP', 'EXPLODE'];
    return options[Math.floor(Math.random() * options.length)];
  }
  return effect;
}

function applyLegacyStatus(ctx, status, results) {
  switch (status) {
    case 'BURN': case 'BLEED': case 'FREEZE':
    case 'SKIP': case 'CONFUSE': case 'SLEEP': case 'STOP': case 'EXPLODE':
      ctx.target.statuses.push(status);
      results.logEntries.push(`💫 *${status} applied*`);
      results.statuses.push(status);
      break;
    case 'SHIELD':
      ctx.actor.shield += 40;
      results.logEntries.push(`🛡️ *Shield +40*`);
      break;
    case 'POWER_UP':
      ctx.actor.statuses.push('POWER_UP');
      results.logEntries.push(`💪 *Power Up active*`);
      break;
    case 'NULLIFY':
      ctx.actor.statuses.push('NULLIFY');
      results.logEntries.push(`🚫 *Nullify ready*`);
      break;
    case 'COOLDOWN_MANIP':
      ctx.actor.cooldowns = {};
      results.logEntries.push(`⏱️ *Cooldowns reset*`);
      break;
    case 'DOUBLE_HIT':
      // Handled in combat.js directly
      break;
  }
}

// ── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
  defineEffect,
  buildEffectContext,
  resolveEffects,
  resolveLegacyStatus,
};
