'use strict';
/**
 * S6: everything on a clock or fanned out after a game action lives in src/socket/gameFlow.js (turn timer, 5 s gap between
 * games, private game states, periodic sweep); socketHandler.js only decides WHEN to call it. Real gameFlow.js + roomManager.js +
 * socketHandler.js + engine.js with a fake Socket.IO and the real in-memory SQLite (helpers/sim.js).
 *   npm run test:gameflow      (from the backend folder)
 *
 * The behavior of the timers themselves is covered by turn-timer.sim.js, intermission.sim.js and reconnect.sim.js (unchanged).
 * This file adds: WHERE the timers live, the scheduling rules (one timer per room, restart cancels, interval/unref/stop of the
 * sweeper), what a fired turn timer sends, and who receives private states. The clock is captured, never waited for.
 */
const fs = require('node:fs');
const path = require('node:path');
const { assert, rm, setup, newRoom, runTests } = require('./helpers/sim');
const flow = require('../src/socket/gameFlow');
const { TURN_TIMEOUT_MS } = require('../src/constants');

const SRC = path.join(__dirname, '../src');
const read = (rel) => fs.readFileSync(path.join(SRC, rel), 'utf8');
const stripComments = (code) => code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1');
const TIMER_API = /\b(setTimeout|setInterval|clearTimeout|clearInterval)\(/;

/** Capture the 30 s turn timer and every interval; everything else keeps the real (or helper-sped-up) timers. */
async function withClock(fn) {
  const real = { st: global.setTimeout, ct: global.clearTimeout, si: global.setInterval, ci: global.clearInterval };
  const rec = { turn: [], intervals: [], clearedIntervals: [] };
  global.setTimeout = (cb, ms, ...a) => {
    if (ms !== TURN_TIMEOUT_MS) return real.st(cb, ms, ...a);
    const h = { cb, ms, fired: false, cleared: false, unref() {} };
    rec.turn.push(h); return h;
  };
  global.clearTimeout = (h) => { if (h && typeof h === 'object' && 'cb' in h) h.cleared = true; else real.ct(h); };
  global.setInterval = (cb, ms) => { const h = { cb, ms, unrefCalled: false, unref() { this.unrefCalled = true; } }; rec.intervals.push(h); return h; };
  global.clearInterval = (h) => { rec.clearedIntervals.push(h); };
  const pending = () => rec.turn.filter((h) => !h.cleared && !h.fired);
  const fire = (h) => { h.fired = true; h.cb(); };
  try { return await fn({ rec, pending, fire }); }
  finally { global.setTimeout = real.st; global.clearTimeout = real.ct; global.setInterval = real.si; global.clearInterval = real.ci; }
}

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

// ── where the clock lives ────────────────────────────────────────────────────────────────────────────
test('lokasi: socketHandler.js tidak memakai timer sama sekali; gameFlow.js yang memakainya', () => {
  const sh = stripComments(read('socket/socketHandler.js'));
  assert.doesNotMatch(sh, TIMER_API, 'socketHandler.js tidak boleh memanggil setTimeout/setInterval/clearTimeout/clearInterval');
  assert.doesNotMatch(sh, /new Map\(/, 'tabel timer ada di gameFlow.js');
  const gf = stripComments(read('socket/gameFlow.js'));
  for (const api of ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval']) assert.ok(gf.includes(`${api}(`), `gameFlow.js harus memakai ${api}`);
});

test('pemeriksa lokasi: pemanggilan timer di kode terdeteksi, di komentar tidak', () => {
  assert.match(stripComments('setTimeout(() => {}, 1)'), TIMER_API);
  assert.doesNotMatch(stripComments('// setTimeout(x)\n/* clearInterval(y) */\nconst a = 1'), TIMER_API);
});

test('ekspor gameFlow dan nilai tetapnya (jeda 5000 ms dipercepat tepat oleh helpers/sim.js)', () => {
  for (const name of ['startTimer', 'clearTimer', 'pendingTimerCount', 'handleGameOver', 'emitPrivateStates', 'broadcastRoomEvents', 'sweep', 'startSweeper']) {
    assert.equal(typeof flow[name], 'function', name);
  }
  assert.equal(flow.INTERMISSION_MS, 5000);
  assert.equal(flow.SWEEP_INTERVAL_MS, 10_000);
});

// ── turn timer scheduling ────────────────────────────────────────────────────────────────────────────
test('startTimer: satu timer TURN_TIMEOUT_MS per room; memulai ulang membatalkan yang lama', async () => {
  const { io } = setup(); const r = newRoom(io, 4, { start: true });
  await withClock(async ({ rec, pending }) => {
    flow.startTimer(io, r.code);
    assert.equal(pending().length, 1); assert.equal(pending()[0].ms, TURN_TIMEOUT_MS);
    flow.startTimer(io, r.code);
    assert.equal(pending().length, 1); assert.equal(rec.turn.length, 2); assert.equal(rec.turn[0].cleared, true);
    flow.clearTimer(r.code);
  });
});

test('clearTimer: membatalkan timer room itu saja; kode tak dikenal tidak error', async () => {
  const { io } = setup(); const a = newRoom(io, 4, { start: true }); const b = newRoom(io, 4, { start: true });
  await withClock(async ({ pending }) => {
    flow.startTimer(io, a.code); flow.startTimer(io, b.code);
    assert.equal(pending().length, 2);
    flow.clearTimer(a.code);
    assert.equal(pending().length, 1);
    flow.clearTimer('NOPE00'); flow.clearTimer(a.code);
    assert.equal(pending().length, 1);
    flow.clearTimer(b.code);
    assert.equal(pending().length, 0);
  });
});

test('tabel timer: satu entri per room; dibatalkan = hilang dari tabel; memulai ulang tidak menambah', async () => {
  const { io } = setup(); const r = newRoom(io, 4, { start: true });
  await withClock(async () => {
    const before = flow.pendingTimerCount();           // this room already has the timer started with its game
    flow.clearTimer(r.code);
    assert.equal(flow.pendingTimerCount(), before - 1);
    flow.clearTimer(r.code);                           // second time: nothing to clear
    assert.equal(flow.pendingTimerCount(), before - 1);
    flow.startTimer(io, r.code);
    assert.equal(flow.pendingTimerCount(), before);
    flow.startTimer(io, r.code);                       // a restart replaces the entry
    assert.equal(flow.pendingTimerCount(), before);
    flow.clearTimer(r.code);
  });
});

test('startTimer: tidak ada timer untuk Room yang belum bermain atau tidak ada', async () => {
  const { io } = setup(); const r = newRoom(io, 4);
  await withClock(async ({ pending }) => {
    flow.startTimer(io, r.code); flow.startTimer(io, 'NOPE00');
    assert.equal(pending().length, 0);
  });
});

test('timer habis: auto-skip pemain yang sedang giliran, kirim auto_skipped + turn_changed + game_state, lalu pasang timer baru', async () => {
  const { io } = setup(); const r = newRoom(io, 4, { start: true });
  await withClock(async ({ pending, fire }) => {
    const skipped = rm.getRoom(r.code).currentGame.currentTurn;
    r.clients.forEach((c) => c.clear());
    flow.startTimer(io, r.code);
    fire(pending()[0]);
    const next = rm.getRoom(r.code).currentGame.currentTurn;
    assert.notEqual(next, skipped);
    for (const c of r.clients) {
      assert.deepEqual(c.last('auto_skipped'), { playerId: skipped });
      assert.deepEqual(c.last('turn_changed'), { currentTurn: next });
      assert.ok(c.all('game_state').length >= 1, 'setiap pemain menerima state privatnya');
    }
    assert.equal(pending().length, 1, 'timer giliran berikutnya terpasang');
    flow.clearTimer(r.code);
  });
});

// ── sweeper ──────────────────────────────────────────────────────────────────────────────────────────
test('startSweeper: interval dipasang, di-unref, memanggil sweep; stop membatalkannya', async () => {
  await withClock(async ({ rec }) => {
    const calls = []; const orig = rm.sweepExpired;
    rm.sweepExpired = (now) => { calls.push(now); return []; };
    try {
      const s = flow.startSweeper({ to() { throw new Error('tidak boleh broadcast'); } }, 250);
      assert.equal(rec.intervals.length, 1); assert.equal(rec.intervals[0].ms, 250); assert.equal(rec.intervals[0].unrefCalled, true);
      rec.intervals[0].cb();
      assert.equal(calls.length, 1);
      s.stop();
      assert.deepEqual(rec.clearedIntervals, [rec.intervals[0]]);
    } finally { rm.sweepExpired = orig; }
  });
});

test('startSweeper: interval 0 = tanpa timer; undefined/null = bawaan 10 detik; stop tanpa timer tidak error', async () => {
  await withClock(async ({ rec }) => {
    const none = flow.startSweeper({}, 0); none.stop();
    assert.equal(rec.intervals.length, 0); assert.equal(rec.clearedIntervals.length, 0);
    flow.startSweeper({}, undefined).stop(); flow.startSweeper({}, null).stop();
    assert.deepEqual(rec.intervals.map((i) => i.ms), [10_000, 10_000]);
    assert.equal(rec.clearedIntervals.length, 2);
  });
});

test('sweeper.sweep(now): meneruskan now ke roomManager, default Date.now(), dan hanya broadcast bila ada event', () => {
  const orig = rm.sweepExpired; const seen = []; let broadcasts = 0;
  const io = { to() { broadcasts += 1; return { emit() {} }; } };
  rm.sweepExpired = (now) => { seen.push(now); return []; };
  try {
    const s = flow.startSweeper(io, 0);
    assert.deepEqual(s.sweep(12345), []);
    const before = Date.now(); s.sweep(); const after = Date.now();
    assert.equal(seen[0], 12345); assert.ok(seen[1] >= before && seen[1] <= after);
    assert.equal(broadcasts, 0);
  } finally { rm.sweepExpired = orig; }
});

// ── private states ───────────────────────────────────────────────────────────────────────────────────
test('emitPrivateStates: hanya pemain di Room itu yang menerima game_state; Room tanpa game tidak mengirim apa pun', () => {
  const { io } = setup(); const r = newRoom(io, 4, { start: true });
  const outsider = io.connect('outsider-1');
  [...r.clients, outsider].forEach((c) => c.clear());
  flow.emitPrivateStates(io, r.code, rm.getRoom(r.code));
  for (const c of r.clients) assert.equal(c.all('game_state').length, 1);
  assert.equal(outsider.all('game_state').length, 0);

  const w = newRoom(io, 4);
  w.clients.forEach((c) => c.clear());
  flow.emitPrivateStates(io, w.code, rm.getRoom(w.code));
  for (const c of w.clients) assert.equal(c.all('game_state').length, 0);
});

runTests(tests);
