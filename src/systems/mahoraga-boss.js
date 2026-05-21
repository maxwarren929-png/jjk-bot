// Mahoraga Boss Engine
// A raid-boss summoned via the Mahoraga technique

const { db, sqlite } = require('../db/index');
const { players } = require('../db/schema');
const { eq } = require('drizzle-orm');

const bosses = new Map(); // channelId -> BossState

// BossState:
// {
//   hp: number,
//   maxHp: 2000,
//   summonerId: string,
//   targetId: string,
//   expiresAt: timestamp,
//   aggro: Set<string>,   // discord_ids that attacked Mahoraga
//   dead: boolean,
// }

function spawnMahoraga(summonerId, targetId, channelId) {
  const existing = bosses.get(channelId);
  if (existing && !existing.dead && Date.now() <= existing.expiresAt) {
    return null;
  }
  const expiresAt = Date.now() + 24 * 60 * 60 * 1000;
  const state = {
    hp: 2000,
    maxHp: 2000,
    summonerId,
    targetId,
    expiresAt,
    aggro: new Set(),
    dead: false,
  };
  bosses.set(channelId, state);
  return state;
}

function getBoss(channelId) {
  const boss = bosses.get(channelId);
  if (!boss) return null;
  if (Date.now() > boss.expiresAt || boss.dead) {
    if (!boss.dead) {
      handleBossTimeout(boss, channelId);
    }
    bosses.delete(channelId);
    return null;
  }
  return boss;
}

function attackBoss(channelId, attackerId, damage) {
  const boss = bosses.get(channelId);
  if (!boss || boss.dead) return null;
  if (Date.now() > boss.expiresAt) {
    handleBossTimeout(boss, channelId);
    bosses.delete(channelId);
    return null;
  }

  boss.hp -= damage;
  boss.aggro.add(attackerId);

  if (boss.hp <= 0) {
    boss.dead = true;
    handleBossKill(boss, channelId);
    return { killed: true, bossHp: 0 };
  }

  return { killed: false, bossHp: boss.hp, maxHp: boss.maxHp };
}

function handleBossKill(boss, channelId) {
  try {
    sqlite.transaction(() => {
      boss.aggro.forEach(id => {
        const p = db.select().from(players).where(eq(players.discord_id, id)).get();
        if (p) {
          db.update(players).set({
            yen: p.yen + 50,
            ce: Math.min(p.ce + 20, p.max_ce),
          }).where(eq(players.discord_id, id)).run();
        }
      });
    })();
  } catch (e) { console.error(`[${new Date().toISOString()}] Boss kill error:`, e); }
}

function handleBossTimeout(boss, channelId) {
  try {
    sqlite.transaction(() => {
      const fresh = db.select().from(players).where(eq(players.discord_id, boss.targetId)).get();
      if (!fresh) return;
      db.update(players).set({
        hp: 0,
        is_broken: true,
        broken_until: Date.now() + 24 * 60 * 60 * 1000,
        yen: 0,
        bank_balance: 0,
        innate_removed: true,
        innate_technique_id: null,
      }).where(eq(players.discord_id, boss.targetId)).run();
    })();
  } catch (e) { console.error(`[${new Date().toISOString()}] Boss timeout error:`, e); }
}

// Check expired bosses every 60s
setInterval(() => {
  const now = Date.now();
  for (const [channelId, boss] of bosses) {
    if (now > boss.expiresAt && !boss.dead) {
      handleBossTimeout(boss, channelId);
      bosses.delete(channelId);
    }
    if (boss.dead) bosses.delete(channelId);
  }
}, 60000);

module.exports = { spawnMahoraga, getBoss, attackBoss };
