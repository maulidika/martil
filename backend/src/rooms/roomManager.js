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

// userId → { code, setResult, connected, disconnectedAt, socketId, at }
// Pemain yang di-Kick oleh Host saat berada di Result. Mereka dikeluarkan dari room.players (kursi bebas,
// tidak menahan host) tetapi tetap boleh melihat hasil set (salinan setResult disimpan di sini) dan TIDAK boleh
// kembali ke Room sebelum kembali ke Homepage (leave_room) atau terkena timeout disconnect yang sama
// dengan pemain biasa (RECONNECT_WINDOW_MS). Disimpan di server agar refresh/reconnect tidak menghapusnya.
const restrictions = new Map();

// ─── Room creation & joining ─────────────────────────────────────────────────

function createRoom(hostId, maxGames = 4) {
  if (restrictions.has(hostId)) return { ok: false, error: 'KICKED_FROM_ROOM' };
  if (removals.get(hostId)?.reason === 'KICKED') removals.delete(hostId);
  const code = generateCode();
  const roomId = uuidv4();

  const room = {
    id: roomId,
    code,
    hostId,
    maxGames,
    status: 'waiting',
    players: [{ id: hostId, connected: true, inRoom: true, disconnectedAt: null, socketId: null, joinedAt: Date.now() }],
    setId: null,
    setScores: {},
    currentGame: null,
    // true from the moment a game ends until the next one is announced (`game_started`).
    // The next game's state already exists during this ~5 s gap, but nobody may act on it yet.
    intermission: false,
    gameHistory: [],
    setResult: null,   // hasil set terakhir (dipertahankan sampai set baru dimulai)
  };

  rooms.set(code, room);

  // Persist room skeleton to DB
  db().prepare(
    'INSERT INTO rooms (id, code, host_id, max_games) VALUES (?, ?, ?, ?)'
  ).run(roomId, code, hostId, maxGames);

  return { ok: true, room };
}

function joinRoom(code, playerId) {
  if (restrictions.has(playerId))                  return { ok: false, error: 'KICKED_FROM_ROOM' };
  const room = rooms.get(code);
  if (!room)                                       return { ok: false, error: 'ROOM_NOT_FOUND' };
  if (room.status === 'playing')                   return { ok: false, error: 'GAME_ALREADY_STARTED' };
  if (room.players.length >= 4)                    return { ok: false, error: 'ROOM_FULL' };
  if (room.players.find(p => p.id === playerId))   return { ok: false, error: 'ALREADY_IN_ROOM' };

  // Room yang set-nya sudah selesai tetap bisa dimasuki pemain baru (kursi kosong setelah
  // ada yang keluar): room kembali ke status waiting untuk set berikutnya.
  const reset = room.status === 'done' ? _resetRoomForNewSet(room) : false;

  if (removals.get(playerId)?.reason === 'KICKED') removals.delete(playerId);   // Kick bukan blacklist: boleh bergabung lagi
  room.players.push({ id: playerId, connected: true, inRoom: true, disconnectedAt: null, socketId: null, joinedAt: Date.now() });
  return { ok: true, room, reset };
}

/**
 * Bersihkan state set sebelumnya agar room siap untuk set baru.
 * Keanggotaan, host, dan maxGames dipertahankan. room.setResult sengaja TIDAK dihapus:
 * pemain yang masih berada di Scoreboard (belum menekan Back to Room) masih membutuhkannya
 * bila refresh; hasil itu dibersihkan ketika set baru dimulai.
 */
function _resetRoomForNewSet(room) {
  if (room.status !== 'done') return false;
  room.status      = 'waiting';
  room.setId       = null;
  room.setScores   = {};
  room.gameHistory = [];
  room.currentGame = null;
  room.intermission = false;
  db().prepare('UPDATE rooms SET status = ? WHERE id = ?').run('waiting', room.id);
  return true;
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
  if (room.players.some(p => p.inRoom === false)) return { ok: false, error: 'PLAYERS_NOT_READY' };

  const playerIds = room.players.map(p => p.id);
  const setId = uuidv4();

  room.status   = 'playing';
  room.setId    = setId;
  room.setScores = Object.fromEntries(playerIds.map(id => [id, 0]));
  room.gameHistory = [];
  room.setResult   = null;
  room.intermission = false;
  room.currentGame = GameEngine.initGame(playerIds, 1, null);

  db().prepare('INSERT INTO sets (id, room_id) VALUES (?, ?)').run(setId, room.id);
  db().prepare('UPDATE rooms SET status = ? WHERE id = ?').run('playing', room.id);

  return { ok: true, room };
}

