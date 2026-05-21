const { db } = require('../db/index');
const { players } = require('../db/schema');
const { eq } = require('drizzle-orm');

const SHOP_CATALOG = [
  { id: 'ce_potion',        name: 'CE Potion',              cost: 100,  effect: 'CE_RESTORE_50',   description: 'Restores 50 Cursed Energy instantly.' },
  { id: 'binding_ring',     name: 'Binding Ring',           cost: 200,  effect: 'SILENCE_NEXT',    description: 'Silences the enemy at the start of your next fight, skipping their first action.' },
  { id: 'split_soul_katana',name: 'Cursed Tool: Split Soul Katana', cost: 300, effect: 'BONUS_DAMAGE_20', description: '+20 flat damage on all attacks for your next fight.' },
  { id: 'technique_reroll', name: 'Technique Reroll',       cost: 1000, effect: 'REROLL_INNATE',   description: 'Randomly reassign your innate technique. All variants are lost.' },
  { id: 'healing_vial',     name: 'Healing Vial',           cost: 500,  effect: 'EXIT_BROKEN',     description: 'Immediately exit the Broken state and restore 50 HP.' },
  { id: 'fishing_rod',      name: 'Fishing Rod Upgrade',    cost: 300,  effect: 'UPGRADE_ROD',     description: 'Upgrades your fishing rod by 1 level. Better rod = better catches.' },
  { id: 'lumber_axe',       name: 'Lumber Axe Upgrade',     cost: 300,  effect: 'UPGRADE_AXE',     description: 'Upgrades your lumber axe. Higher level = more yen per chop.' },
  { id: 'forbidden_scroll', name: 'Forbidden Technique Scroll', cost: 5000, effect: 'UNLOCK_ANY',     description: 'Unlocks ANY technique of your choice — regardless of your innate.' },
];

function getPlayer(discordId) {
  return db.select().from(players).where(eq(players.discord_id, discordId)).get();
}

function applyShopEffect(player, itemId) {
  const item = SHOP_CATALOG.find(i => i.id === itemId);
  if (!item) return { error: 'Item not found.' };
  if (player.yen < item.cost) return { error: `Not enough yen. Need **${item.cost}** 💰, have **${player.yen}** 💰.` };

  const update = { yen: player.yen - item.cost };

  switch (item.effect) {
    case 'CE_RESTORE_50':
      update.ce = Math.min(player.ce + 50, player.max_ce);
      break;
    case 'EXIT_BROKEN':
      update.is_broken = false;
      update.broken_until = null;
      update.hp = Math.min(player.hp + 50, player.max_hp);
      break;
    case 'REROLL_INNATE': {
      const { assignInnate } = require('./techniques');
      update.unlocked_techniques = '[]';
      update.innate_removed = false;
      db.update(players).set(update).where(eq(players.discord_id, player.discord_id)).run();
      const newId = assignInnate(player.discord_id);
      return { ok: true, item, newTechniqueId: newId };
    }
    case 'UPGRADE_ROD': {
      const rodData = JSON.parse(player.job_data || '{}');
      rodData.rodLevel = (rodData.rodLevel || 1) + 1;
      if (rodData.rodLevel > 5) return { error: 'Rod is already max level (5).' };
      update.job_data = JSON.stringify(rodData);
      update.yen = player.yen - item.cost;
      break;
    }
    case 'UPGRADE_AXE': {
      const axeData = JSON.parse(player.job_data || '{}');
      axeData.axeLevel = (axeData.axeLevel || 1) + 1;
      if (axeData.axeLevel > 5) return { error: 'Axe is already max level (5).' };
      update.job_data = JSON.stringify(axeData);
      update.yen = player.yen - item.cost;
      break;
    }
    case 'UNLOCK_ANY': {
      db.update(players).set(update).where(eq(players.discord_id, player.discord_id)).run();
      return { ok: true, item, needsTechniquePick: true };
    }
    // SILENCE_NEXT and BONUS_DAMAGE_20 are applied at fight start; store in job_data
    case 'SILENCE_NEXT':
    case 'BONUS_DAMAGE_20': {
      const job = JSON.parse(player.job_data || '{}');
      if (!job.__items) job.__items = [];
      if (!job.__items.includes(item.effect)) job.__items.push(item.effect);
      update.job_data = JSON.stringify(job);
      break;
    }
  }

  db.update(players).set(update).where(eq(players.discord_id, player.discord_id)).run();
  return { ok: true, item };
}

function transferYen(fromId, toId, amount) {
  const from = getPlayer(fromId);
  const to = getPlayer(toId);
  if (!from || !to) return { error: 'Player not found.' };
  if (from.yen < amount) return { error: 'Insufficient yen.' };
  db.update(players).set({ yen: from.yen - amount }).where(eq(players.discord_id, fromId)).run();
  db.update(players).set({ yen: to.yen + amount }).where(eq(players.discord_id, toId)).run();
  return { ok: true };
}

module.exports = { SHOP_CATALOG, applyShopEffect, transferYen, getPlayer };
