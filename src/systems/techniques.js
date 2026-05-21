const { db } = require('../db/index');
const { players, techniques } = require('../db/schema');
const { INNATE_POOL, TECHNIQUES } = require('../data/techniques');
const { eq } = require('drizzle-orm');

function assignInnate(discordId) {
  const id = INNATE_POOL[Math.floor(Math.random() * INNATE_POOL.length)];
  db.update(players).set({ innate_technique_id: id }).where(eq(players.discord_id, discordId)).run();
  return id;
}

function getPlayerTechniques(player) {
  const innate = TECHNIQUES.find(t => t.id === player.innate_technique_id);
  const unlocked = JSON.parse(player.unlocked_techniques || '[]');
  const variants = TECHNIQUES.filter(t =>
    t.parent_technique_id === player.innate_technique_id && unlocked.includes(t.id)
  );
  const punch = TECHNIQUES.find(t => t.id === 'punch');
  return { innate, unlocked: punch ? [...variants, punch] : variants };
}

function getLockedVariants(player) {
  const unlocked = JSON.parse(player.unlocked_techniques || '[]');
  return TECHNIQUES.filter(t =>
    t.parent_technique_id === player.innate_technique_id && !unlocked.includes(t.id)
  );
}

function unlockTechnique(discordId, techniqueId) {
  const player = db.select().from(players).where(eq(players.discord_id, discordId)).get();
  const unlocked = JSON.parse(player.unlocked_techniques || '[]');
  if (!unlocked.includes(techniqueId)) unlocked.push(techniqueId);
  db.update(players).set({ unlocked_techniques: JSON.stringify(unlocked) })
    .where(eq(players.discord_id, discordId)).run();
}

function getTechniqueById(id) {
  return TECHNIQUES.find(t => t.id === id) || null;
}

module.exports = { assignInnate, getPlayerTechniques, getLockedVariants, unlockTechnique, getTechniqueById };
