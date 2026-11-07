'use strict';
/**
 * H5 — `maxGames` (games per set) is validated by the server (real socketHandler.js + roomManager.js, fake Socket.IO).
 *   npm run test:maxgames      (from the backend folder)
 *
 * Decision: a Room can only be created with 3, 4 or 5 games per set (default 4).
 * Before the fix the server accepted anything: 0, -3, 1000, "abc", NaN... and a NaN / string value made
 * `nextNum > room.maxGames` always false, so the set never ended.
 *
 * Covered:
 *   - 3, 4, 5 are accepted and stored as numbers; a missing value means 4
 *   - everything else (including 1, 2, 6, numeric strings, floats, NaN, null, arrays, objects) → INVALID_MAX_GAMES,
 *     and no Room is created
 *   - a rejected request changes no state (a KICKED removal record survives it)
 *   - sets of 3, 4 and 5 games really end after exactly that many games
 */
const path = require('path');
const { TURN_TIMEOUT_MS } = require(path.join('..', 'src', 'game', 'engine.js'));
const { assert, rm, setup, uid, runTests } = require('./helpers/sim');

// Installed AFTER the helper (whose wrapper turns the 5 s gap into setImmediate): this layer decides when the gap ends.
const gapCallbacks = [];
const prevSetTimeout = global.setTimeout;
const prevClearTimeout = global.clearTimeout;
global.setTimeout = (fn, ms, ...a) => {
  if (ms === 5000) { const t = { fn, fake: true }; gapCallbacks.push(t); return t; }
  if (ms === TURN_TIMEOUT_MS) return { fn, fake: true };           // turn timers are irrelevant here
  return prevSetTimeout(fn, ms, ...a);
};
global.clearTimeout = (h) => (h && typeof h === 'object' && h.fake ? undefined : prevClearTimeout(h));
const endGap = () => { const t = gapCallbacks.shift(); assert.ok(t, 'tidak ada jeda yang menunggu'); t.fn(); };

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

const BAD_VALUES = [0, 1, 2, 6, 7, -3, 1000, 3.5, 4.0000001, NaN, Infinity, -Infinity, null, '4', '3', 'abc', '', [], [4], {}, { valueOf: () => 4 }, true, false];
const label = (v) => (Number.isNaN(v) ? 'NaN' : v === Infinity ? 'Infinity' : v === -Infinity ? '-Infinity' : JSON.stringify(v));
const errCodes = (c) => c.all('error').map(m => m.code);

// ── Accepted values ──────────────────────────────────────────────────────────

test('3, 4, 5 diterima dan disimpan sebagai number', () => {
  const { io } = setup();
  for (const n of [3, 4, 5]) {
    const c = io.connect(uid('h_'));
    c.emit('create_room', { maxGames: n });
    const code = c.last('room_created')?.code;
    assert.ok(code, `maxGames=${n} harus membuat room`);
    assert.strictEqual(rm.getRoom(code).maxGames, n);
    assert.equal(c.all('error').length, 0);
  }
});

test('tanpa maxGames (undefined, {}, tanpa payload) → default 4', () => {
  const { io } = setup();
  for (const payload of [{ maxGames: undefined }, {}, undefined, null]) {
    const c = io.connect(uid('h_'));
    c.emit('create_room', payload);
    assert.strictEqual(rm.getRoom(c.last('room_created').code).maxGames, 4, label(payload));
  }
});

test('konstanta yang diekspor: ALLOWED_MAX_GAMES = [3,4,5], DEFAULT_MAX_GAMES = 4', () => {
  assert.deepEqual([...rm.ALLOWED_MAX_GAMES], [3, 4, 5]);
  assert.equal(rm.DEFAULT_MAX_GAMES, 4);
  assert.ok(Object.isFrozen(rm.ALLOWED_MAX_GAMES), 'daftar tidak boleh bisa diubah dari luar');
});

// ── Rejected values ──────────────────────────────────────────────────────────

