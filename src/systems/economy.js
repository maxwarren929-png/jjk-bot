const { db, sqlite } = require('../db/index');
const { players } = require('../db/schema');
const { eq } = require('drizzle-orm');

function safeParse(val) {
  try { return JSON.parse(val || '{}'); } catch { return {}; }
}

const SHOP_CATALOG = [
  { id: 'ce_potion',        name: 'CE Potion',              cost: 100,  effect: 'CE_RESTORE_50',   description: 'Stores in inventory. Use `/inventory use` to restore 50 CE.' },
  { id: 'binding_ring',     name: 'Binding Ring',           cost: 200,  effect: 'SILENCE_NEXT',    description: 'Silences the enemy on your next attack, skipping their action.' },
  { id: 'split_soul_katana',name: 'Cursed Tool: Split Soul Katana', cost: 300, effect: 'BONUS_DAMAGE_20', description: '+20 flat damage on all attacks for your next fight.' },
  { id: 'technique_reroll', name: 'Technique Reroll',       cost: 1000, effect: 'REROLL_INNATE',   description: 'Randomly reassign your innate technique. All variants are lost.' },
  { id: 'healing_vial',     name: 'Healing Vial',           cost: 500,  effect: 'EXIT_BROKEN',     description: 'Stores in inventory. Use `/inventory use` to exit Broken state and restore 50 HP.' },
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

  let result = null;
  try {
    const txnResult = sqlite.transaction(() => {
      const fresh = db.select().from(players).where(eq(players.discord_id, player.discord_id)).get();
      if (!fresh) return { error: 'Player not found.' };
      if (fresh.yen < item.cost) return { error: `Not enough yen. Need **${item.cost}** 💰, have **${fresh.yen}** 💰.` };

      const update = { yen: fresh.yen - item.cost };

      switch (item.effect) {
        case 'CE_RESTORE_50':
        case 'EXIT_BROKEN':
        case 'SILENCE_NEXT':
        case 'BONUS_DAMAGE_20': {
          const job = safeParse(fresh.job_data);
          if (!job.__items) job.__items = [];
          if (!job.__items.includes(item.effect)) job.__items.push(item.effect);
          update.job_data = JSON.stringify(job);
          break;
        }
        case 'REROLL_INNATE': {
          const { assignInnate } = require('./techniques');
          update.unlocked_techniques = '[]';
          update.innate_removed = false;
          db.update(players).set(update).where(eq(players.discord_id, player.discord_id)).run();
          const newId = assignInnate(player.discord_id);
          return { ok: true, item, newTechniqueId: newId };
        }
        case 'UPGRADE_ROD': {
          const rodData = safeParse(fresh.job_data);
          const currentRod = rodData.rodLevel || 1;
          if (currentRod >= 5) return { error: 'Rod is already max level (5).' };
          rodData.rodLevel = currentRod + 1;
          update.job_data = JSON.stringify(rodData);
          break;
        }
        case 'UPGRADE_AXE': {
          const axeData = safeParse(fresh.job_data);
          const currentAxe = axeData.axeLevel || 1;
          if (currentAxe >= 5) return { error: 'Axe is already max level (5).' };
          axeData.axeLevel = currentAxe + 1;
          update.job_data = JSON.stringify(axeData);
          break;
        }
        case 'UNLOCK_ANY':
          break;
      }

      db.update(players).set(update).where(eq(players.discord_id, player.discord_id)).run();
      return { ok: true, item };
    })();
    result = txnResult;
  } catch (err) {
    console.error(`[${new Date().toISOString()}] economy.js: applyShopEffect txn failed — ${err.message}`);
  }

  return result || { error: 'Transaction failed. Try again.' };
}

function transferYen(fromId, toId, amount) {
  const from = getPlayer(fromId);
  const to = getPlayer(toId);
  if (!from || !to) return { error: 'Player not found.' };
  let result = null;
  try {
    sqlite.transaction(() => {
      const fFrom = getPlayer(fromId);
      const fTo = getPlayer(toId);
      if (!fFrom || !fTo) { result = { error: 'Player not found.' }; return; }
      if (fFrom.yen < amount) { result = { error: 'Insufficient yen.' }; return; }
      db.update(players).set({ yen: fFrom.yen - amount }).where(eq(players.discord_id, fromId)).run();
      db.update(players).set({ yen: fTo.yen + amount }).where(eq(players.discord_id, toId)).run();
    })();
  } catch (err) {
    console.error(`[${new Date().toISOString()}] economy.js: transferYen txn failed — ${err.message}`);
  }
  return result || { ok: true };
}

const CONSUMABLE_EFFECTS = ['CE_RESTORE_50', 'SILENCE_NEXT', 'BONUS_DAMAGE_20', 'EXIT_BROKEN'];

function sellItem(player, effectKey) {
  const item = SHOP_CATALOG.find(i => i.effect === effectKey);
  if (!item) return { error: 'Item cannot be sold.' };

  const sellPrice = Math.floor(item.cost * 0.5);
  let result = null;

  try {
    sqlite.transaction(() => {
      const fresh = db.select().from(players).where(eq(players.discord_id, player.discord_id)).get();
      if (!fresh) { result = { error: 'Profile not found.' }; return; }
      const data = safeParse(fresh.job_data);
      const items = data.__items || [];
      const idx = items.indexOf(effectKey);
      if (idx === -1) { result = { error: `You don't have a **${item.name}** to sell.` }; return; }
      items.splice(idx, 1);
      data.__items = items;
      db.update(players).set({ yen: fresh.yen + sellPrice, job_data: JSON.stringify(data) })
        .where(eq(players.discord_id, player.discord_id)).run();
      result = { ok: true, item: item.name, price: sellPrice };
    })();
  } catch (err) {
    console.error(`[${new Date().toISOString()}] economy.js: sellItem txn failed — ${err.message}`);
  }

  return result || { error: 'Transaction failed. Try again.' };
}

module.exports = { SHOP_CATALOG, applyShopEffect, transferYen, getPlayer, sellItem, CONSUMABLE_EFFECTS };
