// Fly State — tracks users who are flying via Nue
// Flying users cannot use techniques, buy items, or take any actions

const flying = new Map(); // discord_id -> { expiresAt }

function setFlying(discordId, durationMs = 30 * 60 * 1000) {
  flying.set(discordId, { expiresAt: Date.now() + durationMs });
}

function isFlying(discordId) {
  const entry = flying.get(discordId);
  if (!entry) return false;
  if (Date.now() > entry.expiresAt) {
    flying.delete(discordId);
    return false;
  }
  return true;
}

function getFlyTimeLeft(discordId) {
  const entry = flying.get(discordId);
  if (!entry) return 0;
  const left = entry.expiresAt - Date.now();
  return left > 0 ? left : 0;
}

function removeFlying(discordId) {
  flying.delete(discordId);
}

// Clean stale entries every 60s
setInterval(() => {
  const now = Date.now();
  for (const [id, entry] of flying) {
    if (now > entry.expiresAt) flying.delete(id);
  }
}, 60000);

module.exports = { setFlying, isFlying, getFlyTimeLeft, removeFlying };
