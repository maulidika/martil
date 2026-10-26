'use strict';

const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const fs   = require('fs');

const DB_PATH = path.join(__dirname, '../../data/martil.db');

let _db = null;

function db() {
  if (_db) return _db;

  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  _db = new DatabaseSync(DB_PATH);
  _db.exec('PRAGMA journal_mode = WAL');
  _db.exec('PRAGMA foreign_keys = ON');
  _migrate(_db);
  return _db;
}

function _migrate(d) {
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
}

module.exports = { db };
