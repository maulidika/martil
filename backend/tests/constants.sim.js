'use strict';
/**
 * S3: Game/Room constants (backend/src/constants.js) are the ONE definition on the backend, and the frontend literals that
 * repeat them cannot drift silently.
 *   npm run test:constants      (from the backend folder)
 *
 * Covered:
 *   - the values themselves (a deliberate change must update this test), frozen, and the same objects are what engine and
 *     roomManager export (no second copy)
 *   - WIRING: the real server code is started in child processes with DIFFERENT constants (5 players, 8-char codes,
 *     games-per-set choices 2/7 with default 7, a 1234 ms turn timer) and must follow them: no literal 4 / 6 / [3,4,5] / 30000
 *     is left in the logic
 *   - the frontend repeats some values as literals (no shared module yet: the frontend test harnesses build files one by one).
 *     This test reads those places in frontend/src and fails when one of them differs from the constants, or when a pattern
 *     can no longer be found (then update this test, or better: make the frontend use a shared module)
 */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const C = require('../src/constants');
const { assert, rm, setup, newRoom, uid, runTests } = require('./helpers/sim');
const engine = require('../src/game/engine');
const { MAX_STRING_LEN } = require('../src/socket/payload');

const BACKEND = path.join(__dirname, '..');
const FRONT = path.join(BACKEND, '../frontend/src');
const errCodes = (c) => c.all('error').map((m) => m.code);
const readFront = (rel) => fs.readFileSync(path.join(FRONT, rel), 'utf8').replace(/\r\n/g, '\n');

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

// ── the values and the single source ─────────────────────────────────────────────────────────────────
test('nilai konstanta (perubahan disengaja harus mengubah tes ini): 4 pemain, kode 6, pilihan 3/4/5, default 4, timer 30 dtk', () => {
  assert.deepEqual({ ...C, ALLOWED_MAX_GAMES: [...C.ALLOWED_MAX_GAMES] }, {
    PLAYERS_PER_ROOM: 4, ROOM_CODE_LENGTH: 6, ALLOWED_MAX_GAMES: [3, 4, 5], DEFAULT_MAX_GAMES: 4, TURN_TIMEOUT_MS: 30000,
  });
  assert.ok(C.ALLOWED_MAX_GAMES.includes(C.DEFAULT_MAX_GAMES), 'default harus salah satu pilihan');
});

test('konstanta beku (tidak bisa diubah saat berjalan), termasuk daftar pilihan game', () => {
  assert.ok(Object.isFrozen(C) && Object.isFrozen(C.ALLOWED_MAX_GAMES));
  assert.throws(() => { C.PLAYERS_PER_ROOM = 5; }, TypeError);
  assert.throws(() => C.ALLOWED_MAX_GAMES.push(6), TypeError);
});

test('tidak ada salinan kedua: engine dan roomManager mengekspor objek/nilai yang sama dari constants.js', () => {
  assert.equal(engine.TURN_TIMEOUT_MS, C.TURN_TIMEOUT_MS);
  assert.equal(rm.ALLOWED_MAX_GAMES, C.ALLOWED_MAX_GAMES, 'objek yang sama, bukan salinan');
  assert.equal(rm.DEFAULT_MAX_GAMES, C.DEFAULT_MAX_GAMES);
});

test('batas panjang string payload cukup untuk kode Room dan UUID (36)', () => {
  assert.ok(MAX_STRING_LEN >= Math.max(C.ROOM_CODE_LENGTH, 36), `MAX_STRING_LEN=${MAX_STRING_LEN}`);
});

// ── behavior with the real constants ─────────────────────────────────────────────────────────────────
test('kode Room: panjang = ROOM_CODE_LENGTH, huruf besar dan angka saja, berbeda-beda', () => {
  const { io } = setup();
  const codes = Array.from({ length: 40 }, (_, i) => {
    const c = io.connect(uid(`c${i}_`)); c.emit('create_room', { maxGames: 3 }); return c.last('room_created').code;
  });
  for (const code of codes) assert.match(code, new RegExp(`^[A-Z0-9]{${C.ROOM_CODE_LENGTH}}$`));
  assert.equal(new Set(codes).size, codes.length);
});

