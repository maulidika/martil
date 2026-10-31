'use strict';
/**
 * Simulasi multiplayer untuk sistem reconnect — menjalankan socketHandler.js,
 * roomManager.js, dan engine.js ASLI dengan Socket.IO tiruan di memori.
 *
 *   npm run test:sim      (dari folder backend)
 *
 * Yang di-stub: JWT (token = JSON), database (no-op), uuid (crypto.randomUUID).
 * Waktu disimulasikan dengan menggeser Date.now(), jadi tidak perlu menunggu 60 detik.
 * Skrip ini TIDAK menguji transport WebSocket asli maupun React — untuk itu gunakan
 * uji manual 4 tab (lihat README).
 */

const assert = require('node:assert/strict');
const Module = require('module');
const path = require('path');
const crypto = require('crypto');

// ── Stub dependensi eksternal sebelum memuat kode server ─────────────────────
const SRC = path.join(__dirname, '../src');
function stub(rel, exports) {
  const file = require.resolve(path.join(SRC, rel));
  require.cache[file] = { id: file, filename: file, loaded: true, exports };
}
stub('auth/jwt.js', { verifyToken: (t) => JSON.parse(t), signToken: () => '' });
stub('db/database.js', { db: () => ({ prepare: () => ({ run() {}, get() {}, all() { return []; } }), exec() {} }) });
const origLoad = Module._load;
Module._load = function (request, ...rest) {
  if (request === 'uuid') return { v4: () => crypto.randomUUID() };
  return origLoad.call(this, request, ...rest);
};

// ── Jam simulasi ─────────────────────────────────────────────────────────────
const realNow = Date.now.bind(Date);
let offsetMs = 0;
Date.now = () => realNow() + offsetMs;
const advance = (ms) => { offsetMs += ms; };

const rm = require(path.join(SRC, 'rooms/roomManager.js'));
const registerSocketHandlers = require(path.join(SRC, 'socket/socketHandler.js'));

// Kurangi noise log server selama simulasi
const realInfo = console.info;
const realLog = console.log;
console.info = () => {};
console.log = () => {};

// ── Socket.IO tiruan ─────────────────────────────────────────────────────────
class FakeSocket {
  constructor(io, id) {
    this.io = io; this.id = id; this.rooms = new Set([id]);
    this.handlers = {}; this.inbox = []; this.handshake = { auth: {} };
  }
  on(ev, fn) { this.handlers[ev] = fn; }
  emit(ev, data) { this.inbox.push({ ev, data }); }
  join(room) { this.rooms.add(room); }
  leave(room) { this.rooms.delete(room); }
  to(room) { return { emit: (ev, data) => this.io._deliver(room, ev, data, this.id) }; }
}
class FakeIO {
  constructor() { this.sockets = { sockets: new Map() }; this._mw = null; this._conn = null; this._n = 0; }
  use(fn) { this._mw = fn; }
  on(ev, fn) { if (ev === 'connection') this._conn = fn; }
  to(room) { return { emit: (ev, data) => this._deliver(room, ev, data, null) }; }
  _deliver(room, ev, data, exceptId) {
    for (const [, s] of this.sockets.sockets) if (s.rooms.has(room) && s.id !== exceptId) s.emit(ev, data);
  }
  connect(userId) {
    const s = new FakeSocket(this, `sock-${++this._n}`);
    s.handshake.auth.token = JSON.stringify({ id: userId, username: userId });
    let err = null;
    this._mw(s, (e) => { err = e; });
    assert.equal(err, undefined, 'middleware menolak');
    this.sockets.sockets.set(s.id, s);
    this._conn(s);
    return new Client(this, s, userId);
  }
}
class Client {
  constructor(io, socket, userId) { this.io = io; this.socket = socket; this.userId = userId; }
  emit(ev, data) { this.socket.handlers[ev]?.(data); }
  all(ev) { return this.socket.inbox.filter(m => m.ev === ev).map(m => m.data); }
  last(ev) { const a = this.all(ev); return a[a.length - 1]; }
  clear() { this.socket.inbox.length = 0; }
  disconnect(reason = 'transport close') {
    this.socket.handlers.disconnecting?.(reason);
    this.socket.rooms.clear();
    this.io.sockets.sockets.delete(this.socket.id);
  }
}