function processPlay(code, playerId, cardIds) {
  const room = rooms.get(code);
  if (!room || !room.currentGame) return { ok: false, error: 'NO_ACTIVE_GAME' };
  if (room.intermission)          return { ok: false, error: 'GAME_STARTING' };

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
  if (room.intermission)          return { ok: false, error: 'GAME_STARTING' };

  const result = GameEngine.processSkip(room.currentGame, playerId);
  if (!result.ok) return result;

  room.currentGame = result.state;
  return { ok: true, event: result.event, room };
}

function processAutoSkip(code) {
  const room = rooms.get(code);
  if (!room || !room.currentGame) return null;
  if (room.intermission)          return null;   // no turn clock runs during the gap

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
    // Hasil dibekukan (termasuk riwayat game) agar Scoreboard tidak berubah ketika room
    // di-reset oleh pemain lain yang menekan Back to Room, dan bisa dipulihkan saat refresh.
    room.setResult   = {
      rankings,
      setScores:   { ...room.setScores },
      gameHistory: room.gameHistory.map(g => ({ ...g })),
    };
    event.gameHistory = room.setResult.gameHistory;
    // Semua pemain sekarang berada di Scoreboard, belum kembali ke Room.
    for (const p of room.players) p.inRoom = false;
  } else {
    // Next game — winner leads
    room.currentGame = GameEngine.initGame(
      room.players.map(p => p.id),
      nextNum,
      event.winnerId,
    );
    room.intermission = true;   // released by endIntermission() when `game_started` is sent
    event.nextGame  = nextNum;
    event.nextFirst = event.winnerId;
  }
}

// ─── Disconnect / reconnect ──────────────────────────────────────────────────

/** Pilih host pengganti: pemain yang terhubung dan sudah di Room didahulukan. */
function _pickNextHost(room) {
  return room.players.find(p => p.connected && p.inRoom !== false)
      || room.players.find(p => p.connected)
      || room.players[0]
      || null;
}

/**
 * Keluar dari room dengan sengaja (berbeda dari disconnect).
 * Diizinkan saat room menunggu ('waiting') atau set sudah selesai ('done');
 * ditolak saat game berjalan.
 */
function leaveRoom(code, playerId) {
  const room = rooms.get(code);
  if (!room) return { ok: false, error: 'ROOM_NOT_FOUND' };
  if (room.status === 'playing') return { ok: false, error: 'GAME_IN_PROGRESS' };

  const playerIndex = room.players.findIndex(p => p.id === playerId);
  if (playerIndex === -1) return { ok: false, error: 'NOT_IN_ROOM' };

  room.players.splice(playerIndex, 1);

  let newHostId = null;
  if (room.hostId === playerId) {
    newHostId = _pickNextHost(room)?.id || null;
    room.hostId = newHostId;
  }

  const roomDeleted = room.players.length === 0;
  if (roomDeleted) {
    rooms.delete(code);
    db().prepare('UPDATE rooms SET status = ? WHERE id = ?').run('closed', room.id);
  }
  return { ok: true, room, roomDeleted, hostChanged: !!newHostId && !roomDeleted, newHostId };
}

/**
 * Kembali ke Room dari Scoreboard. Panggilan pertama mereset room ke 'waiting'
 * (skor dan riwayat set lama dibersihkan, keanggotaan dipertahankan); panggilan
 * berikutnya dari pemain lain hanya menandai mereka sudah kembali. Idempoten.
 */
function returnToRoom(code, playerId) {
  if (restrictions.has(playerId)) return { ok: false, error: 'KICKED_FROM_ROOM' };
  const room = rooms.get(code);
  if (!room) return { ok: false, error: 'ROOM_NOT_FOUND' };
  const p = room.players.find(p => p.id === playerId);
  if (!p) return { ok: false, error: 'NOT_IN_ROOM' };
  if (room.status === 'playing') return { ok: false, error: 'GAME_IN_PROGRESS' };

  const reset = _resetRoomForNewSet(room);
  p.inRoom = true;
  return { ok: true, room, reset };
}

/** Halaman yang seharusnya dilihat pemain saat sesinya dipulihkan: 'game' | 'result' | 'room'. */
function restoreView(room, playerId) {
  if (room.status === 'playing') return 'game';
  if (room.status === 'done') return 'result';
  const me = room.players.find(p => p.id === playerId);
  if (me && me.inRoom === false && room.setResult) return 'result';
  return 'room';
}

/**
 * Host mengeluarkan pemain (Kick). Semua validasi ada di sini (server adalah sumber kebenaran).
 *  - hanya Host; tidak boleh mengeluarkan diri sendiri; tidak boleh saat game berlangsung;
 *  - mode 'room'   : target ada di Room → dihapus dari room, boleh bergabung lagi (bukan ban);
 *  - mode 'result' : target masih di Result (set selesai) → dihapus dari room tetapi tetap melihat hasil,
 *                    dengan pembatasan sampai kembali ke Homepage (lihat `restrictions`).
 */