test('kapasitas Room = PLAYERS_PER_ROOM: pemain ke-(N+1) ditolak ROOM_FULL; start butuh tepat N (NEED_4_PLAYERS)', () => {
  const { io } = setup();
  const room = newRoom(io, C.PLAYERS_PER_ROOM - 1);
  room.clients[0].emit('start_game', { roomCode: room.code });
  assert.ok(errCodes(room.clients[0]).includes('NEED_4_PLAYERS'));
  const last = io.connect(uid('last_')); last.emit('join_room', { roomCode: room.code });
  assert.equal(rm.getRoom(room.code).players.length, C.PLAYERS_PER_ROOM);
  const extra = io.connect(uid('extra_')); extra.emit('join_room', { roomCode: room.code });
  assert.deepEqual(errCodes(extra), ['ROOM_FULL']);
});

test('pilihan game: setiap nilai di ALLOWED_MAX_GAMES diterima, di luar itu INVALID_MAX_GAMES, tanpa nilai = DEFAULT_MAX_GAMES', () => {
  const { io } = setup();
  for (const n of C.ALLOWED_MAX_GAMES) {
    const c = io.connect(uid(`g${n}_`)); c.emit('create_room', { maxGames: n });
    assert.equal(rm.getRoom(c.last('room_created').code).maxGames, n);
  }
  for (const bad of [Math.min(...C.ALLOWED_MAX_GAMES) - 1, Math.max(...C.ALLOWED_MAX_GAMES) + 1, 0, '4', 4.5]) {
    const c = io.connect(uid('bad_')); c.emit('create_room', { maxGames: bad });
    assert.deepEqual(errCodes(c), ['INVALID_MAX_GAMES'], `maxGames=${JSON.stringify(bad)}`);
  }
  const d = io.connect(uid('def_')); d.emit('create_room', {});
  assert.equal(rm.getRoom(d.last('room_created').code).maxGames, C.DEFAULT_MAX_GAMES);
});

test('timer giliran: start game memasang timer tepat TURN_TIMEOUT_MS dan game_state membawa sisa waktu ≤ itu', () => {
  const { io } = setup();
  const seen = [];
  const real = global.setTimeout;
  global.setTimeout = (fn, ms, ...a) => { seen.push(ms); return real(fn, ms, ...a); };
  let room;
  try { room = newRoom(io, C.PLAYERS_PER_ROOM, { start: true }); } finally { global.setTimeout = real; }
  assert.ok(seen.includes(C.TURN_TIMEOUT_MS), `timer yang dipasang: ${JSON.stringify(seen)}`);
  const timeLeft = room.clients[0].last('game_state').game.timeLeft;
  assert.ok(timeLeft <= C.TURN_TIMEOUT_MS && timeLeft > C.TURN_TIMEOUT_MS - 1000, `timeLeft=${timeLeft}`);
});

// ── wiring: the real server code under DIFFERENT constants (child processes) ─────────────────────────
function withConstants(overrides, scenario) {
  const file = path.join(os.tmpdir(), `martil-constants-${process.pid}-${Math.random().toString(36).slice(2)}.js`);
  fs.writeFileSync(file, `
    const path = require('path');
    const constantsPath = ${JSON.stringify(path.join(BACKEND, 'src/constants.js'))};
    const __real = require(constantsPath);
    const o = ${JSON.stringify(overrides)};
    if (o.ALLOWED_MAX_GAMES) o.ALLOWED_MAX_GAMES = Object.freeze(o.ALLOWED_MAX_GAMES);
    require.cache[constantsPath].exports = Object.freeze({ ...__real, ...o });
    const { rm, setup, newRoom, uid } = require(${JSON.stringify(path.join(__dirname, 'helpers/sim'))});
    const err = (c) => c.all('error').map((m) => m.code);
    const out = {};
    ${scenario}
    process.stdout.write('RESULT ' + JSON.stringify(out) + '\\n');   // helpers/sim silences console.log
    process.exit(0);
  `);
  try {
    const r = spawnSync(process.execPath, [file], { env: { ...process.env, NODE_NO_WARNINGS: '1' }, encoding: 'utf8' });
    const m = /^RESULT (.*)$/m.exec(r.stdout || '');
    assert.ok(m, `proses anak gagal (exit ${r.status}):\n${r.stdout}\n${r.stderr}`);
    return JSON.parse(m[1]);
  } finally { fs.rmSync(file, { force: true }); }
}

