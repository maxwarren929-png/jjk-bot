// Technique Locker — used by Confiscation to lock a target's technique
// Locked techniques are silently blocked before processing

const locked = new Map(); // `${targetId}:${techniqueId}` -> expiresAt

function lockTechnique(targetId, techniqueId, durationMs = 2 * 24 * 60 * 60 * 1000) {
  const key = `${targetId}:${techniqueId}`;
  locked.set(key, Date.now() + durationMs);
}

function isTechniqueLocked(targetId, techniqueId) {
  const key = `${targetId}:${techniqueId}`;
  const entry = locked.get(key);
  if (!entry) return false;
  if (Date.now() > entry) {
    locked.delete(key);
    return false;
  }
  return true;
}

function getLockedTechniques(targetId) {
  const result = [];
  const now = Date.now();
  for (const [key, expiresAt] of locked) {
    if (key.startsWith(`${targetId}:`) && now < expiresAt) {
      result.push(key.split(':')[1]);
    }
  }
  return result;
}

function removeLock(targetId, techniqueId) {
  locked.delete(`${targetId}:${techniqueId}`);
}

// Clean stale entries every 60s
setInterval(() => {
  const now = Date.now();
  for (const [key, expiresAt] of locked) {
    if (now > expiresAt) locked.delete(key);
  }
}, 60000);

module.exports = { lockTechnique, isTechniqueLocked, getLockedTechniques, removeLock };