function kickPlayer(code, hostId, targetId, now = Date.now()) {
  const room = rooms.get(code);
  if (!room)                     return { ok: false, error: 'ROOM_NOT_FOUND' };
  if (room.hostId !== hostId)    return { ok: false, error: 'NOT_HOST' };
  if (hostId === targetId)       return { ok: false, error: 'CANNOT_KICK_SELF' };
  if (room.status === 'playing') return { ok: false, error: 'GAME_IN_PROGRESS' };

  const idx = room.players.findIndex(p => p.id === targetId);
  if (idx === -1)                return { ok: false, error: 'TARGET_NOT_IN_ROOM' };
  const target = room.players[idx];

  const mode = room.setResult && (room.status === 'done' || target.inRoom === false) ? 'result' : 'room';
  room.players.splice(idx, 1);

  if (mode === 'result') {
    restrictions.set(targetId, {
      code,
      maxGames: room.maxGames,
      setResult: JSON.parse(JSON.stringify(room.setResult)),
      connected: target.connected,
      disconnectedAt: target.disconnectedAt,   // timeout disconnect yang sedang berjalan dilanjutkan, bukan diulang
      socketId: target.socketId,
      at: now,
    });
  } else {
    removals.set(targetId, { code, reason: 'KICKED', at: now });   // pesan jelas bila target sedang offline lalu kembali
  }
  return { ok: true, room, mode, targetId };
}

const getRestriction = (userId) => restrictions.get(userId) || null;
const clearRestriction = (userId) => restrictions.delete(userId);

/** Snapshot yang dikirim ke klien yang dibatasi (refresh/reconnect): selalu menampilkan Result. */
function restrictedState(userId) {
  const r = restrictions.get(userId);
  if (!r) return null;
  return {
    code: r.code, view: 'result', restricted: true, status: 'done', hostId: null, maxGames: r.maxGames,
    players: [], setScores: r.setResult.setScores, gameHistory: r.setResult.gameHistory, game: null, setResult: r.setResult,
  };
}

function markRestrictedDisconnected(userId, socketId = null, now = Date.now()) {
  const r = restrictions.get(userId);
  if (!r || !r.connected) return false;
  if (socketId && r.socketId && r.socketId !== socketId) return false;   // socket lama yang telat putus
  r.connected = false;
  r.disconnectedAt = now;
  return true;
}

/** Pembatasan berakhir dengan timeout disconnect yang sama seperti pemain biasa. */
function _expireRestriction(userId, now) {
  const r = restrictions.get(userId);
  if (!r || r.connected || r.disconnectedAt == null || now - r.disconnectedAt <= RECONNECT_WINDOW_MS) return null;
  restrictions.delete(userId);
  removals.set(userId, { code: r.code, reason: 'EXPIRED', at: now });
  return { type: 'restriction_expired', code: r.code, playerId: userId };
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
  for (const userId of [...restrictions.keys()]) {
    const ev = _expireRestriction(userId, now);
    if (ev) events.push(ev);
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
  // Pemain yang di-Kick dari Result: pembatasan tetap berlaku setelah refresh/reconnect selama belum timeout.
  _expireRestriction(userId, now);
  const restriction = restrictions.get(userId);
  if (restriction) {
    const wasDisconnected = !restriction.connected;
    restriction.connected = true;
    restriction.disconnectedAt = null;
    restriction.socketId = socketId;
    return { ok: true, restricted: true, state: restrictedState(userId), wasDisconnected, events: [] };
  }
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

/**
 * End the gap between two games: the next game becomes playable and its turn clock starts now.
 * @returns {object|null} the room, or null when there is nothing to release (room gone, set over, or no gap active).
 */
function endIntermission(code) {
  const room = rooms.get(code);
  if (!room?.currentGame || !room.intermission) return null;
  room.intermission = false;
  restartTurnClock(code);
  return room;
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
    players:     room.players.map(p => ({ id: p.id, connected: p.connected, inRoom: p.inRoom !== false })),
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
  createRoom, joinRoom, getRoom, startSet, processPlay, processSkip, processAutoSkip, endIntermission,
  leaveRoom, returnToRoom, restoreView, kickPlayer, getRestriction, clearRestriction, restrictedState, markRestrictedDisconnected, markDisconnected, bindSocket, findRoomByPlayer, resumeSession, sweepExpired,
  restartTurnClock, publicState, RECONNECT_WINDOW_MS,
};
