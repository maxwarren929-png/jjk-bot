const toggle = new Map();

function isTechniquesEnabled(guildId) {
  if (!guildId) return true;
  return toggle.get(guildId) !== false;
}

function setTechniquesEnabled(guildId, enabled) {
  toggle.set(guildId, enabled);
}

module.exports = { isTechniquesEnabled, setTechniquesEnabled };
