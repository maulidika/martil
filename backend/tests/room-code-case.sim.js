'use strict';
/**
 * S2 — Room codes are case-insensitive on EVERY event that carries one (real socketHandler.js + roomManager.js, fake Socket.IO,
 * real in-memory SQLite).
 *   npm run test:codecase      (from the backend folder)
 *
 * Before the fix only leave_room, return_to_room and kick_player upper-cased the code; join_room, start_game, play_cards and
 * skip_turn used it as sent, so "abcdef" was ROOM_NOT_FOUND on join but worked on leave.
 *
 * Covered:
 *   - normalizeRoomCode: any case → upper case; missing / empty / non-string-ish → ''; no trimming (same rule as before)
 *   - join_room, start_game, play_cards, skip_turn with lower-case and mixed-case codes behave exactly like upper case
 *   - leave_room, return_to_room, kick_player keep working with lower-case codes (regression)
 *   - the socket joins the UPPER-case Socket.IO room (so broadcasts reach it) and every code the server sends back is upper case
 *   - a wrong/unknown code gives the same errors in every case; a non-member is still refused; invalid payloads are still INVALID_PAYLOAD
 */
const path = require('path');
const { normalizeRoomCode } = require(path.join('..', 'src', 'socket', 'payload.js'));
const { assert, rm, setup, newRoom, uid, playSetToEnd, runTests } = require('./helpers/sim');

const lower = (code) => code.toLowerCase();
const mixed = (code) => [...code].map((ch, i) => (i % 2 ? ch.toLowerCase() : ch.toUpperCase())).join('');
const VARIANTS = [['lower', lower], ['mixed', mixed]];
const errCodes = (c) => c.all('error').map((m) => m.code);

/** A Room of `n` players created with the real code; joiners use `variant(code)`. */
function roomWith(io, n, variant, { start = false } = {}) {
  const users = Array.from({ length: n }, (_, i) => uid(`cc${i + 1}_`));
  const clients = users.map((u) => io.connect(u));
  clients[0].emit('create_room', { maxGames: 3 });
  const code = clients[0].last('room_created').code;
  for (let i = 1; i < n; i++) clients[i].emit('join_room', { roomCode: variant(code) });
  if (start) clients[0].emit('start_game', { roomCode: variant(code) });
  return { users, clients, code };
}

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

test('normalizeRoomCode: huruf besar semua; kosong/undefined/null/0/false → ""; tanpa trim', () => {
  assert.equal(normalizeRoomCode('abc123'), 'ABC123');
  assert.equal(normalizeRoomCode('AbC123'), 'ABC123');
  assert.equal(normalizeRoomCode('ABC123'), 'ABC123');
  for (const v of [undefined, null, '', 0, false]) assert.equal(normalizeRoomCode(v), '', `nilai ${String(v)}`);
  assert.equal(normalizeRoomCode(' abc'), ' ABC', 'spasi tidak dipangkas (aturan lama tetap)');
});

for (const [label, variant] of VARIANTS) {
  test(`join_room dengan kode ${label}: bergabung, siaran ber-kode UPPER, socket masuk ke Socket.IO room UPPER`, () => {
    const { io } = setup();
    const { clients, code } = roomWith(io, 4, variant);
    assert.equal(rm.getRoom(code).players.length, 4);
    for (const c of clients) {
      assert.equal(c.last('room_updated').code, code, 'kode di state selalu UPPER');
      assert.ok(c.socket.rooms.has(code), 'socket harus ada di room UPPER (agar menerima siaran)');
      if (variant(code) !== code) assert.ok(!c.socket.rooms.has(variant(code)), 'tidak boleh ada room Socket.IO dengan huruf non-UPPER');
      assert.deepEqual(errCodes(c), []);
    }
    // everybody got the broadcast about the last joiner
    assert.equal(clients[0].last('room_updated').players.length, 4);
  });

  test(`join_room dengan kode ${label} oleh anggota yang sudah ada: memulihkan sesi, bukan ROOM_NOT_FOUND`, () => {
    const { io } = setup();
    const { clients, code } = roomWith(io, 2, variant);
    clients[1].clear();
    clients[1].emit('join_room', { roomCode: variant(code) });
    assert.deepEqual(errCodes(clients[1]), []);
    assert.equal(rm.getRoom(code).players.length, 2, 'tidak boleh menambah pemain ganda');
  });

  test(`start_game dengan kode ${label}: game dimulai untuk semua`, () => {
    const { io } = setup();
    const { clients, code } = roomWith(io, 4, variant, { start: true });
    assert.equal(rm.getRoom(code).status, 'playing');
    for (const c of clients) {
      assert.ok(c.last('game_started'), 'semua pemain menerima game_started');
      assert.deepEqual(errCodes(c), []);
    }
  });

  test(`play_cards dan skip_turn dengan kode ${label}: aksi diproses seperti kode UPPER`, () => {
    const { io } = setup();
    const { users, clients, code } = roomWith(io, 4, variant, { start: true });
    const byId = Object.fromEntries(users.map((u, i) => [u, clients[i]]));
    const g = () => rm.getRoom(code).currentGame;
    const first = g().currentTurn;
    byId[first].emit('play_cards', { roomCode: variant(code), cardIds: [g().hands[first][0].id] });
    assert.equal(g().table.length, 1, 'kartu harus masuk meja');
    const second = g().currentTurn;
    assert.notEqual(second, first, 'giliran berpindah');
    byId[second].emit('skip_turn', { roomCode: variant(code) });
    assert.ok((g().passedPlayers || []).includes(second), 'skip harus tercatat');
    for (const c of clients) assert.deepEqual(errCodes(c), [], 'tidak ada error untuk aksi sah');
  });
}

