'use strict';
/**
 * S6 (stage 1, database access): every statement that persists Rooms/Sets/Games lives in src/db/roomStore.js, and
 * rooms/roomManager.js only calls it. Real roomStore.js + roomManager.js + socketHandler.js against a REAL in-memory SQLite
 * with the production schema (helpers/memdb.js), fake Socket.IO.
 *   npm run test:roomstore      (from the backend folder)
 *
 * Covered (current behavior, nothing here changes game rules or what is written):
 *   - each roomStore function on its own: rows, schema defaults, only the targeted row changes, JSON remaining_cards, NULL penalty
 *   - WIRING: a whole Set played through the real socket handlers calls the store in the order the room manager always used
 *     (insertRoom; insertSet then status 'playing'; one insertGame per game with 4 scores; endSet then status 'done';
 *      return_to_room -> 'waiting'; last player leaves -> 'closed')
 *   - LOCATION: `.prepare(` only appears in the allowed files (database.js, roomStore.js, userStore.js), and only they (plus
 *     server.js for boot) require db/database; roomManager, socketHandler and auth/routes contain no SQL
 * Not covered on purpose: transactions. roomStore does not use one (same as before): a failure between the `games` row and
 * its `game_scores` rows would leave a partial game. Reported in HANDOFF.md, not changed here.
 */
const fs = require('node:fs');
const path = require('node:path');
const { assert, rm, setup, newRoom, playSetToEnd, runTests, memdb } = require('./helpers/sim');
const store = require('../src/db/roomStore');

const SRC = path.join(__dirname, '../src');
const q = (sql, ...params) => memdb.handle().prepare(sql).all(...params).map((r) => ({ ...r }));
const one = (sql, ...params) => q(sql, ...params)[0];

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

// ── roomStore on its own ─────────────────────────────────────────────────────────────────────────────
test('insertRoom: satu baris rooms; status bawaan waiting; created_at terisi', () => {
  memdb.fresh();
  store.insertRoom('r1', 'ABC123', 'host-1', 5);
  const rows = q('SELECT * FROM rooms');
  assert.equal(rows.length, 1);
  assert.deepEqual({ id: rows[0].id, code: rows[0].code, host_id: rows[0].host_id, max_games: rows[0].max_games, status: rows[0].status },
    { id: 'r1', code: 'ABC123', host_id: 'host-1', max_games: 5, status: 'waiting' });
  assert.ok(rows[0].created_at);
});

test('insertRoom: kode yang sama dua kali ditolak oleh UNIQUE (perilaku DB saat ini)', () => {
  memdb.fresh();
  store.insertRoom('r1', 'ABC123', 'h', 4);
  assert.throws(() => store.insertRoom('r2', 'ABC123', 'h', 4), /UNIQUE/i);
  assert.equal(q('SELECT * FROM rooms').length, 1);
  assert.equal(memdb.takeErrors().length, 1, 'perekam error SQL harus mencatat penolakan itu');
});

test('setRoomStatus: hanya Room yang dituju berubah', () => {
  memdb.fresh();
  store.insertRoom('r1', 'AAA111', 'h', 4); store.insertRoom('r2', 'BBB222', 'h', 4);
  for (const st of ['playing', 'done', 'waiting', 'closed']) {
    store.setRoomStatus('r1', st);
    assert.equal(one('SELECT status FROM rooms WHERE id = ?', 'r1').status, st);
    assert.equal(one('SELECT status FROM rooms WHERE id = ?', 'r2').status, 'waiting');
  }
});

test('insertSet dan endSet: ended_at NULL sampai endSet, dan hanya Set yang dituju terisi', () => {
  memdb.fresh();
  store.insertRoom('r1', 'AAA111', 'h', 4);
  store.insertSet('s1', 'r1'); store.insertSet('s2', 'r1');
  assert.deepEqual(q('SELECT id, ended_at FROM sets ORDER BY id').map((r) => [r.id, r.ended_at]), [['s1', null], ['s2', null]]);
  assert.ok(one('SELECT started_at FROM sets WHERE id = ?', 's1').started_at);
  store.endSet('s1');
  assert.ok(one('SELECT ended_at FROM sets WHERE id = ?', 's1').ended_at);
  assert.equal(one('SELECT ended_at FROM sets WHERE id = ?', 's2').ended_at, null);
});

