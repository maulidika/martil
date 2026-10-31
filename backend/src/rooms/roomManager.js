'use strict';

const { v4: uuidv4 } = require('uuid');
const { GameEngine, TURN_TIMEOUT_MS } = require('../game/engine');
const { calcSetRankings } = require('../game/scorer');
const { db } = require('../db/database');

// Live game state: in-memory (fast, no I/O for card data)
// Completed results are persisted to SQLite.
const rooms = new Map(); // roomCode → roomState

const RECONNECT_WINDOW_MS  = 60_000;       // batas pemain terputus sebelum dikeluarkan (room waiting/done)
const ABANDONED_ROOM_MS    = 10 * 60_000;  // semua pemain terputus selama ini → room dianggap ditinggalkan
const REMOVAL_MEMORY_MS    = 10 * 60_000;  // berapa lama alasan "dikeluarkan" diingat untuk resume berikutnya

// userId → { code, reason, at } — agar pemain yang kembali setelah dikeluarkan mendapat pesan yang jelas
const removals = new Map();

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
    players: [{ id: hostId, connected: true, disconnectedAt: null, socketId: null, joinedAt: Date.now() }],
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

  room.players.push({ id: playerId, connected: true, disconnectedAt: null, socketId: null, joinedAt: Date.now() });
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
    // Disimpan agar pemain yang refresh/reconnect di Scoreboard bisa melihat hasil yang sama.
    room.setResult   = { rankings, setScores: { ...room.setScores } };
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

function leaveRoom(code, playerId) {
  const room = rooms.get(code);
  if (!room) return { ok: false, error: 'ROOM_NOT_FOUND' };
  if (room.status !== 'done') return { ok: false, error: 'SET_NOT_FINISHED' };

  const playerIndex = room.players.findIndex(p => p.id === playerId);
  if (playerIndex === -1) return { ok: false, error: 'NOT_IN_ROOM' };

  room.players.splice(playerIndex, 1);
  if (room.hostId === playerId) room.hostId = room.players[0]?.id || null;

  const roomDeleted = room.players.length === 0;
  if (roomDeleted) rooms.delete(code);
  return { ok: true, room, roomDeleted };
}

function markDisconnected(code, playerId, socketId = null, now = Date.now()) {
  const room = rooms.get(code);
  if (!room) return false;
  const p = room.players.find(p => p.id === playerId);
  if (!p || !p.connected) return false;

  // Socket lama yang telat putus (refresh / tab lain) tidak boleh menandai
  // pemain yang sudah terikat ke socket yang lebih baru sebagai terputus.
  if (socketId && p.socketId && p.socketId !== socketId) return false;

  p.connected = false;
  p.disconnectedAt = now;
  // Perpindahan host sengaja ditunda sampai batas reconnect lewat (lihat _expireRoom),
  // supaya host yang hanya refresh tidak kehilangan perannya.
  return true;
}

/** Ikat socket aktif ke pemain (dipanggil saat create/join room). */
function bindSocket(code, playerId, socketId) {
  const room = rooms.get(code);
  const p = room?.players.find(p => p.id === playerId);
  if (!p) return false;
  p.socketId = socketId;
  p.connected = true;
  p.disconnectedAt = null;
  return true;
}

/** Cari room tempat pemain menjadi anggota. Game yang sedang berjalan didahulukan. */
function findRoomByPlayer(userId, hintCode = null) {
  if (hintCode) {
    const hinted = rooms.get(hintCode);
    if (hinted?.players.some(p => p.id === userId)) return hinted;
  }
  let best = null;
  let bestJoined = -1;
  for (const room of rooms.values()) {
    const p = room.players.find(p => p.id === userId);
    if (!p) continue;
    if (room.status === 'playing') return room;
    if (p.joinedAt > bestJoined) { best = room; bestJoined = p.joinedAt; }
  }
  return best;
}

/**
 * Hapus pemain yang terputus melebihi batas waktu (room waiting/done) dan
 * pindahkan host bila perlu. Return daftar event untuk di-broadcast.
 * Pemain di game yang sedang berjalan TIDAK dihapus (kursi dipertahankan).
 */
