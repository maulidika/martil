'use strict';
/**
 * Helper bersama untuk simulasi multiplayer (Socket.IO tiruan di memori).
 * Menjalankan socketHandler.js, roomManager.js, dan engine.js ASLI.
 * Di-stub: JWT (token = JSON), database (no-op), uuid (crypto.randomUUID).
 * Waktu disimulasikan dengan menggeser Date.now(); jeda 5 detik antar-game dipercepat.
 */
const assert = require('node:assert/strict');
const Module = require('module');
const path = require('path');
const crypto = require('crypto');

// ── Stub dependensi eksternal sebelum memuat kode server ─────────────────────
const SRC = path.join(__dirname, '../../src');
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
  connect(userId, username = userId, extraClaims = {}) {
    const s = new FakeSocket(this, `sock-${++this._n}`);
    s.handshake.auth.token = JSON.stringify({ id: userId, username, ...extraClaims });
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


// Jeda 5 dtk antar-game (handleGameOver) dipercepat; timer lain tetap asli.
const realSetTimeout = global.setTimeout;
global.setTimeout = (fn, ms, ...a) => (ms === 5000 ? setImmediate(fn, ...a) : realSetTimeout(fn, ms, ...a));
const tick = () => new Promise(r => setImmediate(r));

/** Mainkan satu set sampai selesai dengan bot sederhana (hanya single: mainkan kartu terkecil yang menang, kalau tidak bisa skip). */
async function playSetToEnd(clients, users, code, { maxSteps = 4000 } = {}) {
  const { compareCards } = require(path.join(SRC, 'game/deck.js'));
  const byId = Object.fromEntries(users.map((u, i) => [u, clients[i]]));
  for (let step = 0; step < maxSteps; step++) {
    const room = rm.getRoom(code);
    if (!room || room.status !== 'playing') return step;
    const g = room.currentGame;
    const me = g.currentTurn;
    const hand = g.hands[me];
    const top = g.table.length ? g.table[g.table.length - 1].combo : null;
    const card = top ? hand.find(c => compareCards(c, top.cards[0]) > 0) : hand[0];
    const n = g.gameNumber;
    if (card) byId[me].emit('play_cards', { roomCode: code, cardIds: [card.id] });
    else byId[me].emit('skip_turn', { roomCode: code });
    if (rm.getRoom(code)?.currentGame?.gameNumber !== n) await tick();   // game baru dimulai
  }
  throw new Error('playSetToEnd: set tidak selesai');
}

async function runTests(tests) {
  let failed = 0;
  for (const { name, fn } of tests) {
    resetClock();
    try { await fn(); realLog(`  PASS  ${name}`); }
    catch (e) { failed += 1; realLog(`  FAIL  ${name}\n        ${String(e.stack || e.message).split('\n').slice(0, 6).join('\n        ')}`); }
  }
  console.info = realInfo;
  realLog(`\n${tests.length - failed}/${tests.length} lulus`);
  process.exit(failed ? 1 : 0);
}
const resetClock = () => { offsetMs = 0; };

module.exports = {
  assert, rm, FakeIO, Client, setup, newRoom, uid, player, handIds,
  advance, resetClock, playSetToEnd, runTests, tick, realLog,
};
