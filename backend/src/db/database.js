'use strict';

const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const fs   = require('fs');

const DB_PATH = path.join(__dirname, '../../data/martil.db');

let _db = null;

/**
 * Schema migrations, applied in order; PRAGMA user_version = how many have been applied.
 * Never edit a migration that has shipped: append a new one instead.
 */
const MIGRATIONS = [
  // v1: baseline schema (identical to what the server created before schema versioning existed)
  (d) => {
    d.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        username TEXT UNIQUE NOT NULL,
        email TEXT,
        password_hash TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE TABLE IF NOT EXISTS rooms (
        id TEXT PRIMARY KEY,
        code TEXT UNIQUE NOT NULL,
        host_id TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'waiting',
        max_games INTEGER NOT NULL DEFAULT 4,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE TABLE IF NOT EXISTS room_players (
        id TEXT PRIMARY KEY,
        room_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        seat INTEGER NOT NULL,
        total_score INTEGER NOT NULL DEFAULT 0,
        UNIQUE(room_id, user_id),
        UNIQUE(room_id, seat)
      );
      CREATE TABLE IF NOT EXISTS sets (
        id TEXT PRIMARY KEY,
        room_id TEXT NOT NULL,
        started_at TEXT NOT NULL DEFAULT (datetime('now')),
        ended_at TEXT
      );
      CREATE TABLE IF NOT EXISTS games (
        id TEXT PRIMARY KEY,
        set_id TEXT NOT NULL,
        game_number INTEGER NOT NULL,
        winner_id TEXT,
        win_type TEXT,
        ended_at TEXT
      );
      CREATE TABLE IF NOT EXISTS game_scores (
        id TEXT PRIMARY KEY,
        game_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        score INTEGER NOT NULL,
        remaining_cards TEXT,
        penalty_type TEXT
      );
    `);
  },
];
const SCHEMA_VERSION = MIGRATIONS.length;

/** The database was written by a newer server than this one. */
class SchemaVersionError extends Error {}

const userVersion = (d) => d.prepare('PRAGMA user_version').get().user_version;

/** Apply pending migrations, each in its own transaction (rolled back, version unchanged, if it throws). */
function migrate(d, migrations = MIGRATIONS) {
  const current = userVersion(d);
  if (current > migrations.length) {
    throw new SchemaVersionError(
      `database schema version ${current} is newer than this server supports (${migrations.length}). Update the server or use the matching database file.`,
    );
  }
  for (let v = current; v < migrations.length; v += 1) {
    d.exec('BEGIN');
    try {
      migrations[v](d);
      d.exec(`PRAGMA user_version = ${v + 1}`);
      d.exec('COMMIT');
    } catch (e) {
      d.exec('ROLLBACK');
      throw e;
    }
  }
}

/** Open (creating if needed) a database file and bring its schema up to date. Pass ':memory:' for a throwaway DB. */
function openDatabase(filePath, migrations = MIGRATIONS) {
  if (filePath !== ':memory:') {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  }
  const d = new DatabaseSync(filePath);
  d.exec('PRAGMA journal_mode = WAL');
  d.exec('PRAGMA foreign_keys = ON');
  try {
    migrate(d, migrations);
  } catch (e) {
    d.close();
    throw e;
  }
  return d;
}

function db() {
  if (!_db) _db = openDatabase(DB_PATH);
  return _db;
}

/**
 * Room state lives in memory and is lost on restart, so rooms still marked 'waiting'/'playing' in the database
 * can no longer exist. Mark them 'closed'. 'done' (a finished set) and 'closed' are history and stay as they are,
 * and sets.ended_at is left alone (how unfinished sets are treated is not decided yet).
 * Only ever call this at startup, before any Room exists; never from db().
 * @returns {number} how many rooms were closed
 */
function closeStaleRooms(d) {
  const r = d.prepare("UPDATE rooms SET status = 'closed' WHERE status IN ('waiting', 'playing')").run();
  return Number(r.changes);
}

/**
 * Startup step (call once, before the server listens): open the database (running migrations) and close stale rooms.
 * A database from a newer server stops the process with exit code 1 and one short line (no stack trace).
 */
function bootDatabase(filePath = DB_PATH, migrations = MIGRATIONS) {
  try {
    _db = openDatabase(filePath, migrations);
  } catch (e) {
    if (e instanceof SchemaVersionError) {
      const line = `[db] FATAL: ${e.message}\n`;
      try { fs.writeSync(2, line); } catch { console.error(line.trimEnd()); }
      process.exit(1);
    }
    throw e;
  }
  const closed = closeStaleRooms(_db);
  if (closed > 0) console.info(`[MARTIL ${new Date().toISOString()}] DB_STALE_ROOMS_CLOSED`, { count: closed });
  return { closedStaleRooms: closed };
}

module.exports = {
  db, openDatabase, bootDatabase, closeStaleRooms, migrate, SchemaVersionError, MIGRATIONS, SCHEMA_VERSION,
};