// ── Helper skenario ──────────────────────────────────────────────────────────
let seq = 0;
function setup() {
  const io = new FakeIO();
  const handle = registerSocketHandlers(io, { sweepIntervalMs: 0 });
  return { io, handle };
}
const uid = (p) => `${p}${++seq}`;
function newRoom(io, n, { start = false } = {}) {
  const users = Array.from({ length: n }, (_, i) => uid(`u${i + 1}_`));
  const clients = users.map(u => io.connect(u));
  clients[0].emit('create_room', { maxGames: 4 });
  const code = clients[0].last('room_created').code;
  for (let i = 1; i < n; i++) clients[i].emit('join_room', { roomCode: code });
  if (start) clients[0].emit('start_game', { roomCode: code });
  return { users, clients, code };
}
const player = (code, id) => rm.getRoom(code).players.find(p => p.id === id);
const handIds = (restoredOrState) => (restoredOrState.game?.myHand || []).map(c => c.id);

// ── Daftar uji ───────────────────────────────────────────────────────────────
const tests = [];
const test = (name, fn) => tests.push({ name, fn });

test('sanity: 4 pemain masuk, game mulai, semua menerima 13 kartu', () => {
  const { io } = setup();
  const { clients, code } = newRoom(io, 4, { start: true });
  for (const c of clients) {
    assert.equal(c.last('game_state').game.myHand.length, 13);
    assert.equal(c.last('game_started').gameNumber, 1);
  }
  assert.equal(rm.getRoom(code).status, 'playing');
});

test('resume tanpa room → session_none NO_ROOM', () => {
  const { io } = setup();
  const c = io.connect(uid('solo_'));
  c.emit('resume_session');
  assert.equal(c.last('session_none').reason, 'NO_ROOM');
});

test('refresh saat game: kartu, giliran, meja, dan timer dipulihkan; pemain lain tidak terganggu', () => {
  const { io } = setup();
  const { users, clients, code } = newRoom(io, 4, { start: true });
  const turnId = clients[0].last('game_started').currentTurn;
  const turnIdx = users.indexOf(turnId);
  // pemain yang sedang giliran memainkan 1 kartu agar ada state meja
  const first = clients[turnIdx];
  const card = first.last('game_state').game.myHand[0];
  first.emit('play_cards', { roomCode: code, cardIds: [card.id] });
  const room = rm.getRoom(code);
  const expectedTurn = room.currentGame.currentTurn;

  const bIdx = (turnIdx + 2) % 4;                       // pemain lain yang akan refresh
  const b1 = clients[bIdx];
  const handBefore = b1.last('game_state').game.myHand.map(c => c.id);
  const othersBefore = clients.filter((_, i) => i !== bIdx).map(c => c.socket.inbox.length);

  b1.disconnect();                                       // tab di-refresh
  assert.equal(player(code, users[bIdx]).connected, false);
  for (const [i, c] of clients.entries()) if (i !== bIdx) assert.equal(c.last('player_disconnected').playerId, users[bIdx]);

  advance(10_000);                                       // 10 detik berlalu saat reload
  const b2 = io.connect(users[bIdx]);
  b2.emit('resume_session');

  const restored = b2.last('session_restored');
  assert.ok(restored, 'session_restored tidak dikirim');
  assert.equal(restored.status, 'playing');
  assert.equal(restored.code, code);
  assert.deepEqual(handIds(restored), handBefore, 'kartu berubah/teracak');
  assert.equal(restored.game.currentTurn, expectedTurn);
  assert.equal(restored.game.table.length, 1);
  assert.ok(restored.game.timeLeft > 19_000 && restored.game.timeLeft <= 20_000, `timeLeft=${restored.game.timeLeft}`);
  assert.equal(player(code, users[bIdx]).connected, true);
  assert.equal(b2.all('game_started').length, 0, 'tidak boleh memulai game baru');
  assert.equal(rm.getRoom(code).currentGame.gameNumber, 1);
  for (const [i, c] of clients.entries()) if (i !== bIdx) assert.equal(c.last('player_reconnected').playerId, users[bIdx]);
  // pemain lain tidak menerima game_state/game_started tambahan akibat resume
  const others = clients.filter((_, i) => i !== bIdx);
  others.forEach((c, i) => {
    const extra = c.socket.inbox.slice(othersBefore[i]).filter(m => ['game_state', 'game_started', 'room_updated'].includes(m.ev));
    assert.equal(extra.length, 0, `pemain lain menerima ${extra.map(m => m.ev)}`);
  });
});

