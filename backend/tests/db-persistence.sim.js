'use strict';
/**
 * What the server really writes to the database while Rooms are played: the real socketHandler.js + roomManager.js run
 * against a REAL in-memory SQLite with the production schema (helpers/memdb.js), with a fake Socket.IO.
 *   npm run test:persistence      (from the backend folder)
 *
 * Covered (current behavior, nothing here changes game rules):
 *   - create_room writes one `rooms` row (code, host, max_games 3/4/5, status 'waiting'); joining writes nothing
 *   - start_game: status 'playing' + one `sets` row (ended_at NULL); rejected starts write nothing; a repeated start adds no 2nd set
 *   - a finished set: status 'done', sets.ended_at filled, one `games` row per game (numbers 1..N, winner, win_type, ended_at),
 *     four `game_scores` rows per game (distinct players, JSON remaining_cards), and per-player score sums equal the in-memory set scores
 *   - a second set in the same Room: a second `sets` row, the first one keeps its ended_at, new games belong to the new set
 *   - returning to the Room resets the status to 'waiting'; the last player leaving a Room marks it 'closed'
 *   - closeStaleRooms (S8) applied to Rooms produced by the real code paths closes exactly the 'waiting'/'playing' ones
 *   - (enforced by the runner) no SQL error is ever swallowed by the socket handlers during any scenario; the recorder that
 *     enforces it is itself tested here (unit + a child process proving runTests fails a scenario with a swallowed SQL error)
 */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { assert, rm, setup, newRoom, playSetToEnd, runTests, memdb } = require('./helpers/sim');

const q = (sql, ...params) => memdb.handle().prepare(sql).all(...params).map((r) => ({ ...r }));
const one = (sql, ...params) => q(sql, ...params)[0];
const roomRow = (code) => one('SELECT * FROM rooms WHERE code = ?', code);
const errCodes = (c) => c.all('error').map((m) => m.code);

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

test('create_room: satu baris rooms (kode, host, max_games bawaan 4, status waiting); bergabung tidak menulis apa pun', () => {
  const { io } = setup();
  const { users, code } = newRoom(io, 4);
  const rows = q('SELECT * FROM rooms');
  assert.equal(rows.length, 1);
  const r = roomRow(code);
  assert.equal(r.host_id, users[0]);
  assert.equal(r.status, 'waiting');
  assert.equal(r.max_games, 4);
  assert.ok(r.id && r.created_at);
  assert.equal(r.id, rm.getRoom(code).id, 'id baris DB sama dengan id Room di memori');
  assert.equal(q('SELECT * FROM sets').length, 0);
  assert.equal(q('SELECT * FROM games').length, 0);
  assert.equal(q('SELECT * FROM room_players').length, 0, 'room_players belum dipakai server (tercatat sebagai perilaku saat ini)');
});

test('create_room dengan maxGames 3 dan 5: nilai tersimpan apa adanya', () => {
  const { io } = setup();
  const seen = [];
  for (const n of [3, 5]) {
    const c = io.connect(`host_${n}`);
    c.emit('create_room', { maxGames: n });
    seen.push(roomRow(c.last('room_created').code).max_games);
  }
  assert.deepEqual(seen, [3, 5]);
});

test('start_game: status playing + satu baris sets (ended_at NULL); belum ada games', () => {
  const { io } = setup();
  const { code } = newRoom(io, 4, { start: true });
  const r = roomRow(code);
  assert.equal(r.status, 'playing');
  const sets = q('SELECT * FROM sets');
  assert.equal(sets.length, 1);
  assert.equal(sets[0].room_id, r.id);
  assert.equal(sets[0].ended_at, null);
  assert.ok(sets[0].started_at);
  assert.equal(q('SELECT * FROM games').length, 0);
});

test('start_game ditolak (bukan Host / pemain kurang) dan start berulang: tidak menulis set tambahan', () => {
  const { io } = setup();
  const three = newRoom(io, 3);
  three.clients[0].emit('start_game', { roomCode: three.code });          // only 3 players
  assert.ok(errCodes(three.clients[0]).length > 0, 'start dengan 3 pemain harus ditolak');
  assert.equal(roomRow(three.code).status, 'waiting');
  assert.equal(q('SELECT * FROM sets').length, 0);

  const four = newRoom(io, 4);
  four.clients[1].emit('start_game', { roomCode: four.code });            // not the Host
  assert.equal(roomRow(four.code).status, 'waiting');
  assert.equal(q('SELECT * FROM sets WHERE room_id = ?', roomRow(four.code).id).length, 0);

  four.clients[0].emit('start_game', { roomCode: four.code });
  four.clients[0].emit('start_game', { roomCode: four.code });            // repeated
  assert.equal(q('SELECT * FROM sets WHERE room_id = ?', roomRow(four.code).id).length, 1, 'start berulang tidak boleh membuat set kedua');
});

