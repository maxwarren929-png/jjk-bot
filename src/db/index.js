const Database = require('better-sqlite3');
const { drizzle } = require('drizzle-orm/better-sqlite3');
const schema = require('./schema');
const path = require('path');

const sqlite = new Database(path.join(__dirname, '../../cursed_energy.db'));
sqlite.pragma('journal_mode = WAL');

const db = drizzle(sqlite, { schema });

// Migrations for existing DBs
try { sqlite.exec(`ALTER TABLE players ADD COLUMN innate_removed INTEGER NOT NULL DEFAULT 0`); } catch {}
try { sqlite.exec(`ALTER TABLE players ADD COLUMN last_daily_at INTEGER`); } catch {}
try { sqlite.exec(`ALTER TABLE players ADD COLUMN daily_streak INTEGER NOT NULL DEFAULT 0`); } catch {}
try { sqlite.exec(`ALTER TABLE players ADD COLUMN bank_balance INTEGER NOT NULL DEFAULT 0`); } catch {}
try { sqlite.exec(`ALTER TABLE players ADD COLUMN bank_max INTEGER NOT NULL DEFAULT 5000`); } catch {}
try { sqlite.exec(`ALTER TABLE players ADD COLUMN last_interest_at INTEGER`); } catch {}
try { sqlite.exec(`ALTER TABLE players ADD COLUMN last_robbed_at INTEGER`); } catch {}
try { sqlite.exec(`ALTER TABLE players ADD COLUMN job TEXT`); } catch {}
try { sqlite.exec(`ALTER TABLE players ADD COLUMN job_data TEXT NOT NULL DEFAULT '{}'`); } catch {}

// Create tables if they don't exist (Drizzle migrate-lite approach)
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS players (
    discord_id TEXT PRIMARY KEY,
    username TEXT NOT NULL,
    hp INTEGER NOT NULL DEFAULT 100,
    max_hp INTEGER NOT NULL DEFAULT 1000,
    ce INTEGER NOT NULL DEFAULT 100,
    max_ce INTEGER NOT NULL DEFAULT 100,
    grade TEXT NOT NULL DEFAULT 'Grade 4',
    yen INTEGER NOT NULL DEFAULT 50,
    innate_technique_id TEXT,
    unlocked_techniques TEXT NOT NULL DEFAULT '[]',
    clan_id INTEGER,
    reputation TEXT NOT NULL DEFAULT 'Neutral',
    is_broken INTEGER NOT NULL DEFAULT 0,
    broken_until INTEGER,
    innate_removed INTEGER NOT NULL DEFAULT 0,
    training_until INTEGER,
    training_type TEXT,
    fight_wins INTEGER NOT NULL DEFAULT 0,
    bounty_kills INTEGER NOT NULL DEFAULT 0,
    last_fight_at INTEGER,
    last_domain_at INTEGER,
    last_robbed_at INTEGER,
    last_daily_at INTEGER,
    daily_streak INTEGER NOT NULL DEFAULT 0,
    bank_balance INTEGER NOT NULL DEFAULT 0,
    bank_max INTEGER NOT NULL DEFAULT 5000,
    last_interest_at INTEGER,
    job TEXT,
    job_data TEXT NOT NULL DEFAULT '{}',
    created_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS techniques (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    ce_cost INTEGER NOT NULL,
    damage_min INTEGER NOT NULL DEFAULT 0,
    damage_max INTEGER NOT NULL DEFAULT 0,
    description TEXT NOT NULL,
    lore TEXT NOT NULL DEFAULT '',
    cooldown_seconds INTEGER NOT NULL DEFAULT 0,
    is_innate INTEGER NOT NULL DEFAULT 0,
    parent_technique_id TEXT,
    status_effect TEXT,
    unlock_requires TEXT
  );
  CREATE TABLE IF NOT EXISTS clans (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    owner_id TEXT NOT NULL,
    passive_bonus TEXT NOT NULL DEFAULT 'CE_REGEN',
    member_limit INTEGER NOT NULL DEFAULT 20,
    invite_only INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS clan_members (
    clan_id INTEGER NOT NULL,
    player_id TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'Member',
    joined_at INTEGER NOT NULL,
    PRIMARY KEY (clan_id, player_id)
  );
  CREATE TABLE IF NOT EXISTS clan_invites (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    clan_id INTEGER NOT NULL,
    invitee_id TEXT NOT NULL,
    invited_by TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS bounties (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    target_id TEXT NOT NULL,
    placed_by_id TEXT NOT NULL,
    amount INTEGER NOT NULL,
    created_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS shop_items (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    cost INTEGER NOT NULL,
    effect TEXT NOT NULL,
    description TEXT NOT NULL
  );
`);

// Migration: bump old 300 max_hp players to 1000 (proportional HP)
const oldHpPlayers = sqlite.prepare(`SELECT discord_id, hp, max_hp FROM players WHERE max_hp = 300`).all();
if (oldHpPlayers.length > 0) {
  for (const p of oldHpPlayers) {
    const newHp = Math.round(p.hp * 1000 / 300);
    sqlite.prepare(`UPDATE players SET max_hp = 1000, hp = ? WHERE discord_id = ?`).run(newHp, p.discord_id);
  }
  console.log(`Migrated ${oldHpPlayers.length} players to 1000 base HP.`);
}

// Seed technique data on first run
const { TECHNIQUES } = require('../data/techniques');
const { techniques } = require('./schema');

const existingCount = sqlite.prepare('SELECT COUNT(*) as c FROM techniques').get().c;
if (existingCount === 0) {
  for (const t of TECHNIQUES) {
    db.insert(techniques).values(t).run();
  }
  console.log(`Seeded ${TECHNIQUES.length} techniques.`);
}

module.exports = { db };