test('wiring PLAYERS_PER_ROOM=5: Room menampung 5 (ROOM_FULL di pemain ke-6) dan start dengan 4 ditolak', () => {
  const r = withConstants({ PLAYERS_PER_ROOM: 5 }, `
    const { io } = setup();
    const clients = Array.from({ length: 6 }, (_, i) => io.connect(uid('p' + i + '_')));
    clients[0].emit('create_room', { maxGames: 3 }); const code = clients[0].last('room_created').code;
    for (let i = 1; i < 4; i++) clients[i].emit('join_room', { roomCode: code });
    clients[0].emit('start_game', { roomCode: code }); out.startWith4 = err(clients[0]);
    clients[4].emit('join_room', { roomCode: code }); out.fifth = err(clients[4]);
    clients[5].emit('join_room', { roomCode: code }); out.sixth = err(clients[5]);
    out.players = rm.getRoom(code).players.length;`);
  assert.ok(r.startWith4.includes('NEED_4_PLAYERS'), '4 pemain tidak cukup bila kapasitas 5');
  assert.deepEqual(r.fifth, [], 'pemain ke-5 harus diterima (bukan ROOM_FULL dari angka 4 yang tertinggal)');
  assert.deepEqual(r.sixth, ['ROOM_FULL']);
  assert.equal(r.players, 5);
});

test('wiring ROOM_CODE_LENGTH=8: kode yang dibuat 8 karakter', () => {
  const r = withConstants({ ROOM_CODE_LENGTH: 8 }, `
    const { io } = setup(); out.lengths = [];
    for (let i = 0; i < 6; i++) { const c = io.connect(uid('c' + i + '_')); c.emit('create_room', { maxGames: 3 }); out.lengths.push(c.last('room_created').code.length); }`);
  assert.deepEqual(r.lengths, [8, 8, 8, 8, 8, 8]);
});

test('wiring ALLOWED_MAX_GAMES=[2,7], DEFAULT_MAX_GAMES=7: 2 dan 7 diterima, 4 ditolak, tanpa nilai = 7', () => {
  const r = withConstants({ ALLOWED_MAX_GAMES: [2, 7], DEFAULT_MAX_GAMES: 7 }, `
    const { io } = setup(); const ask = (v) => { const c = io.connect(uid('m_')); c.emit('create_room', v === undefined ? {} : { maxGames: v });
      const ok = c.last('room_created'); return ok ? rm.getRoom(ok.code).maxGames : err(c); };
    out.two = ask(2); out.seven = ask(7); out.four = ask(4); out.none = ask(undefined);`);
  assert.equal(r.two, 2);
  assert.equal(r.seven, 7);
  assert.deepEqual(r.four, ['INVALID_MAX_GAMES']);
  assert.equal(r.none, 7);
});

test('wiring TURN_TIMEOUT_MS=1234: timer giliran dan sisa waktu mengikuti nilai itu (bukan 30000)', () => {
  const r = withConstants({ TURN_TIMEOUT_MS: 1234 }, `
    const { io } = setup(); const seen = []; const real = global.setTimeout;
    global.setTimeout = (fn, ms, ...a) => { seen.push(ms); return real(fn, ms, ...a); };
    const room = newRoom(io, 4, { start: true });
    global.setTimeout = real;
    out.timers = seen; out.timeLeft = room.clients[0].last('game_state').game.timeLeft;`);
  assert.ok(r.timers.includes(1234), `timer: ${JSON.stringify(r.timers)}`);
  assert.ok(!r.timers.includes(30000), 'literal 30000 tidak boleh tersisa');
  assert.ok(r.timeLeft <= 1234 && r.timeLeft > 0, `timeLeft=${r.timeLeft}`);
});