test('nilai selain 3/4/5 ditolak INVALID_MAX_GAMES dan tidak membuat Room', () => {
  const { io } = setup();
  for (const bad of BAD_VALUES) {
    const c = io.connect(uid('h_'));
    assert.doesNotThrow(() => c.emit('create_room', { maxGames: bad }), label(bad));
    assert.deepEqual(errCodes(c), ['INVALID_MAX_GAMES'], `maxGames=${label(bad)}`);
    assert.equal(c.last('room_created'), undefined, `room dibuat untuk ${label(bad)}`);
    assert.equal(c.last('room_updated'), undefined);
    c.clear(); c.emit('resume_session');
    assert.equal(c.last('session_none')?.reason, 'NO_ROOM', `pemain masuk room setelah ${label(bad)}`);
  }
});

test('permintaan yang ditolak tidak mengubah state: catatan KICKED tetap ada', () => {
  const { io } = setup();
  const users = Array.from({ length: 4 }, () => uid('k_'));
  const cl = users.map(u => io.connect(u));
  cl[0].emit('create_room', { maxGames: 4 });
  const code = cl[0].last('room_created').code;
  for (let i = 1; i < 4; i++) cl[i].emit('join_room', { roomCode: code });
  cl[0].emit('kick_player', { roomCode: code, targetId: users[3] });
  assert.ok(cl[3].last('kicked'), 'pemain harus ter-kick dari Room');

  cl[3].clear(); cl[3].emit('create_room', { maxGames: 6 });
  assert.deepEqual(errCodes(cl[3]), ['INVALID_MAX_GAMES']);
  cl[3].clear(); cl[3].emit('resume_session');
  assert.equal(cl[3].last('session_none')?.reason, 'KICKED', 'catatan KICKED tidak boleh terhapus oleh permintaan yang ditolak');

  cl[3].clear(); cl[3].emit('create_room', { maxGames: 5 });           // a valid request clears it, as before
  assert.ok(cl[3].last('room_created'));
});

test('pemain yang sudah punya Room tidak kehilangan apa pun saat create_room ditolak', () => {
  const { io } = setup();
  const c = io.connect(uid('h_'));
  c.emit('create_room', { maxGames: 4 });
  const code = c.last('room_created').code;
  c.clear(); c.emit('create_room', { maxGames: 9 });
  assert.deepEqual(errCodes(c), ['INVALID_MAX_GAMES']);
  assert.equal(rm.getRoom(code).players.length, 1);
  assert.equal(rm.getRoom(code).maxGames, 4);
});

// ── Sets really end after maxGames games ─────────────────────────────────────

function startSetOf(n) {
  gapCallbacks.length = 0;
  const { io } = setup();
  const users = Array.from({ length: 4 }, () => uid('s_'));
  const clients = users.map(u => io.connect(u));
  clients[0].emit('create_room', { maxGames: n });
  const code = clients[0].last('room_created').code;
  for (let i = 1; i < 4; i++) clients[i].emit('join_room', { roomCode: code });
  clients[0].emit('start_game', { roomCode: code });
  const game = () => rm.getRoom(code).currentGame;
  const finishGame = () => {
    const turn = game().currentTurn;
    game().hands[turn] = [game().hands[turn][0]];
    clients[users.indexOf(turn)].emit('play_cards', { roomCode: code, cardIds: [game().hands[turn][0].id] });
  };
  return { clients, code, finishGame };
}

for (const n of [3, 4, 5]) {
  test(`set ${n} game: selesai tepat setelah game ke-${n} (set_over, riwayat ${n} game, tanpa game ke-${n + 1})`, () => {
    const { clients, code, finishGame } = startSetOf(n);
    for (let i = 1; i < n; i++) {
      finishGame();
      assert.equal(rm.getRoom(code).status, 'playing', `set tidak boleh selesai setelah game ${i}`);
      assert.equal(clients[0].all('set_over').length, 0);
      endGap();
      assert.equal(rm.getRoom(code).currentGame.gameNumber, i + 1);
    }
    finishGame();                                                   // game ke-n
    assert.equal(rm.getRoom(code).status, 'done');
    assert.equal(rm.getRoom(code).currentGame, null);
    for (const c of clients) {
      assert.equal(c.all('set_over').length, 1);
      assert.equal(c.last('set_over').gameHistory.length, n);
    }
    assert.equal(gapCallbacks.length, 0, 'tidak boleh ada jeda setelah game terakhir');
  });
}

runTests(tests);