test('insertGame: satu baris games + satu game_scores per skor; kartu sisa JSON; penalti kosong jadi NULL', () => {
  memdb.fresh();
  store.insertRoom('r1', 'AAA111', 'h', 4); store.insertSet('s1', 'r1');
  store.insertGame('g1', 's1', 2, 'u2', 'normal', [
    { id: 'u1', score: -3, remainingCards: ['3D', '4C', 'AS'], penaltyType: 'paketan' },
    { id: 'u2', score: 9 },
    { id: 'u3', score: -6, remainingCards: [] },
  ]);
  const g = one('SELECT * FROM games WHERE id = ?', 'g1');
  assert.deepEqual({ set_id: g.set_id, game_number: g.game_number, winner_id: g.winner_id, win_type: g.win_type }, { set_id: 's1', game_number: 2, winner_id: 'u2', win_type: 'normal' });
  assert.ok(g.ended_at);
  const scores = q('SELECT * FROM game_scores WHERE game_id = ? ORDER BY user_id', 'g1');
  assert.deepEqual(scores.map((s) => [s.user_id, s.score, s.remaining_cards, s.penalty_type]),
    [['u1', -3, '["3D","4C","AS"]', 'paketan'], ['u2', 9, '[]', null], ['u3', -6, '[]', null]]);
  assert.equal(new Set(scores.map((s) => s.id)).size, 3, 'id skor harus berbeda');
});

test('insertGame tanpa skor: hanya baris games', () => {
  memdb.fresh();
  store.insertRoom('r1', 'AAA111', 'h', 4); store.insertSet('s1', 'r1');
  store.insertGame('g1', 's1', 1, 'u1', 'normal', []);
  assert.equal(q('SELECT * FROM games').length, 1);
  assert.equal(q('SELECT * FROM game_scores').length, 0);
});

// ── wiring through the real server code ──────────────────────────────────────────────────────────────
async function withStoreSpy(fn) {
  const calls = []; const originals = { ...store };
  for (const name of Object.keys(originals)) store[name] = (...args) => { calls.push([name, ...args]); return originals[name](...args); };
  try { return await fn(calls); } finally { Object.assign(store, originals); }
}

test('wiring: satu Set penuh memanggil store dalam urutan yang selalu dipakai roomManager', async () => {
  const { io } = setup();
  await withStoreSpy(async (calls) => {
    const room = newRoom(io, 4, { start: true });
    await playSetToEnd(room.clients, room.users, room.code);
    const names = calls.map((c) => c[0]);
    assert.deepEqual(names.slice(0, 3), ['insertRoom', 'insertSet', 'setRoomStatus']);
    assert.deepEqual(names.slice(3), ['insertGame', 'insertGame', 'insertGame', 'insertGame', 'endSet', 'setRoomStatus']);

    const [, roomId, code, hostId, maxGames] = calls[0];
    assert.deepEqual([typeof roomId, code, hostId, maxGames], ['string', room.code, room.users[0], 4]);
    const [, setId, setRoomId] = calls[1];
    assert.equal(setRoomId, roomId);
    assert.deepEqual(calls[2], ['setRoomStatus', roomId, 'playing']);
    calls.slice(3, 7).forEach(([, gameId, gSetId, gameNumber, winnerId, winType, scores], i) => {
      assert.equal(typeof gameId, 'string');
      assert.equal(gSetId, setId);
      assert.equal(gameNumber, i + 1);
      assert.ok(room.users.includes(winnerId));
      assert.ok(typeof winType === 'string' && winType.length > 0);
      assert.equal(scores.length, 4);
    });
    assert.deepEqual(calls[7], ['endSet', setId]);
    assert.deepEqual(calls[8], ['setRoomStatus', roomId, 'done']);
  });
});

test('wiring: return_to_room -> waiting; pemain terakhir keluar -> closed', async () => {
  const { io } = setup();
  const room = newRoom(io, 4, { start: true });
  await playSetToEnd(room.clients, room.users, room.code);
  const roomId = one('SELECT id FROM rooms WHERE code = ?', room.code).id;
  await withStoreSpy((calls) => {
    room.clients[0].emit('return_to_room', { roomCode: room.code });
    assert.deepEqual(calls, [['setRoomStatus', roomId, 'waiting']]);
    calls.length = 0;
    for (const c of room.clients.slice(1)) c.emit('return_to_room', { roomCode: room.code });
    for (const c of room.clients.slice(0, 3)) c.emit('leave_room', { roomCode: room.code });
    assert.deepEqual(calls, [], 'selama masih ada pemain, tidak ada tulis ke store');
    room.clients[3].emit('leave_room', { roomCode: room.code });
    assert.deepEqual(calls, [['setRoomStatus', roomId, 'closed']]);
  });
});

