'use strict';

const { v4: uuidv4 } = require('uuid');
const { GameEngine, TURN_TIMEOUT_MS } = require('../game/engine');
const { calcSetRankings } = require('../game/scorer');
const { db } = require('../db/database');

// Live game state: in-memory (fast, no I/O for card data)
// Completed results are persisted to SQLite.
const rooms = new Map(); // roomCode → roomState

const RECONNECT_WINDOW_MS = 60_000;

// ─── Room creation & joining ─────────────────────────────────────────────────

function createRoom(hostId, maxGames = 4) {
  const code = generateCode();
  const roomId = uuidv4();

  const room = {
    id: roomId,
    code,
    hostId,
    maxGames,
    status: 'waiting',
    players: [{ id: hostId, connected: true, disconnectedAt: null }],
    setId: null,
    setScores: {},
    currentGame: null,
    gameHistory: [],
  };

  rooms.set(code, room);

  // Persist room skeleton to DB
  db().prepare(
    'INSERT INTO rooms (id, code, host_id, max_games) VALUES (?, ?, ?, ?)'
  ).run(roomId, code, hostId, maxGames);

  return { ok: true, room };
}

function joinRoom(code, playerId) {
  const room = rooms.get(code);
  if (!room)                                       return { ok: false, error: 'ROOM_NOT_FOUND' };
  if (room.status !== 'waiting')                   return { ok: false, error: 'GAME_ALREADY_STARTED' };
  if (room.players.length >= 4)                    return { ok: false, error: 'ROOM_FULL' };
  if (room.players.find(p => p.id === playerId))   return { ok: false, error: 'ALREADY_IN_ROOM' };

  room.players.push({ id: playerId, connected: true, disconnectedAt: null });
  return { ok: true, room };
}

function getRoom(code) {
  return rooms.get(code) || null;
}

// ─── Set / Game lifecycle ────────────────────────────────────────────────────

function startSet(code) {
  const room = rooms.get(code);
  if (!room)                       return { ok: false, error: 'ROOM_NOT_FOUND' };
  if (room.players.length !== 4)   return { ok: false, error: 'NEED_4_PLAYERS' };
  if (room.status !== 'waiting')   return { ok: false, error: 'ALREADY_STARTED' };

  const playerIds = room.players.map(p => p.id);
  const setId = uuidv4();

  room.status   = 'playing';
  room.setId    = setId;
  room.setScores = Object.fromEntries(playerIds.map(id => [id, 0]));
  room.gameHistory = [];
  room.currentGame = GameEngine.initGame(playerIds, 1, null);

  db().prepare('INSERT INTO sets (id, room_id) VALUES (?, ?)').run(setId, room.id);
  db().prepare('UPDATE rooms SET status = ? WHERE id = ?').run('playing', room.id);

  return { ok: true, room };
}

function processPlay(code, playerId, cardIds) {
  const room = rooms.get(code);
  if (!room || !room.currentGame) return { ok: false, error: 'NO_ACTIVE_GAME' };

  const result = GameEngine.processPlay(room.currentGame, playerId, cardIds);
  if (!result.ok) return result;

  room.currentGame = result.state;

  if (result.event.type === 'game_over') {
    _handleGameOver(room, result.event);
  }

  return { ok: true, event: result.event, room };
}

function processSkip(code, playerId) {
  const room = rooms.get(code);
  if (!room || !room.currentGame) return { ok: false, error: 'NO_ACTIVE_GAME' };

  const result = GameEngine.processSkip(room.currentGame, playerId);
  if (!result.ok) return result;

  room.currentGame = result.state;
  return { ok: true, event: result.event, room };
}

function processAutoSkip(code) {
  const room = rooms.get(code);
  if (!room || !room.currentGame) return null;

  const result = GameEngine.processAutoSkip(room.currentGame);
  if (!result.ok) return null;

  room.currentGame = result.state;
  if (result.event.type === 'game_over') _handleGameOver(room, result.event);

  return { event: result.event, room };
}