test('race: socket baru resume SEBELUM socket lama putus → pemain tidak ditandai terputus', () => {
  const { io } = setup();
  const { users, clients, code } = newRoom(io, 4, { start: true });
  const old = clients[1];
  const fresh = io.connect(users[1]);
  fresh.emit('resume_session');
  assert.equal(old.last('session_replaced').roomCode, code);
  old.disconnect('ping timeout');                        // baru terdeteksi putus belakangan
  assert.equal(player(code, users[1]).connected, true, 'pemain salah ditandai terputus');
  assert.equal(clients[2].all('player_disconnected').length, 0);
  assert.ok(fresh.socket.rooms.has(code));
});

test('markDisconnected mengabaikan socket lama yang bukan socket aktif (pertahanan berlapis)', () => {
  const { io } = setup();
  const { users, clients, code } = newRoom(io, 2);
  const oldId = clients[1].socket.id;
  const fresh = io.connect(users[1]);
  fresh.emit('resume_session');                          // socket aktif sekarang = fresh
  assert.equal(rm.markDisconnected(code, users[1], oldId), false);
  assert.equal(player(code, users[1]).connected, true);
  assert.equal(rm.markDisconnected(code, users[1], fresh.socket.id), true);
});

test('resume dua kali bersifat idempoten (tidak duplikasi room/anggota)', () => {
  const { io } = setup();
  const { users, clients, code } = newRoom(io, 4, { start: true });
  clients[3].disconnect();
  const c = io.connect(users[3]);
  c.emit('resume_session');
  c.emit('resume_session');
  assert.equal(c.all('session_restored').length, 2);
  assert.equal(rm.getRoom(code).players.filter(p => p.id === users[3]).length, 1);
  assert.equal(rm.findRoomByPlayer(users[3]).code, code);
  assert.equal(clients[0].all('player_reconnected').length, 1, 'player_reconnected terkirim dobel');
});

test('socket belum di-resume tidak boleh bermain (NOT_IN_ROOM) dan tidak mengubah giliran', () => {
  const { io } = setup();
  const { users, clients, code } = newRoom(io, 4, { start: true });
  const turnId = clients[0].last('game_started').currentTurn;
  const idx = users.indexOf(turnId);
  clients[idx].disconnect();
  const stale = io.connect(turnId);                      // tersambung tapi belum resume
  stale.emit('skip_turn', { roomCode: code });
  stale.emit('play_cards', { roomCode: code, cardIds: ['x'] });
  assert.deepEqual(stale.all('error').map(e => e.code), ['NOT_IN_ROOM', 'NOT_IN_ROOM']);
  assert.equal(rm.getRoom(code).currentGame.currentTurn, turnId);
  stale.emit('resume_session');
  stale.emit('skip_turn', { roomCode: code });           // sekarang sah
  assert.notEqual(rm.getRoom(code).currentGame.currentTurn, turnId);
});

test('tab ganda satu akun: tab terakhir mengambil alih, tab lama dilepas', () => {
  const { io } = setup();
  const { users, clients, code } = newRoom(io, 4, { start: true });
  const second = io.connect(users[0]);
  second.emit('resume_session');
  assert.equal(clients[0].last('session_replaced').roomCode, code);
  clients[0].emit('skip_turn', { roomCode: code });
  assert.equal(clients[0].last('error').code, 'NOT_IN_ROOM');
});

test('host refresh di Room (waiting) dalam batas waktu → tetap host', () => {
  const { io, handle } = setup();
  const { users, clients, code } = newRoom(io, 3);
  clients[0].disconnect();
  advance(30_000);
  handle.sweep();
  assert.equal(rm.getRoom(code).hostId, users[0]);
  const h = io.connect(users[0]);
  h.emit('resume_session');
  const r = h.last('session_restored');
  assert.equal(r.status, 'waiting');
  assert.equal(r.hostId, users[0]);
  assert.equal(r.players.length, 3);
  assert.equal(r.game, null);
});

