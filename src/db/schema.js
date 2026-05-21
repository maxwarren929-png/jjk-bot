const { sqliteTable, text, integer, real } = require('drizzle-orm/sqlite-core');

const players = sqliteTable('players', {
  discord_id: text('discord_id').primaryKey(),
  username: text('username').notNull(),
  hp: integer('hp').notNull().default(100),
  max_hp: integer('max_hp').notNull().default(1000),
  ce: integer('ce').notNull().default(100),
  max_ce: integer('max_ce').notNull().default(100),
  grade: text('grade').notNull().default('Grade 4'),
  yen: integer('yen').notNull().default(50),
  innate_technique_id: text('innate_technique_id'),
  unlocked_techniques: text('unlocked_techniques').notNull().default('[]'),
  clan_id: integer('clan_id'),
  reputation: text('reputation').notNull().default('Neutral'),
  is_broken: integer('is_broken', { mode: 'boolean' }).notNull().default(false),
  broken_until: integer('broken_until'),
  innate_removed: integer('innate_removed', { mode: 'boolean' }).notNull().default(false),
  training_until: integer('training_until'),
  training_type: text('training_type'),
  fight_wins: integer('fight_wins').notNull().default(0),
  bounty_kills: integer('bounty_kills').notNull().default(0),
  last_fight_at: integer('last_fight_at'),
  last_domain_at: integer('last_domain_at'),
  last_robbed_at: integer('last_robbed_at'),
  last_daily_at: integer('last_daily_at'),
  daily_streak: integer('daily_streak').notNull().default(0),
  bank_balance: integer('bank_balance').notNull().default(0),
  bank_max: integer('bank_max').notNull().default(5000),
  last_interest_at: integer('last_interest_at'),
  job: text('job'),
  job_data: text('job_data').notNull().default('{}'),
  created_at: integer('created_at').notNull().$defaultFn(() => Date.now()),
});

const techniques = sqliteTable('techniques', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  type: text('type').notNull(),
  ce_cost: integer('ce_cost').notNull(),
  damage_min: integer('damage_min').notNull().default(0),
  damage_max: integer('damage_max').notNull().default(0),
  description: text('description').notNull(),
  lore: text('lore').notNull().default(''),
  cooldown_seconds: integer('cooldown_seconds').notNull().default(0),
  is_innate: integer('is_innate', { mode: 'boolean' }).notNull().default(false),
  parent_technique_id: text('parent_technique_id'),
  status_effect: text('status_effect'),
  unlock_requires: text('unlock_requires'),
});

const clans = sqliteTable('clans', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull().unique(),
  owner_id: text('owner_id').notNull(),
  passive_bonus: text('passive_bonus').notNull().default('CE_REGEN'),
  member_limit: integer('member_limit').notNull().default(20),
  invite_only: integer('invite_only', { mode: 'boolean' }).notNull().default(false),
  description: text('description').notNull().default(''),
  clan_balance: integer('clan_balance').notNull().default(0),
  created_at: integer('created_at').notNull().$defaultFn(() => Date.now()),
});

const clan_members = sqliteTable('clan_members', {
  clan_id: integer('clan_id').notNull(),
  player_id: text('player_id').notNull(),
  role: text('role').notNull().default('Member'),
  joined_at: integer('joined_at').notNull().$defaultFn(() => Date.now()),
});

const clan_invites = sqliteTable('clan_invites', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  clan_id: integer('clan_id').notNull(),
  invitee_id: text('invitee_id').notNull(),
  invited_by: text('invited_by').notNull(),
  created_at: integer('created_at').notNull().$defaultFn(() => Date.now()),
});

const bounties = sqliteTable('bounties', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  target_id: text('target_id').notNull(),
  placed_by_id: text('placed_by_id').notNull(),
  amount: integer('amount').notNull(),
  created_at: integer('created_at').notNull().$defaultFn(() => Date.now()),
});

const shop_items = sqliteTable('shop_items', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  type: text('type').notNull(),
  cost: integer('cost').notNull(),
  effect: text('effect').notNull(),
  description: text('description').notNull(),
});

module.exports = { players, techniques, clans, clan_members, clan_invites, bounties, shop_items };