test('leave_room, return_to_room, kick_player: tetap bekerja dengan kode huruf kecil (regresi)', async () => {
  const { io } = setup();
  const room = newRoom(io, 4, { start: true });
  await playSetToEnd(room.clients, room.users, room.code);
  room.clients[1].emit('return_to_room', { roomCode: lower(room.code) });
  assert.ok(room.clients[1].last('room_returned'), 'return_to_room dengan kode kecil');
  assert.equal(room.clients[1].last('room_returned').code, room.code);
  for (const i of [0, 2, 3]) room.clients[i].emit('return_to_room', { roomCode: mixed(room.code) });
  room.clients[0].emit('kick_player', { roomCode: lower(room.code), targetId: room.users[3] });
  assert.equal(room.clients[0].last('kick_done').mode, 'room');
  room.clients[2].emit('leave_room', { roomCode: lower(room.code) });
  assert.equal(room.clients[2].last('room_left').roomCode, room.code, 'kode di respons UPPER');
});

test('kode salah/tidak ada: kesalahan yang sama di semua huruf; bukan anggota tetap ditolak', () => {
  const { io } = setup();
  const { clients, code } = roomWith(io, 4, lower);
  const stranger = io.connect(uid('stranger_'));
  stranger.emit('join_room', { roomCode: 'zzzzzz' });
  stranger.emit('join_room', { roomCode: 'ZZZZZZ' });
  assert.deepEqual(errCodes(stranger), ['ROOM_NOT_FOUND', 'ROOM_NOT_FOUND']);
  stranger.clear();
  stranger.emit('start_game', { roomCode: lower(code) });
  stranger.emit('start_game', { roomCode: code });
  stranger.emit('skip_turn', { roomCode: lower(code) });
  stranger.emit('play_cards', { roomCode: lower(code), cardIds: ['x'] });
  assert.deepEqual(errCodes(stranger), ['NOT_IN_ROOM', 'NOT_IN_ROOM', 'NOT_IN_ROOM', 'NOT_IN_ROOM']);
  assert.equal(rm.getRoom(code).status, 'waiting');
  // a non-Host member still cannot start, whatever the case
  clients[1].emit('start_game', { roomCode: mixed(code) });
  assert.equal(clients[1].last('error').code, 'NOT_HOST');
});

test('payload tidak valid dan kode hilang: perilaku lama tidak berubah', () => {
  const { io } = setup();
  const c = io.connect(uid('solo_'));
  c.emit('join_room', { roomCode: 123 });
  assert.equal(c.last('error').code, 'INVALID_PAYLOAD');
  c.clear();
  c.emit('join_room', {});
  assert.equal(c.last('error').code, 'ROOM_NOT_FOUND');
  c.clear();
  c.emit('start_game', {});
  assert.equal(c.last('error').code, 'NOT_IN_ROOM');
  c.clear();
  c.emit('skip_turn', { roomCode: '' });
  assert.equal(c.last('error').code, 'NOT_IN_ROOM');
});

runTests(tests);
