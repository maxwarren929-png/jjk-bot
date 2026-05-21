const { db, sqlite } = require('../db/index');
const { players, bounties } = require('../db/schema');
const { eq, and } = require('drizzle-orm');

function placeBounty(placerId, targetId, amount) {
  const placer = db.select().from(players).where(eq(players.discord_id, placerId)).get();
  if (!placer) return { error: 'You need a profile first.' };
  if (placerId === targetId) return { error: 'You cannot place a bounty on yourself.' };
  if (amount < 1) return { error: 'Bounty amount must be at least 1 💰.' };
  if (placer.yen < amount) return { error: `Not enough yen. Need **${amount} 💰**, have **${placer.yen} 💰**.` };

  const target = db.select().from(players).where(eq(players.discord_id, targetId)).get();
  if (!target) return { error: 'Target has no profile.' };

  const txn = sqlite.transaction(() => {
    const fresh = db.select().from(players).where(eq(players.discord_id, placerId)).get();
    if (fresh.yen < amount) throw new Error('Insufficient yen');
    db.update(players).set({ yen: fresh.yen - amount }).where(eq(players.discord_id, placerId)).run();
    db.insert(bounties).values({
      target_id: targetId,
      placed_by_id: placerId,
      amount,
      created_at: Date.now(),
    }).run();
  });
  try {
    txn();
    return { ok: true, amount, targetName: target.username };
  } catch (err) {
    console.error(`[${new Date().toISOString()}] bounties.js: placeBounty txn failed — ${err.message}`);
    return { error: 'Transaction failed. Try again.' };
  }
}

function listBounties() {
  const all = db.select().from(bounties).all();
  if (all.length === 0) return [];

  const grouped = {};
  for (const b of all) {
    if (!grouped[b.target_id]) grouped[b.target_id] = 0;
    grouped[b.target_id] += b.amount;
  }
  return Object.entries(grouped).map(([targetId, total]) => ({ targetId, total }));
}

function claimBounties(killerId, targetId) {
  let result = null;
  try {
    sqlite.transaction(() => {
      const all = db.select().from(bounties).where(eq(bounties.target_id, targetId)).all();
      if (all.length === 0) return;
      const total = all.reduce((sum, b) => sum + b.amount, 0);
      for (const b of all) {
        db.delete(bounties).where(eq(bounties.id, b.id)).run();
      }
      const killer = db.select().from(players).where(eq(players.discord_id, killerId)).get();
      if (killer) {
        db.update(players).set({
          yen: killer.yen + total,
          bounty_kills: (killer.bounty_kills || 0) + 1,
        }).where(eq(players.discord_id, killerId)).run();
      }
      result = { total, count: all.length };
    })();
  } catch (err) {
    console.error(`[${new Date().toISOString()}] bounties.js: claimBounties txn failed — ${err.message}`);
  }
  return result;
}

function cancelBounties(placerId, targetId) {
  let result = null;
  try {
    sqlite.transaction(() => {
      const all = db.select().from(bounties)
        .where(and(eq(bounties.placed_by_id, placerId), eq(bounties.target_id, targetId)))
        .all();
      if (all.length === 0) return;
      const total = all.reduce((sum, b) => sum + b.amount, 0);
      const fresh = db.select().from(players).where(eq(players.discord_id, placerId)).get();
      for (const b of all) {
        db.delete(bounties).where(eq(bounties.id, b.id)).run();
      }
      db.update(players).set({ yen: fresh.yen + total }).where(eq(players.discord_id, placerId)).run();
      result = { total, count: all.length };
    })();
  } catch (err) {
    console.error(`[${new Date().toISOString()}] bounties.js: cancelBounties txn failed — ${err.message}`);
  }
  if (!result) return { error: 'You have no bounties on that target.' };
  return { ok: true, total: result.total, count: result.count };
}

module.exports = { placeBounty, listBounties, claimBounties, cancelBounties };
