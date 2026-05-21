const { db, sqlite } = require('../db/index');
const { players, bounties } = require('../db/schema');
const { eq, and } = require('drizzle-orm');

function placeBounty(placerId, targetId, amount) {
  const placer = db.select().from(players).where(eq(players.discord_id, placerId)).get();
  if (!placer) return { error: 'You need a profile first.' };
  if (placer.yen < amount) return { error: `Not enough yen. Need **${amount} 💰**, have **${placer.yen} 💰**.` };
  if (placerId === targetId) return { error: 'You cannot place a bounty on yourself.' };

  const target = db.select().from(players).where(eq(players.discord_id, targetId)).get();
  if (!target) return { error: 'Target has no profile.' };

  db.update(players).set({ yen: placer.yen - amount }).where(eq(players.discord_id, placerId)).run();

  db.insert(bounties).values({
    target_id: targetId,
    placed_by_id: placerId,
    amount,
    created_at: Date.now(),
  }).run();

  return { ok: true, amount, targetName: target.username };
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
  const all = db.select().from(bounties).where(eq(bounties.target_id, targetId)).all();
  if (all.length === 0) return null;

  const total = all.reduce((sum, b) => sum + b.amount, 0);

  const del = sqlite.transaction(() => {
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
  });
  del();

  return { total, count: all.length };
}

module.exports = { placeBounty, listBounties, claimBounties };
