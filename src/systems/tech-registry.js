const { TECHNIQUES, INNATE_POOL } = require('../data/techniques');
const { CATEGORY_BONUSES, generateTechnique } = require('../data/effects-data');

// ── Category Index ───────────────────────────────────────────────────────────

const categoryIndex = new Map();

function buildCategoryIndex() {
  categoryIndex.clear();
  for (const t of TECHNIQUES) {
    const tags = t.tags || [];
    for (const tag of tags) {
      if (!categoryIndex.has(tag)) categoryIndex.set(tag, []);
      categoryIndex.get(tag).push(t);
    }
    // Also index by category field if set
    if (t.category) {
      if (!categoryIndex.has(t.category)) categoryIndex.set(t.category, []);
      categoryIndex.get(t.category).push(t);
    }
  }
}

// Rebuild on import
buildCategoryIndex();

// ── Query Functions ──────────────────────────────────────────────────────────

function getByCategory(category) {
  return categoryIndex.get(category) || [];
}

function getByTag(tag) {
  return categoryIndex.get(tag) || [];
}

function getByType(type) {
  return TECHNIQUES.filter(t => t.type === type);
}

function getByInnate(innateId) {
  return TECHNIQUES.filter(t => t.parent_technique_id === innateId);
}

function search(query) {
  const q = query.toLowerCase();
  return TECHNIQUES.filter(t =>
    t.name.toLowerCase().includes(q) ||
    t.id.toLowerCase().includes(q) ||
    (t.tags || []).some(tag => tag.includes(q)) ||
    (t.category || '').includes(q)
  );
}

function getAllCategories() {
  return [...new Set(TECHNIQUES.filter(t => t.category).map(t => t.category))];
}

function getAllTags() {
  const allTags = new Set();
  for (const t of TECHNIQUES) {
    for (const tag of (t.tags || [])) allTags.add(tag);
  }
  return [...allTags];
}

function stats() {
  return {
    total: TECHNIQUES.length,
    byType: TECHNIQUES.reduce((acc, t) => {
      acc[t.type] = (acc[t.type] || 0) + 1;
      return acc;
    }, {}),
    byCategory: TECHNIQUES.reduce((acc, t) => {
      if (t.category) {
        acc[t.category] = (acc[t.category] || 0) + 1;
      }
      return acc;
    }, {}),
    innate: TECHNIQUES.filter(t => t.is_innate).length,
    variants: TECHNIQUES.filter(t => !t.is_innate).length,
  };
}

// ── Dynamic Registration ─────────────────────────────────────────────────────

function registerTechnique(techData) {
  // Push into the data array
  TECHNIQUES.push(techData);
  // Rebuild index
  buildCategoryIndex();
  // Update innate pool if applicable
  if (techData.is_innate) {
    INNATE_POOL.push(techData.id);
  }
  return techData;
}

function createAndRegister(id, name, template, customEffects = [], overrides = {}) {
  const tech = generateTechnique(id, name, template, customEffects, overrides);
  return registerTechnique(tech);
}

// ── Utility Functions ────────────────────────────────────────────────────────

function getRecommendedTechniques(player, count = 3) {
  // Suggest locked variants that the player is closest to unlocking
  let unlocked = [];
  try { unlocked = JSON.parse(player.unlocked_techniques || '[]'); } catch { unlocked = []; }
  const locked = TECHNIQUES.filter(t =>
    t.parent_technique_id === player.innate_technique_id &&
    !unlocked.includes(t.id)
  );
  return locked.slice(0, count);
}

module.exports = {
  getByCategory,
  getByTag,
  getByType,
  getByInnate,
  search,
  getAllCategories,
  getAllTags,
  stats,
  registerTechnique,
  createAndRegister,
  getRecommendedTechniques,
  CATEGORY_BONUSES,
};
