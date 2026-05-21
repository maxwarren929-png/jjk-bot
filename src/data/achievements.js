const ACHIEVEMENTS = [
  { id: 'first_kill', name: 'First Blood', description: 'Win your first PvP fight', category: 'combat', icon: '⚔️' },
  { id: 'first_hunt', name: 'Spirit Slayer', description: 'Complete your first hunt', category: 'combat', icon: '👹' },
  { id: 'first_bounty', name: 'Bounty Hunter', description: 'Claim your first bounty', category: 'combat', icon: '💰' },
  { id: 'centurion', name: 'Centurion', description: 'Win 100 PvP fights', category: 'combat', icon: '🏅' },
  { id: 'gladiator', name: 'Gladiator', description: 'Win 500 PvP fights', category: 'combat', icon: '⚡' },
  { id: 'legendary', name: 'Legendary Sorcerer', description: 'Win 1000 PvP fights', category: 'combat', icon: '🌟' },
  { id: 'millionaire', name: 'Millionaire', description: 'Accumulate 1,000,000 total yen', category: 'economy', icon: '💎' },
  { id: 'bounty_hunter_10', name: 'Wanted Dead', description: 'Claim 10 bounties', category: 'combat', icon: '🎯' },
  { id: 'elite_grade', name: 'Elite Sorcerer', description: 'Reach Special Grade', category: 'progression', icon: '🔮' },
  { id: 'max_bank', name: 'Infinite Vault', description: 'Upgrade bank to max tier', category: 'economy', icon: '🏦' },
  { id: 'rich', name: 'Well Off', description: 'Accumulate 100,000 total yen', category: 'economy', icon: '💰' },
  { id: 'first_rob', name: 'Thief', description: 'Successfully rob another player', category: 'combat', icon: '🗡️' },
  { id: 'domain_master', name: 'Domain Expansion', description: 'Use Domain Expansion in combat', category: 'combat', icon: '🔲' },
  { id: 'broken_survivor', name: 'Resilient', description: 'Recover from Broken state', category: 'progression', icon: '💪' },
  { id: 'daily_streak_7', name: 'Consistent', description: 'Reach a 7-day daily streak', category: 'progression', icon: '📅' },
  { id: 'gear_head', name: 'Gearhead', description: 'Equip items in all slots', category: 'economy', icon: '🛡️' },
  { id: 'bounty_target', name: 'Wanted', description: 'Have a bounty placed on you', category: 'combat', icon: '🚨' },
  { id: 'banker', name: 'Savings Account', description: 'Deposit 50,000 yen in the bank', category: 'economy', icon: '🏧' },
];

function getAchievement(id) {
  return ACHIEVEMENTS.find(a => a.id === id) || null;
}

function getAchievementsByCategory(category) {
  return ACHIEVEMENTS.filter(a => a.category === category);
}

module.exports = { ACHIEVEMENTS, getAchievement, getAchievementsByCategory };
