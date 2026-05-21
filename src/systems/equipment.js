const { db, sqlite } = require('../db/index');
const { players } = require('../db/schema');
const { eq } = require('drizzle-orm');
const { EQUIPMENT_ITEMS, SLOTS, getEquipmentItem, getEnhancedBonuses, getEnhanceCost, getEnhanceSuccess, MAX_ENHANCE } = require('../data/equipment');

function getEquipment(discordId) {
  const player = db.select().from(players).where(eq(players.discord_id, discordId)).get();
  if (!player) return null;
  const job = safeParse(player.job_data);
  return job.__equipment || {};
}

function safeParse(val) {
  try { return JSON.parse(val || '{}'); } catch { return {}; }
}

function equipItem(discordId, itemKey) {
  const def = getEquipmentItem(itemKey);
  if (!def) return { error: 'Unknown item.' };

  let result;
  sqlite.transaction(() => {
    const player = db.select().from(players).where(eq(players.discord_id, discordId)).get();
    if (!player) { result = { error: 'No profile.' }; return; }

    const job = safeParse(player.job_data);
    const inv = job.__items || [];
    const idx = inv.indexOf(itemKey);
    if (idx === -1) { result = { error: 'You do not own that item.' }; return; }

    if (!job.__equipment) job.__equipment = {};
    const oldItem = job.__equipment[def.slot];
    if (oldItem) {
      if (!inv.includes(oldItem)) inv.push(oldItem);
    }

    job.__equipment[def.slot] = itemKey;
    inv.splice(idx, 1);
    job.__items = inv;

    db.update(players).set({ job_data: JSON.stringify(job) }).where(eq(players.discord_id, discordId)).run();
    result = { ok: true, itemKey, slot: def.slot, unequipped: oldItem || null };
  })();
  return result;
}

function unequipItem(discordId, slot) {
  if (!SLOTS.includes(slot)) return { error: `Invalid slot. Choose: ${SLOTS.join(', ')}` };

  let result;
  sqlite.transaction(() => {
    const player = db.select().from(players).where(eq(players.discord_id, discordId)).get();
    if (!player) { result = { error: 'No profile.' }; return; }

    const job = safeParse(player.job_data);
    if (!job.__equipment || !job.__equipment[slot]) { result = { error: `Nothing equipped in ${slot} slot.` }; return; }

    const itemKey = job.__equipment[slot];
    if (!job.__items) job.__items = [];
    if (!job.__items.includes(itemKey)) job.__items.push(itemKey);

    delete job.__equipment[slot];
    db.update(players).set({ job_data: JSON.stringify(job) }).where(eq(players.discord_id, discordId)).run();
    result = { ok: true, itemKey, slot };
  })();
  return result;
}

function getEquipmentBonuses(discordId) {
  const player = db.select().from(players).where(eq(players.discord_id, discordId)).get();
  if (!player) return { bonusDamage: 0, damageReduction: 0, bonusMaxCe: 0, bonusMaxHp: 0 };
  const job = safeParse(player.job_data);
  const eq = job.__equipment || {};
  const enh = job.__enhancements || {};
  const bonuses = { bonusDamage: 0, damageReduction: 0, bonusMaxCe: 0, bonusMaxHp: 0 };
  for (const key of Object.values(eq)) {
    const level = enh[key] || 0;
    const def = getEquipmentItem(key);
    if (def) {
      const b = getEnhancedBonuses(key, level);
      if (b.bonusDamage) bonuses.bonusDamage += b.bonusDamage;
      if (b.damageReduction) bonuses.damageReduction += b.damageReduction;
      if (b.bonusMaxCe) bonuses.bonusMaxCe += b.bonusMaxCe;
      if (b.bonusMaxHp) bonuses.bonusMaxHp += b.bonusMaxHp;
    }
  }
  return bonuses;
}

function getEnhancementLevel(discordId, itemKey) {
  const player = db.select().from(players).where(eq(players.discord_id, discordId)).get();
  if (!player) return 0;
  const job = safeParse(player.job_data);
  return (job.__enhancements && job.__enhancements[itemKey]) || 0;
}

function enhanceItem(discordId, slot) {
  if (!SLOTS.includes(slot)) return { error: `Invalid slot. Choose: ${SLOTS.join(', ')}` };
  let result;
  sqlite.transaction(() => {
    const player = db.select().from(players).where(eq(players.discord_id, discordId)).get();
    if (!player) { result = { error: 'No profile.' }; return; }
    const job = safeParse(player.job_data);
    if (!job.__equipment || !job.__equipment[slot]) { result = { error: `Nothing equipped in ${slot} slot.` }; return; }
    const itemKey = job.__equipment[slot];
    const level = (job.__enhancements && job.__enhancements[itemKey]) || 0;
    if (level >= MAX_ENHANCE) { result = { error: 'Item is already at max enhancement.' }; return; }
    const cost = getEnhanceCost(itemKey, level);
    if (player.ce < cost) { result = { error: `Not enough CE. Need **${cost}** 💜, have **${player.ce}** 💜.` }; return; }
    const success = getEnhanceSuccess(level);
    const roll = Math.random() * 100;
    if (roll < success) {
      if (!job.__enhancements) job.__enhancements = {};
      job.__enhancements[itemKey] = level + 1;
    } else {
      result = { ok: true, success: false, itemKey, slot, level, cost, chance: success };
      db.update(players).set({ ce: player.ce - cost, job_data: JSON.stringify(job) }).where(eq(players.discord_id, discordId)).run();
      return;
    }
    db.update(players).set({ ce: player.ce - cost, job_data: JSON.stringify(job) }).where(eq(players.discord_id, discordId)).run();
    result = { ok: true, success: true, itemKey, slot, oldLevel: level, newLevel: level + 1, cost, chance: success };
  })();
  return result;
}

function formatEquipmentEmbed(discordId) {
  const eq = getEquipment(discordId) || {};
  const player = db.select().from(players).where(eq(players.discord_id, discordId)).get();
  const enh = player ? (safeParse(player.job_data).__enhancements || {}) : {};
  const lines = [];
  for (const slot of SLOTS) {
    const key = eq[slot];
    if (key) {
      const def = getEquipmentItem(key);
      const level = enh[key] || 0;
      const stars = level > 0 ? ' ⭐'.repeat(Math.min(level, 5)) : '';
      lines.push(`**${slot.charAt(0).toUpperCase() + slot.slice(1)}:** ${def ? def.name : key}${stars}`);
    } else {
      lines.push(`**${slot.charAt(0).toUpperCase() + slot.slice(1)}:** *(empty)*`);
    }
  }
  return lines.join('\n');
}

module.exports = { equipItem, unequipItem, getEquipment, getEquipmentBonuses, formatEquipmentEmbed, enhanceItem, getEnhancementLevel };