function _handleGameOver(room, event) {
  // Accumulate set scores
  for (const s of event.scores) {
    room.setScores[s.id] = (room.setScores[s.id] || 0) + s.score;
  }

  const gameId = uuidv4();
  room.gameHistory.push({
    gameId,
    gameNumber: room.currentGame.gameNumber,
    winnerId: event.winnerId,
    scores: event.scores,
  });

  // Persist to DB
  const stmt = db().prepare(
    'INSERT INTO games (id, set_id, game_number, winner_id, win_type, ended_at) VALUES (?, ?, ?, ?, ?, datetime(\'now\'))'
  );
  stmt.run(gameId, room.setId, room.currentGame.gameNumber, event.winnerId, event.lastCombo?.winType || 'normal');

  const scoreStmt = db().prepare(
    'INSERT INTO game_scores (id, game_id, user_id, score, remaining_cards, penalty_type) VALUES (?, ?, ?, ?, ?, ?)'
  );
  for (const s of event.scores) {
    scoreStmt.run(uuidv4(), gameId, s.id, s.score, JSON.stringify(s.remainingCards || []), s.penaltyType || null);
  }

  const nextNum = room.currentGame.gameNumber + 1;

  if (nextNum > room.maxGames) {
    // Set over
    room.status = 'done';
    room.currentGame = null;
    const rankings = calcSetRankings(room.setScores);
    db().prepare('UPDATE sets SET ended_at = datetime(\'now\') WHERE id = ?').run(room.setId);
    db().prepare('UPDATE rooms SET status = ? WHERE id = ?').run('done', room.id);
    event.setOver    = true;
    event.rankings   = rankings;
    event.setScores  = room.setScores;
  } else {
    // Next game — winner leads
    room.currentGame = GameEngine.initGame(
      room.players.map(p => p.id),
      nextNum,
      event.winnerId,
    );
    event.nextGame  = nextNum;
    event.nextFirst = event.winnerId;
  }
}

// ─── Disconnect / reconnect ──────────────────────────────────────────────────

function markDisconnected(code, playerId) {
  const room = rooms.get(code);
  if (!room) return;
  const p = room.players.find(p => p.id === playerId);
  if (p) { p.connected = false; p.disconnectedAt = Date.now(); }

  // Migrate host if needed
  if (room.hostId === playerId) {
    const next = room.players.find(p => p.id !== playerId && p.connected);
    if (next) room.hostId = next.id;
  }
}

function reconnect(code, playerId) {
  const room = rooms.get(code);
  if (!room) return { ok: false, error: 'ROOM_NOT_FOUND' };

  const p = room.players.find(p => p.id === playerId);
  if (!p) return { ok: false, error: 'NOT_IN_ROOM' };

  const elapsed = Date.now() - (p.disconnectedAt || 0);
  if (elapsed > RECONNECT_WINDOW_MS) return { ok: false, error: 'RECONNECT_EXPIRED' };

  p.connected = true;
  p.disconnectedAt = null;
  return { ok: true, room };
}

// ─── Public view ─────────────────────────────────────────────────────────────

function publicState(code, forPlayerId) {
  const room = rooms.get(code);
  if (!room) return null;
  return {
    code:        room.code,
    hostId:      room.hostId,
    status:      room.status,
    maxGames:    room.maxGames,
    players:     room.players.map(p => ({ id: p.id, connected: p.connected })),
    setScores:   room.setScores,
    gameHistory: room.gameHistory,
    game:        room.currentGame
      ? GameEngine.publicState(room.currentGame, forPlayerId)
      : null,
  };
}

// ─── Utils ───────────────────────────────────────────────────────────────────

function generateCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code;
  do {
    code = Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  } while (rooms.has(code));
  return code;
}

module.exports = { createRoom, joinRoom, getRoom, startSet, processPlay, processSkip, processAutoSkip, markDisconnected, reconnect, publicState };