test('set selesai: rooms done, sets.ended_at terisi, games 1..N, game_scores 4 baris per game, jumlah skor = skor set di memori', async () => {
  const { io } = setup();
  const room = newRoom(io, 4, { start: true });
  await playSetToEnd(room.clients, room.users, room.code);
  const r = roomRow(room.code);
  assert.equal(r.status, 'done');

  const set = one('SELECT * FROM sets WHERE room_id = ?', r.id);
  assert.ok(set.ended_at, 'ended_at harus terisi saat set selesai');

  const games = q('SELECT * FROM games WHERE set_id = ? ORDER BY game_number', set.id);
  assert.deepEqual(games.map((g) => g.game_number), [1, 2, 3, 4]);
  for (const g of games) {
    assert.ok(room.users.includes(g.winner_id), `pemenang game ${g.game_number} harus salah satu pemain`);
    assert.ok(typeof g.win_type === 'string' && g.win_type.length > 0);
    assert.ok(g.ended_at);
    const scores = q('SELECT * FROM game_scores WHERE game_id = ?', g.id);
    assert.equal(scores.length, 4);
    assert.deepEqual(scores.map((s) => s.user_id).sort(), [...room.users].sort());
    for (const s of scores) {
      assert.ok(Number.isInteger(s.score));
      assert.ok(Array.isArray(JSON.parse(s.remaining_cards)), 'remaining_cards harus JSON array');
    }
  }
  const sums = Object.fromEntries(q('SELECT user_id, SUM(score) AS total FROM game_scores GROUP BY user_id').map((x) => [x.user_id, x.total]));
  const mem = rm.getRoom(room.code).setScores;
  for (const u of room.users) assert.equal(sums[u], mem[u], `skor set ${u}: DB ${sums[u]} vs memori ${mem[u]}`);
});

test('set kedua di Room yang sama: return_to_room → waiting, lalu sets kedua; set pertama tetap utuh', async () => {
  const { io } = setup();
  const room = newRoom(io, 4, { start: true });
  await playSetToEnd(room.clients, room.users, room.code);
  const roomId = roomRow(room.code).id;
  const firstSet = one('SELECT * FROM sets WHERE room_id = ?', roomId);

  room.clients[0].emit('return_to_room', { roomCode: room.code });
  assert.equal(roomRow(room.code).status, 'waiting');

  // Only the Host is back: the start is refused (PLAYERS_NOT_READY) and writes nothing.
  room.clients[0].emit('start_game', { roomCode: room.code });
  assert.ok(errCodes(room.clients[0]).includes('PLAYERS_NOT_READY'));
  assert.equal(q('SELECT * FROM sets WHERE room_id = ?', roomId).length, 1);
  assert.equal(roomRow(room.code).status, 'waiting');

  for (const c of room.clients.slice(1)) c.emit('return_to_room', { roomCode: room.code });
  room.clients[0].emit('start_game', { roomCode: room.code });
  assert.equal(roomRow(room.code).status, 'playing');
  assert.equal(q('SELECT * FROM sets WHERE room_id = ?', roomId).length, 2);
  await playSetToEnd(room.clients, room.users, room.code);

  const sets = q('SELECT * FROM sets WHERE room_id = ? ORDER BY started_at, rowid', roomId);
  assert.equal(sets.length, 2);
  assert.deepEqual({ ...sets.find((s) => s.id === firstSet.id) }, firstSet, 'set pertama tidak boleh berubah');
  assert.ok(sets.every((s) => s.ended_at));
  assert.equal(roomRow(room.code).status, 'done');
  const perSet = sets.map((s) => q('SELECT * FROM games WHERE set_id = ?', s.id).length);
  assert.deepEqual(perSet, [4, 4], 'masing-masing set punya 4 game');
  assert.equal(q('SELECT * FROM game_scores').length, 32);
});

test('pemain terakhir keluar: rooms closed; keluar sebagian: tetap waiting', () => {
  const { io } = setup();
  const room = newRoom(io, 4);
  room.clients[3].emit('leave_room', { roomCode: room.code });
  assert.equal(roomRow(room.code).status, 'waiting');
  for (const c of room.clients.slice(0, 3)) c.emit('leave_room', { roomCode: room.code });
  assert.ok(!rm.getRoom(room.code), 'Room dihapus dari memori');
  assert.equal(roomRow(room.code).status, 'closed');
});

