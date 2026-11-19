'use strict';
/**
 * `[rally-debug]` logging in the real game engine is opt-in (MARTIL_DEBUG).
 *   npm run test:debuglog      (from the backend folder)
 *
 * Covered:
 *   - default (flag unset): Play, Skip, auto-skip, rally end and game over print NOTHING (no console.* at all)
 *   - MARTIL_DEBUG=1 / true (case and spaces ignored): exactly ONE line per accepted Play/Skip, at all three log sites
 *     (processPlay, processSkip that continues the rally, processSkip that ends it), with the unchanged tag and payload
 *   - any other value (empty, 0, false, no, yes, on, 2) keeps logging off
 *   - rejected actions (not your turn, invalid cards) never log, with the flag on
 *   - the flag is read at call time (toggling between calls works without reloading the module)
 *   - game rules are untouched: the same scripted game gives identical states and events with and without the flag
 *   - engine.js contains no stray console.* outside the single helper; .env.example documents the flag as a comment
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { GameEngine } = require('../src/game/engine.js');

const BACKEND = path.join(__dirname, '..');
const IDS = ['A', 'B', 'C', 'D'];

// ── helpers ──────────────────────────────────────────────────────────────────────────────────────────
function setFlag(v) {
  if (v === undefined) delete process.env.MARTIL_DEBUG; else process.env.MARTIL_DEBUG = v;
}
function capture(fn) {
  const calls = [];
  const saved = { log: console.log, info: console.info, warn: console.warn, error: console.error, debug: console.debug };
  for (const k of Object.keys(saved)) console[k] = (...args) => calls.push({ method: k, args });
  try { fn(); } finally { Object.assign(console, saved); }
  return calls;
}
const base = () => GameEngine.initGame(IDS, 1, 'A'); // A starts; hands are random but only used through ids
const firstCard = (state, pid) => [state.hands[pid][0].id];

// A deterministic scripted game covering all three log sites. Returns every result for comparison.
function script() {
  const frozen = Date.now;
  Date.now = () => 1_700_000_000_000; // turnStartedAt would otherwise differ between runs
  try {
    const out = [];
    const b = structuredClone(base());
    const step = (r) => { out.push(r); assert.equal(r.ok, true, JSON.stringify(r)); return r.state; };
    let s = step(GameEngine.processPlay(b, 'A', firstCard(b, 'A')));   // site 1: play (rally continues)
    s = step(GameEngine.processSkip(s, 'B'));                          // site 3: skip, rally continues
    s = step(GameEngine.processSkip(s, 'C'));                          // site 3
    s = step(GameEngine.processSkip(s, 'D'));                          // site 2: last active player left -> rally ends
    s = step(GameEngine.processPlay(s, 'A', firstCard(s, 'A')));       // play after the reset
    s = step(GameEngine.processAutoSkip(s));                           // auto-skip B
    const win = { ...structuredClone(base()) };
    win.hands = { ...win.hands, A: [win.hands.A[0]] };
    step(GameEngine.processPlay(win, 'A', [win.hands.A[0].id]));       // site 1: winning play (game_over)
    return out;
  } finally { Date.now = frozen; }
}

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

// ── default: silent ──────────────────────────────────────────────────────────────────────────────────
test('default (MARTIL_DEBUG tidak diset): Main, Skip, auto-skip, akhir rally, dan game over tidak mencetak apa pun', () => {
  setFlag(undefined);
  const calls = capture(() => script());
  assert.deepEqual(calls, [], `tidak boleh ada output, dapat: ${JSON.stringify(calls)}`);
});

// ── enabled: exactly one line per accepted action, unchanged tag and payload ─────────────────────────
test('MARTIL_DEBUG=1: tepat satu baris per aksi diterima di ketiga titik log (7 aksi → 7 baris)', () => {
  setFlag('1');
  const calls = capture(() => script());
  assert.equal(calls.length, 7);
  assert.ok(calls.every((c) => c.method === 'log' && c.args.length === 2));
  assert.deepEqual(calls.map((c) => c.args[0]), [
    '[rally-debug] processPlay', '[rally-debug] processSkip', '[rally-debug] processSkip', '[rally-debug] processSkip',
    '[rally-debug] processPlay', '[rally-debug] processSkip', '[rally-debug] processPlay',
  ]);
});

test('MARTIL_DEBUG=1: isi payload tidak berubah (field, nilai, dan rallyId) di tiap titik log', () => {
  setFlag('1');
  const p = capture(() => script()).map((c) => c.args[1]);
  for (const payload of p) {
    assert.deepEqual(Object.keys(payload).sort(), ['currentPlayer', 'lastPlayer', 'nextPlayer', 'passedPlayers', 'rallyId']);
  }
  // site 1: first play of a game
  assert.deepEqual(p[0], { currentPlayer: 'A', lastPlayer: null, passedPlayers: [], nextPlayer: 'B', rallyId: 'reset' });
  // site 3: skip while the rally continues
  assert.deepEqual(p[1], { currentPlayer: 'B', lastPlayer: 'A', passedPlayers: ['B'], nextPlayer: 'C', rallyId: '1-A' });
  assert.deepEqual(p[2], { currentPlayer: 'C', lastPlayer: 'A', passedPlayers: ['B', 'C'], nextPlayer: 'D', rallyId: '1-A' });
  // site 2: the last active player left -> rally ends and the last player gets the table back
  assert.deepEqual(p[3], { currentPlayer: 'D', lastPlayer: 'A', passedPlayers: ['B', 'C', 'D'], nextPlayer: 'A', rallyId: '1-A' });
  // after the reset
  assert.equal(p[4].rallyId, 'reset');
  assert.equal(p[4].currentPlayer, 'A');
});

test('flag menyala hanya untuk "1" atau "true" (huruf besar/kecil dan spasi diabaikan)', () => {
  for (const v of ['1', 'true', 'TRUE', 'True', ' 1 ', ' true\t']) {
    setFlag(v);
    const s = base();
    const calls = capture(() => GameEngine.processPlay(s, 'A', firstCard(s, 'A')));
    assert.equal(calls.length, 1, `MARTIL_DEBUG=${JSON.stringify(v)} harus menyala`);
  }
});

test('nilai lain (kosong, 0, false, no, yes, on, 2, spasi) tetap mematikan log', () => {
  for (const v of [undefined, '', '   ', '0', 'false', 'FALSE', 'no', 'yes', 'on', '2', '10', 'enabled']) {
    setFlag(v);
    const s = base();
    const calls = capture(() => GameEngine.processPlay(s, 'A', firstCard(s, 'A')));
    assert.equal(calls.length, 0, `MARTIL_DEBUG=${JSON.stringify(v)} harus mati`);
  }
});

test('flag dibaca saat dipanggil: dinyalakan lalu dimatikan di tengah proses tanpa memuat ulang modul', () => {
  const s = base();
  setFlag('1');
  assert.equal(capture(() => GameEngine.processPlay(s, 'A', firstCard(s, 'A'))).length, 1);
  setFlag('0');
  assert.equal(capture(() => GameEngine.processPlay(s, 'A', firstCard(s, 'A'))).length, 0);
  setFlag('true');
  assert.equal(capture(() => GameEngine.processPlay(s, 'A', firstCard(s, 'A'))).length, 1);
});

test('aksi ditolak tidak pernah mencetak log, walau flag menyala', () => {
  setFlag('1');
  const s = base(); // A's turn
  const calls = capture(() => {
    assert.equal(GameEngine.processSkip(s, 'D').ok, false);                       // NOT_YOUR_TURN
    assert.equal(GameEngine.processPlay(s, 'B', firstCard(s, 'B')).ok, false);   // NOT_YOUR_TURN
    assert.equal(GameEngine.processPlay(s, 'A', []).ok, false);                  // invalid cardIds
    assert.equal(GameEngine.processPlay(s, 'A', ['nope']).ok, false);            // card not in hand
    assert.equal(GameEngine.processSkip({ ...s, phase: 'game_over' }, 'A').ok, false); // game not active
  });
  assert.deepEqual(calls, []);
});

// ── rules untouched ──────────────────────────────────────────────────────────────────────────────────
test('aturan tidak berubah: skrip permainan yang sama menghasilkan state dan event identik dengan dan tanpa flag', () => {
  const baseState = structuredClone(base());
  const run = (flag) => {
    setFlag(flag);
    let result;
    capture(() => {
      const frozen = Date.now; Date.now = () => 1_700_000_000_000;
      try {
        const out = [];
        let s = structuredClone(baseState);
        for (const [kind, pid] of [['play', 'A'], ['skip', 'B'], ['skip', 'C'], ['skip', 'D'], ['play', 'A'], ['auto']]) {
          const r = kind === 'play' ? GameEngine.processPlay(s, pid, firstCard(s, pid))
            : kind === 'skip' ? GameEngine.processSkip(s, pid) : GameEngine.processAutoSkip(s);
          out.push(r); s = r.state;
        }
        result = out;
      } finally { Date.now = frozen; }
    });
    return result;
  };
  const off = run(undefined);
  const on = run('1');
  assert.deepEqual(on, off);
  assert.equal(off.length, 6);
});

// ── static guards ────────────────────────────────────────────────────────────────────────────────────
test('engine.js: tidak ada console.* lain di luar satu helper debug', () => {
  const src = fs.readFileSync(path.join(BACKEND, 'src/game/engine.js'), 'utf8');
  assert.equal((src.match(/console\./g) || []).length, 1);
  assert.match(src, /if \(debugEnabled\(\)\) console\.log\(/);
});

test('.env.example: MARTIL_DEBUG hanya contoh dalam komentar (tidak aktif bila disalin apa adanya)', () => {
  const text = fs.readFileSync(path.join(BACKEND, '.env.example'), 'utf8');
  assert.match(text, /^# MARTIL_DEBUG=1$/m);
  assert.ok(!/^\s*MARTIL_DEBUG\s*=/m.test(text), 'tidak boleh ada baris MARTIL_DEBUG yang aktif');
});

// ── runner ───────────────────────────────────────────────────────────────────────────────────────────
const savedFlag = process.env.MARTIL_DEBUG;
let failed = 0;
for (const t of tests) {
  try { t.fn(); console.log(`  PASS  ${t.name}`); }
  catch (e) { failed += 1; console.log(`  FAIL  ${t.name}\n        ${String(e.stack || e.message).split('\n').slice(0, 6).join('\n        ')}`); }
}
setFlag(savedFlag);
console.log(`\n${tests.length - failed}/${tests.length} lulus`);
process.exit(failed ? 1 : 0);
