const ENHANCE_MULT = 0.3;
const MAX_ENHANCE = 10;

const EQUIPMENT_ITEMS = {
  CURSED_BLADE: {
    name: '🗡️ Cursed Blade',
    slot: 'weapon',
    bonuses: { bonusDamage: 15 },
    cost: 1000,
    desc: 'A blade infused with cursed energy. +15 damage on all attacks.',
  },
  IRON_GAUNTLETS: {
    name: '👊 Iron Gauntlets',
    slot: 'weapon',
    bonuses: { bonusDamage: 5 },
    cost: 400,
    desc: 'Reinforced gauntlets. +5 damage on all attacks.',
  },
  SHADOW_CLOAK: {
    name: '🌑 Shadow Cloak',
    slot: 'armor',
    bonuses: { damageReduction: 0.1 },
    cost: 1200,
    desc: 'Cloak woven from shadows. Reduces incoming damage by 10%.',
  },
  MYSTIC_ROBE: {
    name: '🔮 Mystic Robe',
    slot: 'armor',
    bonuses: { bonusMaxCe: 50 },
    cost: 800,
    desc: 'Enchanted robe that expands your CE reserves. +50 max CE.',
  },
  REINFORCED_VEST: {
    name: '🛡️ Reinforced Vest',
    slot: 'armor',
    bonuses: { bonusMaxHp: 100 },
    cost: 1000,
    desc: 'Kevlar infused with cursed steel. +100 max HP.',
  },
};

const SLOTS = ['weapon', 'armor'];

function getEquipmentItem(key) {
  return EQUIPMENT_ITEMS[key];
}

function getEnhancedBonuses(key, level) {
  const base = EQUIPMENT_ITEMS[key];
  if (!base) return {};
  const mult = 1 + ENHANCE_MULT * (level || 0);
  const bonuses = {};
  for (const [k, v] of Object.entries(base.bonuses)) {
    if (typeof v === 'number') {
      const scaled = v * mult;
      bonuses[k] = Number.isInteger(v) ? Math.round(scaled) : Math.round(scaled * 100) / 100;
    } else bonuses[k] = v;
  }
  return bonuses;
}

function getEnhanceCost(key, level) {
  const base = EQUIPMENT_ITEMS[key];
  if (!base) return Infinity;
  return Math.round(base.cost * (level + 1) * 0.5);
}

function getEnhanceSuccess(level) {
  return Math.max(10, 100 - level * 15);
}

module.exports = { EQUIPMENT_ITEMS, SLOTS, MAX_ENHANCE, getEquipmentItem, getEnhancedBonuses, getEnhanceCost, getEnhanceSuccess };