test('pemain waiting terputus > 60 dtk dikeluarkan; host berpindah; resume → EXPIRED lalu NO_ROOM', () => {
  const { io, handle } = setup();
  const { users, clients, code } = newRoom(io, 3);
  clients[0].disconnect();                               // host putus
  advance(61_000);
  handle.sweep();
  const room = rm.getRoom(code);
  assert.equal(room.players.length, 2);
  assert.notEqual(room.hostId, users[0]);
  assert.ok(room.players.some(p => p.id === room.hostId && p.connected));
  const upd = clients[1].last('room_updated');
  assert.equal(upd.players.length, 2);
  assert.equal(upd.hostId, room.hostId);

  const back = io.connect(users[0]);
  back.emit('resume_session');
  assert.equal(back.last('session_none').reason, 'EXPIRED');
  back.emit('resume_session');
  assert.equal(back.all('session_none').pop().reason, 'NO_ROOM');
});

test('room waiting kosong dihapus setelah semua pemain kadaluarsa', () => {
  const { io, handle } = setup();
  const { clients, code } = newRoom(io, 2);
  clients.forEach(c => c.disconnect());
  advance(61_000);
  handle.sweep();
  assert.equal(rm.getRoom(code), null);
});

test('game berjalan: pemain terputus lama tetap punya kursi dan bisa kembali', () => {
  const { io, handle } = setup();
  const { users, clients, code } = newRoom(io, 4, { start: true });
  clients[2].disconnect();
  advance(5 * 60_000);
  handle.sweep();
  assert.equal(rm.getRoom(code).players.length, 4);
  const c = io.connect(users[2]);
  c.emit('resume_session');
  assert.equal(c.last('session_restored').status, 'playing');
  assert.equal(c.last('session_restored').game.myHand.length, 13);
});

test('host terputus lama saat game berjalan → host berpindah ke pemain terhubung, kursi tetap', () => {
  const { io, handle } = setup();
  const { users, clients, code } = newRoom(io, 4, { start: true });
  clients[0].disconnect();
  advance(61_000);
  handle.sweep();
  const room = rm.getRoom(code);
  assert.equal(room.players.length, 4);
  assert.notEqual(room.hostId, users[0]);
  // pemain lain menerima game_state personal (bukan room_updated yang membocorkan kartu)
  assert.ok(clients[1].last('game_state'));
  assert.equal(clients[1].all('room_updated').filter(r => r.game).length, 0);
});

test('Scoreboard: refresh saat status done memulihkan hasil set', () => {
  const { io } = setup();
  const { users, clients, code } = newRoom(io, 4, { start: true });
  const room = rm.getRoom(code);
  room.status = 'done'; room.currentGame = null;         // simulasi set selesai (white-box)
  room.setResult = { rankings: [{ id: users[0], totalScore: -5 }], setScores: { [users[0]]: -5 } };
  clients[1].disconnect();
  const c = io.connect(users[1]);
  c.emit('resume_session');
  const r = c.last('session_restored');
  assert.equal(r.status, 'done');
  assert.equal(r.game, null);
  assert.deepEqual(r.setResult.rankings[0].id, users[0]);
});

test('room ditinggalkan semua pemain > 10 menit ditutup & timer dibersihkan; resume → ROOM_CLOSED', () => {
  const { io, handle } = setup();
  const { users, clients, code } = newRoom(io, 4, { start: true });
  clients.forEach(c => c.disconnect());
  advance(9 * 60_000);
  handle.sweep();
  assert.ok(rm.getRoom(code), 'ditutup terlalu cepat');
  advance(2 * 60_000);
  handle.sweep();
  assert.equal(rm.getRoom(code), null);
  const c = io.connect(users[0]);
  c.emit('resume_session');
  assert.equal(c.last('session_none').reason, 'ROOM_CLOSED');
});

test('join_room oleh anggota yang sudah ada diperlakukan sebagai resume (bukan ALREADY_IN_ROOM)', () => {
  const { io } = setup();
  const { users, clients, code } = newRoom(io, 2);
  clients[1].disconnect();
  const c = io.connect(users[1]);
  c.emit('join_room', { roomCode: code });
  assert.equal(c.last('session_restored').code, code);
  assert.equal(c.all('error').length, 0);
});

// ── Runner ───────────────────────────────────────────────────────────────────
let failed = 0;
for (const { name, fn } of tests) {
  offsetMs = 0;
  try { fn(); realLog(`  PASS  ${name}`); }
  catch (e) { failed += 1; realLog(`  FAIL  ${name}\n        ${e.message.split('\n').join('\n        ')}`); }
}
console.info = realInfo;
realLog(`\n${tests.length - failed}/${tests.length} lulus`);
process.exit(failed ? 1 : 0);
