// Category-based effect definitions for quick technique creation
// Each category defines default effects that techniques of that type get for free

const CATEGORY_BONUSES = {
  emoji: {
    tags: ['emoji', 'reaction'],
    effects: [
      { use: 'conditional_bonus', with: { condition: 'has_reactions', bonus: 10 } },
    ],
    description: 'Uses emoji reactions as ammunition',
  },
  thread: {
    tags: ['thread', 'isolation'],
    effects: [
      { use: 'apply_status', with: { status: 'SKIP' } },
    ],
    description: 'Manipulates Discord threads',
  },
  voice: {
    tags: ['voice', 'sound'],
    effects: [
      { use: 'apply_status', with: { status: 'CONFUSE' } },
    ],
    description: 'Wields voice channel powers',
  },
  role: {
    tags: ['role', 'authority'],
    effects: [
      { use: 'conditional_bonus', with: { condition: 'higher_role', bonus: 15 } },
    ],
    description: 'Leverages Discord roles',
  },
  shield: {
    tags: ['shield', 'barrier'],
    effects: [
      { use: 'shield', with: { amount: 40 } },
    ],
    description: 'Creates cursed barriers',
  },
  heal: {
    tags: ['heal', 'recovery'],
    effects: [
      { use: 'heal', with: { amount: 30, target: 'self' } },
    ],
    description: 'Restores HP with RCT',
  },
  drain: {
    tags: ['drain', 'vampire'],
    effects: [
      { use: 'ce_drain', with: { amount: 25 } },
    ],
    description: 'Siphons cursed energy',
  },
  multi: {
    tags: ['multi', 'combo'],
    effects: [
      { use: 'multi_hit', with: { hits: 3, perHit: { min: 6, max: 10 } } },
    ],
    description: 'Multi-hit attack chains',
  },
  fire: {
    tags: ['fire', 'burn'],
    effects: [],
    description: 'Scorching cursed flames',
  },
  ice: {
    tags: ['ice', 'freeze'],
    effects: [],
    description: 'Freezing cursed energy',
  },
  lightning: {
    tags: ['lightning', 'thunder'],
    effects: [],
    description: 'Electrified cursed strikes',
  },
  poison: {
    tags: ['poison', 'toxin'],
    effects: [],
    description: 'Toxic cursed energy',
  },
  summon: {
    tags: ['summon', 'shikigami'],
    effects: [],
    description: 'Summons shikigami to fight',
  },
  domain: {
    tags: ['domain', 'expansion'],
    effects: [
      { use: 'power_up', with: { turns: 3, bonus: 20 } },
    ],
    description: 'Reality-altering domains',
  },
  webhook: {
    tags: ['webhook', 'deception'],
    effects: [],
    description: 'Webhook-based trickery',
  },
  poll: {
    tags: ['poll', 'vote'],
    effects: [],
    description: 'Community-powered attacks',
  },
  modal: {
    tags: ['modal', 'input'],
    effects: [],
    description: 'Requires text input',
  },
  sticker: {
    tags: ['sticker', 'image'],
    effects: [],
    description: 'Sticker-infused attacks',
  },
  time: {
    tags: ['time', 'temporal'],
    effects: [
      { use: 'cooldown_reset', with: { target: 'self' } },
    ],
    description: 'Time-manipulating techniques',
  },
  channel: {
    tags: ['channel', 'spatial'],
    effects: [],
    description: 'Channel-warping abilities',
  },
};

// Technique templates for quick generation
const TECHNIQUE_TEMPLATES = {
  basic_offensive: {
    type: 'Offensive',
    ce_cost: 30,
    damage_min: 20,
    damage_max: 40,
    cooldown_seconds: 10,
    effects: [{ use: 'damage', with: { min: 20, max: 40 } }],
  },
  heavy_offensive: {
    type: 'Offensive',
    ce_cost: 60,
    damage_min: 50,
    damage_max: 80,
    cooldown_seconds: 20,
    effects: [{ use: 'damage', with: { min: 50, max: 80 } }],
  },
  utility: {
    type: 'Utility',
    ce_cost: 35,
    damage_min: 0,
    damage_max: 0,
    cooldown_seconds: 15,
    effects: [],
  },
  defensive: {
    type: 'Defensive',
    ce_cost: 30,
    damage_min: 0,
    damage_max: 0,
    cooldown_seconds: 15,
    effects: [{ use: 'shield', with: { amount: 40 } }],
  },
  summon: {
    type: 'Summon',
    ce_cost: 45,
    damage_min: 25,
    damage_max: 50,
    cooldown_seconds: 15,
    effects: [{ use: 'damage', with: { min: 25, max: 50 } }],
  },
};

function generateTechnique(id, name, template, customEffects = [], overrides = {}) {
  const base = TECHNIQUE_TEMPLATES[template];
  if (!base) throw new Error(`Unknown template: ${template}`);

  return {
    id,
    name,
    ...base,
    effects: [...(base.effects || []), ...customEffects],
    is_innate: false,
    parent_technique_id: null,
    status_effect: null,
    unlock_requires: null,
    lore: '',
    description: overrides.description || `${name} — a technique of unknown origin.`,
    ...overrides,
  };
}

module.exports = { CATEGORY_BONUSES, TECHNIQUE_TEMPLATES, generateTechnique };
