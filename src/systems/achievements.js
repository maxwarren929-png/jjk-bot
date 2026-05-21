const { sqlite } = require('../db/index');
const { ACHIEVEMENTS } = require('../data/achievements');

function hasAchievement(discordId, achievementId) {
  const row = sqlite.prepare('SELECT 1 FROM player_achievements WHERE player_id = ? AND achievement_id = ?').get(discordId, achievementId);
  return !!row;
}

function unlockAchievement(discordId, achievementId) {
  if (hasAchievement(discordId, achievementId)) return false;
  const achievement = ACHIEVEMENTS.find(a => a.id === achievementId);
  if (!achievement) return false;
  sqlite.prepare('INSERT OR IGNORE INTO player_achievements (player_id, achievement_id, unlocked_at) VALUES (?, ?, ?)').run(discordId, achievementId, Date.now());
  return true;
}

function getPlayerAchievements(discordId) {
  const rows = sqlite.prepare('SELECT achievement_id, unlocked_at FROM player_achievements WHERE player_id = ? ORDER BY unlocked_at DESC').all(discordId);
  return rows.map(r => {
    const def = ACHIEVEMENTS.find(a => a.id === r.achievement_id);
    return { ...r, def };
  });
}

function getAchievementCount(discordId) {
  const row = sqlite.prepare('SELECT COUNT(*) as c FROM player_achievements WHERE player_id = ?').get(discordId);
  return row ? row.c : 0;
}

function checkAndUnlock(discordId, achievementId) {
  if (hasAchievement(discordId, achievementId)) return null;
  const unlocked = unlockAchievement(discordId, achievementId);
  if (!unlocked) return null;
  return ACHIEVEMENTS.find(a => a.id === achievementId);
}

module.exports = { hasAchievement, unlockAchievement, getPlayerAchievements, getAchievementCount, checkAndUnlock, ACHIEVEMENTS };
