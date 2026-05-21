const domainActive = new Map();

const DOMAIN_DURATION_MS = 5 * 60 * 1000;

function activateDomain(userId) {
  domainActive.set(userId, Date.now() + DOMAIN_DURATION_MS);
}

function isDomainActive(userId) {
  const entry = domainActive.get(userId);
  if (!entry) return false;
  if (Date.now() > entry) {
    domainActive.delete(userId);
    return false;
  }
  return true;
}

function getDomainMultiplier(userId) {
  return isDomainActive(userId) ? 1.25 : 1.0;
}

function deactivateDomain(userId) {
  domainActive.delete(userId);
}

setInterval(() => {
  const now = Date.now();
  for (const [id, expiresAt] of domainActive) {
    if (now > expiresAt) domainActive.delete(id);
  }
}, 60000);

module.exports = { activateDomain, isDomainActive, getDomainMultiplier, deactivateDomain };
