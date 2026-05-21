const { db } = require('../db/index');
const { players } = require('../db/schema');
const { eq, lte } = require('drizzle-orm');
const { getPlayerClanBonus } = require('./clans');

const TRAINING_DURATION_MS = 2 * 60 * 60 * 1000; // 2 hours

const TRAINING_REWARDS = {
  Meditation: p => ({ max_ce: p.max_ce + 15 }),
  Physical:   p => ({ max_hp: p.max_hp + 15 }),
  Movies:     () => ({ _xp: true }),      // handled by caller
  Manuals:    () => ({ _manuals: true }), // handled by caller
  Isolation:  () => ({ _isolation: true }),
};

function startTraining(player, type) {
  if (player.is_broken) return { error: 'You are broken and cannot train.' };
  if (player.training_until && player.training_until > Date.now()) {
    const remainMs = player.training_until - Date.now();
    const remainMin = Math.ceil(remainMs / 60000);
    return { error: `Already training. **${remainMin} minutes** remaining.` };
  }
  const until = Date.now() + TRAINING_DURATION_MS;
  db.update(players)
    .set({ training_until: until, training_type: type })
    .where(eq(players.discord_id, player.discord_id))
    .run();
  return { ok: true, until };
}

function completeTraining(player) {
  // Re-fetch from DB to avoid stale data race
  const fresh = db.select().from(players).where(eq(players.discord_id, player.discord_id)).get();
  if (!fresh || !fresh.training_until || fresh.training_until > Date.now()) return null;
  const type = fresh.training_type;
  const reward = TRAINING_REWARDS[type] ? TRAINING_REWARDS[type](fresh) : {};
  const update = { training_until: null, training_type: null };
  if (reward.max_ce) update.max_ce = reward.max_ce;
  if (reward.max_hp) update.max_hp = reward.max_hp;
  db.update(players).set(update).where(eq(players.discord_id, fresh.discord_id)).run();

  return { type, reward: Object.keys(reward).length > 0 ? reward : null };
}

function checkAndNotifyCompletedTraining(client) {
  const allPlayers = db.select().from(players).all();
  for (const p of allPlayers) {
    if (p.training_until && p.training_until <= Date.now()) {
      const result = completeTraining(p);
      if (result && client) {
        client.users.fetch(p.discord_id).then(user => {
          if (user) {
            const rewardText = result.type === 'Meditation' ? '+15 Max CE' :
              result.type === 'Physical' ? '+15 Max HP' :
              result.type === 'Movies' ? '+20 Technique XP (use /train to claim)' :
              result.type === 'Manuals' ? 'Variant unlock chance (use /train to claim)' :
              result.type === 'Isolation' ? '+3 passive CE regen' : 'completed';
            user.send(`🏋️ **Training Complete!**\nYour **${result.type}** session finished.\nReward: ${rewardText}`).catch(() => {});
          }
        }).catch(() => {});
      }
    }
  }
}

function regenAllPlayers() {
  const allPlayers = db.select().from(players).all();
  for (const p of allPlayers) {
    if (p.ce >= p.max_ce) continue;
    let regen = p.is_broken ? 2 : 5;
    const bonus = getPlayerClanBonus(p.discord_id);
    if (bonus === 'CE_REGEN') regen = Math.floor(regen * 1.1);
    const newCe = Math.min(p.ce + regen, p.max_ce);
    db.update(players).set({ ce: newCe }).where(eq(players.discord_id, p.discord_id)).run();
  }
}

const GRADE_THRESHOLDS = {
  'Grade 4': { wins: 5, next: 'Grade 3' },
  'Grade 3': { wins: 15, next: 'Grade 2' },
  'Grade 2': { wins: 30, next: 'Grade 1' },
  'Grade 1': { wins: 60, next: 'Semi-Special Grade' },
  'Semi-Special Grade': { wins: 100, next: 'Special Grade' },
};

function checkGradeUp(player) {
  const threshold = GRADE_THRESHOLDS[player.grade];
  if (!threshold) return null;
  if (player.fight_wins >= threshold.wins) return threshold.next;
  return null;
}

function failTraining(player) {
  if (!player.training_until || player.training_until <= Date.now()) return null;
  const type = player.training_type;
  db.update(players)
    .set({ training_until: null, training_type: null })
    .where(eq(players.discord_id, player.discord_id))
    .run();
  return { type, failed: true };
}

function cancelTraining(player) {
  if (!player.training_until || player.training_until <= Date.now()) {
    return { error: 'No active training to cancel.' };
  }
  db.update(players)
    .set({ training_until: null, training_type: null })
    .where(eq(players.discord_id, player.discord_id))
    .run();
  return { ok: true };
}

module.exports = { startTraining, completeTraining, regenAllPlayers, checkGradeUp, failTraining, checkAndNotifyCompletedTraining, cancelTraining, TRAINING_DURATION_MS };