test('closeStaleRooms (S8) pada Room hasil kode asli: waiting dan playing ditutup, done tetap', async () => {
  const { io } = setup();
  const waiting = newRoom(io, 2);
  const playing = newRoom(io, 4, { start: true });
  const done = newRoom(io, 4, { start: true });
  await playSetToEnd(done.clients, done.users, done.code);
  assert.deepEqual([waiting, playing, done].map((r) => roomRow(r.code).status), ['waiting', 'playing', 'done']);

  assert.equal(memdb.closeStaleRooms(memdb.handle()), 2);
  assert.deepEqual([waiting, playing, done].map((r) => roomRow(r.code).status), ['closed', 'closed', 'done']);
  assert.equal(one('SELECT ended_at FROM sets WHERE room_id = ?', roomRow(playing.code).id).ended_at, null, 'set yang terputus dibiarkan (NULL)');
  assert.equal(memdb.closeStaleRooms(memdb.handle()), 0);
});

// ── the error recorder of the harness (it is what makes swallowed SQL errors fail a scenario) ──────────────────────
test('harness: error SQL tercatat (prepare, exec, run) dan takeErrors() mengosongkan catatan', () => {
  setup();
  memdb.takeErrors();
  const db = memdb.handle();
  assert.throws(() => db.prepare('SELECT * FROM table_that_does_not_exist'));
  assert.throws(() => db.exec('NOT SQL AT ALL'));
  assert.throws(() => db.prepare("INSERT INTO rooms (id, code, host_id) VALUES ('a','AAAAAA','h')").run() && db.prepare("INSERT INTO rooms (id, code, host_id) VALUES ('b','AAAAAA','h')").run());
  const got = memdb.takeErrors();
  assert.equal(got.length, 3, `harus 3 error tercatat, dapat: ${JSON.stringify(got)}`);
  assert.match(got[0], /table_that_does_not_exist/);
  assert.match(got[2], /UNIQUE|constraint/i);
  assert.deepEqual(memdb.takeErrors(), [], 'setelah diambil, catatan kosong');
  memdb.takeErrors();
});

test('harness: setup() memulai database kosong baru di tiap skenario (tidak ada data bocor antar tes)', () => {
  setup();
  memdb.handle().exec("INSERT INTO rooms (id, code, host_id) VALUES ('x','XXXXXX','h')");
  setup();
  assert.equal(q('SELECT * FROM rooms').length, 0);
});

function runHarnessChild(body) {
  const file = path.join(os.tmpdir(), `martil-harness-${process.pid}-${Date.now()}.js`);
  fs.writeFileSync(file, `const { rm, setup, newRoom, runTests, memdb } = require(${JSON.stringify(path.join(__dirname, 'helpers/sim'))});\nrunTests([{ name: 'skenario', fn: () => { ${body} } }]);\n`);
  try {
    const r = spawnSync(process.execPath, [file], { env: { ...process.env, NODE_NO_WARNINGS: '1' }, encoding: 'utf8' });
    return { status: r.status, out: `${r.stdout}${r.stderr}` };
  } finally { fs.rmSync(file, { force: true }); }
}

test('runTests: skenario yang error SQL-nya tertelan harus GAGAL (exit 1, pesan "error SQL tertelan"); skenario bersih lulus', () => {
  const swallowed = runHarnessChild("setup(); try { memdb.handle().prepare('SELECT * FROM table_that_does_not_exist'); } catch { /* swallowed like onSafe does */ }");
  assert.equal(swallowed.status, 1, swallowed.out);
  assert.match(swallowed.out, /FAIL\s+skenario/);
  assert.match(swallowed.out, /error SQL tertelan/);
  assert.match(swallowed.out, /table_that_does_not_exist/);
  const clean = runHarnessChild("const { io } = setup(); newRoom(io, 2);");
  assert.equal(clean.status, 0, clean.out);
  assert.match(clean.out, /PASS\s+skenario/);
});

test('reconnect.sim.js (runner sendiri): juga mengambil dan memeriksa error SQL tertelan di tiap skenario', () => {
  const src = fs.readFileSync(path.join(__dirname, 'reconnect.sim.js'), 'utf8');
  assert.ok((src.match(/memdb\.takeErrors\(\)/g) || []).length >= 2, 'runner harus mengosongkan sebelum dan memeriksa sesudah tiap skenario');
  assert.match(src, /error SQL tertelan/);
  assert.match(src, /memdb\.fresh\(\)/, 'setup() harus memulai database baru');
});

runTests(tests);