// ── frontend drift guard ─────────────────────────────────────────────────────────────────────────────
const nums = (re, text) => [...text.matchAll(re)].map((m) => Number(m[1]));
function allEqual(values, expected, what, min = 1) {
  assert.ok(values.length >= min, `pola "${what}" tidak ditemukan (${values.length}x, perlu ≥ ${min}): frontend berubah, perbarui tes ini atau pakai modul bersama`);
  for (const v of values) assert.equal(v, expected, `${what}: frontend ${v} ≠ backend ${expected}`);
}
const joinChoices = (list) => (list.length > 1 ? `${list.slice(0, -1).join(', ')}, atau ${list[list.length - 1]}` : String(list[0]));

test('frontend LobbyPage: MAX_GAMES_OPTIONS, default pilihan, jumlah pemain, dan panjang input kode sama dengan backend', () => {
  const t = ['pages/LobbyPage.jsx', 'components/HomeView.jsx', 'components/RoomView.jsx'].map((f) => readFront(f)).join('\n');
  const opts = /const MAX_GAMES_OPTIONS = \[([^\]]*)\]/.exec(t);
  assert.ok(opts, 'MAX_GAMES_OPTIONS tidak ditemukan');
  assert.deepEqual(opts[1].split(',').map((x) => Number(x.trim())), [...C.ALLOWED_MAX_GAMES], 'pilihan jumlah game');
  allEqual(nums(/\[maxGames, setMaxGames\]\s*=\s*useState\((\d+)\)/g, t), C.DEFAULT_MAX_GAMES, 'default maxGames di LobbyPage');
  const players = [
    ...nums(/players\.length\s*[=!]==\s*(\d+)/g, t), ...nums(/players\.length\s*<\s*(\d+)/g, t),
    ...nums(/\$\{players\.length\}\/(\d+)/g, t), ...nums(/\{players\.length\}\/(\d+) pemain/g, t),
    ...nums(/Array\.from\(\{ length: (\d+) \}\)/g, t),
  ];
  allEqual(players, C.PLAYERS_PER_ROOM, 'jumlah pemain di LobbyPage', 5);
  allEqual(nums(/maxLength=\{(\d+)\}/g, t), C.ROOM_CODE_LENGTH, 'maxLength input kode Room');
});

test('frontend useSocket: createRoom default maxGames sama dengan DEFAULT_MAX_GAMES', () => {
  allEqual(nums(/createRoom:\s*\(maxGames = (\d+)\)/g, readFront('hooks/useSocket.js')), C.DEFAULT_MAX_GAMES, 'default createRoom');
});

test('frontend timer giliran (GamePage dan gameLayout) = TURN_TIMEOUT_MS / 1000 detik', () => {
  const sec = C.TURN_TIMEOUT_MS / 1000;
  allEqual(nums(/const \[timeLeft, setTimeLeft\] = useState\((\d+)\)/g, readFront('pages/GamePage.jsx')), sec, 'timeLeft awal di GamePage');
  allEqual(nums(/turnRingPct\(timeLeft, total = (\d+)\)/g, readFront('utils/gameLayout.js')), sec, 'total cincin timer di gameLayout');
});

test('frontend serverErrors: pesan jumlah pemain dan pilihan game konsisten dengan konstanta backend', () => {
  const t = readFront('utils/serverErrors.js');
  const msg = (code) => { const m = new RegExp(`${code}:\\s*'([^']*)'`).exec(t); assert.ok(m, `${code} tidak ada di serverErrors.js`); return m[1]; };
  assert.equal(msg('INVALID_MAX_GAMES'), `Jumlah game per set tidak valid. Pilih ${joinChoices(C.ALLOWED_MAX_GAMES)}.`);
  assert.equal(msg('ROOM_FULL'), `Room sudah penuh (${C.PLAYERS_PER_ROOM} pemain).`);
  assert.equal(msg('NEED_4_PLAYERS'), `Butuh tepat ${C.PLAYERS_PER_ROOM} pemain untuk memulai game.`);
});

runTests(tests);