// ── where SQL may live ───────────────────────────────────────────────────────────────────────────────
const ALLOWED_PREPARE = [
  { file: 'db/database.js', why: 'schema, migrations, boot and the stale-room sweep' },
  { file: 'db/roomStore.js', why: 'Room/Set/Game persistence (this stage)' },
  { file: 'db/userStore.js', why: 'users table persistence' },
];
const ALLOWED_DB_REQUIRE = [
  { file: 'db/roomStore.js', why: 'the store itself' },
  { file: 'db/userStore.js', why: 'the users store' },
  { file: 'server.js', why: 'bootDatabase() at startup' },
];
const stripComments = (code) => code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1');
const listJs = (dir, out = []) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) listJs(p, out); else if (e.name.endsWith('.js') && !e.name.endsWith('.test.js')) out.push(p);
  }
  return out;
};
const usesPrepare = (code) => /\.prepare\(/.test(stripComments(code));
const requiresDb = (code) => /require\(\s*['"][^'"]*\/database['"]\s*\)/.test(stripComments(code));
const files = listJs(SRC).map((p) => ({ file: path.relative(SRC, p).split(path.sep).join('/'), code: fs.readFileSync(p, 'utf8') }));

test('pemeriksa lokasi SQL: .prepare( dan require db/database terdeteksi, komentar diabaikan', () => {
  assert.equal(usesPrepare("db().prepare('SELECT 1')"), true);
  assert.equal(usesPrepare("// db().prepare('x')\n/* .prepare( */\nconst a = 1"), false);
  assert.equal(requiresDb("const { db } = require('../db/database');"), true);
  assert.equal(requiresDb("const { db } = require(\"./db/database\")"), true);
  assert.equal(requiresDb("const { db } = require('./database')"), true);
  assert.equal(requiresDb("const x = require('../db/roomStore')"), false);
});

test('lokasi: .prepare( hanya di berkas yang diizinkan', () => {
  assert.ok(files.length > 5);
  const allowed = new Set(ALLOWED_PREPARE.map((a) => a.file));
  assert.deepEqual(files.filter((f) => usesPrepare(f.code) && !allowed.has(f.file)).map((f) => f.file), [], 'SQL baru: taruh di db/roomStore.js (atau store baru), bukan di logika');
});

test('lokasi: hanya berkas yang diizinkan yang me-require db/database', () => {
  const allowed = new Set(ALLOWED_DB_REQUIRE.map((a) => a.file));
  assert.deepEqual(files.filter((f) => requiresDb(f.code) && !allowed.has(f.file)).map((f) => f.file), []);
});

test('roomManager hanya lewat roomStore; socketHandler tidak menyentuh modul database sama sekali', () => {
  const rmCode = stripComments(files.find((f) => f.file === 'rooms/roomManager.js').code);
  assert.match(rmCode, /require\('\.\.\/db\/roomStore'\)/);
  assert.doesNotMatch(rmCode, /\bdb\(\)|\.prepare\(/);
  const sh = stripComments(files.find((f) => f.file === 'socket/socketHandler.js').code);
  assert.doesNotMatch(sh, /require\([^)]*\/db\//);
});

test('daftar izin tidak basi: tiap entri punya alasan dan masih cocok dengan berkas nyata', () => {
  for (const a of ALLOWED_PREPARE) {
    assert.ok(a.why.length > 15, `${a.file}: alasan wajib`);
    assert.ok(files.some((f) => f.file === a.file && usesPrepare(f.code)), `${a.file}: tidak lagi memakai .prepare( : hapus dari ALLOWED_PREPARE`);
  }
  for (const a of ALLOWED_DB_REQUIRE) {
    assert.ok(a.why.length > 10, `${a.file}: alasan wajib`);
    assert.ok(files.some((f) => f.file === a.file && requiresDb(f.code)), `${a.file}: tidak lagi me-require db/database: hapus dari ALLOWED_DB_REQUIRE`);
  }
});

runTests(tests);