function _expireRoom(room, now) {
  const events = [];
  const code = room.code;

  if (room.status === 'waiting' || room.status === 'done') {
    for (const p of [...room.players]) {
      if (!p.connected && p.disconnectedAt != null && now - p.disconnectedAt > RECONNECT_WINDOW_MS) {
        room.players.splice(room.players.indexOf(p), 1);
        removals.set(p.id, { code, reason: 'EXPIRED', at: now });
        events.push({ type: 'player_expired', code, playerId: p.id });
      }
    }
    if (room.players.length === 0) {
      rooms.delete(code);
      events.push({ type: 'room_deleted', code });
      return events;
    }
  }

  const host = room.players.find(p => p.id === room.hostId);
  const hostGone = !host || (!host.connected && host.disconnectedAt != null && now - host.disconnectedAt > RECONNECT_WINDOW_MS);
  if (hostGone) {
    const next = room.players.find(p => p.connected && p.id !== room.hostId) || (!host ? room.players[0] : null);
    if (next && next.id !== room.hostId) {
      room.hostId = next.id;
      events.push({ type: 'host_changed', code, hostId: next.id });
    }
  }
  return events;
}

/** Dipanggil periodik: kadaluarsakan pemain terputus dan tutup room yang ditinggalkan. */
function sweepExpired(now = Date.now()) {
  const events = [];
  for (const room of [...rooms.values()]) {
    const allGone = room.players.length > 0 && room.players.every(p => !p.connected);
    if (allGone) {
      const lastSeen = Math.max(...room.players.map(p => p.disconnectedAt ?? 0));
      if (now - lastSeen > ABANDONED_ROOM_MS) {
        for (const p of room.players) removals.set(p.id, { code: room.code, reason: 'ROOM_CLOSED', at: now });
        rooms.delete(room.code);
        events.push({ type: 'room_abandoned', code: room.code });
        continue;
      }
    }
    events.push(..._expireRoom(room, now));
  }
  for (const [id, r] of removals) if (now - r.at > REMOVAL_MEMORY_MS) removals.delete(id);
  return events;
}

/**
 * Pulihkan sesi pemain (refresh / koneksi putus / login di tab baru).
 * Tidak membuat room atau game baru dan tidak mengacak kartu: hanya mengikat
 * socket baru ke keanggotaan yang sudah ada.
 */
function resumeSession(userId, socketId, now = Date.now(), hintCode = null) {
  const room = findRoomByPlayer(userId, hintCode);
  if (!room) {
    const rem = removals.get(userId);
    if (rem && now - rem.at <= REMOVAL_MEMORY_MS) {
      removals.delete(userId);
      return { ok: false, error: rem.reason, events: [] };
    }
    return { ok: false, error: 'NO_ROOM', events: [] };
  }

  const events = _expireRoom(room, now);
  const p = room.players.find(p => p.id === userId);
  if (!p) {
    const rem = removals.get(userId);
    removals.delete(userId);
    return { ok: false, error: rem?.reason || 'NOT_IN_ROOM', events };
  }

  const wasDisconnected = !p.connected;
  const previousSocketId = p.socketId;
  p.connected = true;
  p.disconnectedAt = null;
  p.socketId = socketId;
  return { ok: true, room, wasDisconnected, previousSocketId, events };
}

/** Mulai ulang jam giliran (dipakai setelah jeda antar-game agar timeLeft sama dengan timer server). */
function restartTurnClock(code) {
  const room = rooms.get(code);
  if (room?.currentGame) room.currentGame.turnStartedAt = Date.now();
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

module.exports = {
  createRoom, joinRoom, getRoom, startSet, processPlay, processSkip, processAutoSkip,
  leaveRoom, markDisconnected, bindSocket, findRoomByPlayer, resumeSession, sweepExpired,
  restartTurnClock, publicState, RECONNECT_WINDOW_MS,
};
