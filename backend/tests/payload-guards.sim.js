'use strict';
/**
 * H2 — payload guards on every Socket.IO handler (real socketHandler.js + roomManager.js, fake Socket.IO).
 *   npm run test:payload      (from the backend folder)
 *
 * Covered:
 *   - empty / wrong-type payloads never throw out of a handler and never change server state
 *   - the sender gets INVALID_PAYLOAD on the same channel(s) the handler already uses for rejections
 *   - fields with the wrong type (or absurdly long strings) are rejected; MISSING fields keep their old behaviour
 *   - the safety net (onSafe): an unexpected internal exception is contained, reported as INTERNAL_ERROR,
 *     and the server keeps serving other requests
 */
const path = require('path');
const { assert, rm, setup, newRoom, uid, runTests } = require('./helpers/sim');

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

const BAD_PAYLOADS = [undefined, null, 42, 'str', true, [], ['x'], () => {}];
const label = (v) => (typeof v === 'function' ? 'function' : JSON.stringify(v) ?? 'undefined');

// Event → channels that must carry the rejection (kept independent from payload.js on purpose).
const CHANNELS = {
  join_room: ['error'], leave_room: ['leave_room_error', 'error'], return_to_room: ['return_room_error', 'error'],
  kick_player: ['kick_error'], start_game: ['error'], play_cards: ['error'], skip_turn: ['error'], create_room: ['error'],
};
const ROOM_EVENTS = ['join_room', 'leave_room', 'return_to_room', 'kick_player', 'start_game', 'play_cards', 'skip_turn'];

const roomFingerprint = (code) => {
  const r = rm.getRoom(code);
  return JSON.stringify({ players: r.players.map(p => [p.id, p.connected, p.inRoom]), host: r.hostId, status: r.status });
};
const codesOn = (c, ev) => c.all(ev).map(m => m.code);

// ── Bad payload shapes ───────────────────────────────────────────────────────

test('semua event ber-room: payload kosong/salah tipe → INVALID_PAYLOAD, tidak melempar, state room tidak berubah', () => {
  const { io } = setup();
  const { clients, code } = newRoom(io, 2);              // clients[0] = Host, sudah di dalam room
  const outsider = io.connect(uid('out_'));
  for (const ev of ROOM_EVENTS) {
    for (const bad of BAD_PAYLOADS) {
      for (const c of [clients[0], outsider]) {
        const before = roomFingerprint(code);
        c.clear();
        assert.doesNotThrow(() => c.emit(ev, bad), `${ev}(${label(bad)}) melempar`);
        for (const ch of CHANNELS[ev]) {
          assert.deepEqual(codesOn(c, ch), ['INVALID_PAYLOAD'], `${ev}(${label(bad)}) kanal ${ch}: ${JSON.stringify(c.all(ch))}`);
        }
        assert.equal(roomFingerprint(code), before, `${ev}(${label(bad)}) mengubah state room`);
      }
    }
  }
});

test('create_room: tanpa payload (undefined/null) tetap membuat room; bentuk lain ditolak', () => {
  const { io } = setup();
  for (const ok of [undefined, null]) {
    const c = io.connect(uid('c_'));
    assert.doesNotThrow(() => c.emit('create_room', ok));
    assert.ok(c.last('room_created')?.code, `create_room(${label(ok)}) harus membuat room`);
    assert.equal(rm.getRoom(c.last('room_created').code).maxGames, 4, 'default tetap 4');
  }
  for (const bad of [42, 'str', true, [], ['x'], () => {}]) {
    const c = io.connect(uid('c_'));
    assert.doesNotThrow(() => c.emit('create_room', bad));
    assert.equal(c.last('room_created'), undefined, `create_room(${label(bad)}) tidak boleh membuat room`);
    assert.deepEqual(codesOn(c, 'error'), ['INVALID_PAYLOAD'], label(bad));
  }
});

// ── Field types ──────────────────────────────────────────────────────────────

test('roomCode bukan string atau terlalu panjang → INVALID_PAYLOAD', () => {
  const { io } = setup();
  const { clients, code } = newRoom(io, 2);
  const tooLong = 'A'.repeat(65);
  for (const ev of ROOM_EVENTS) {
    for (const badCode of [123, {}, [], true, tooLong]) {
      const c = clients[0];
      const before = roomFingerprint(code);
      c.clear();
      assert.doesNotThrow(() => c.emit(ev, { roomCode: badCode, targetId: 'x', cardIds: [] }));
      for (const ch of CHANNELS[ev]) assert.deepEqual(codesOn(c, ch), ['INVALID_PAYLOAD'], `${ev} roomCode=${label(badCode).slice(0, 20)} kanal ${ch}`);
      assert.equal(roomFingerprint(code), before);
    }
  }
});

test('kick_player: targetId bukan string → INVALID_PAYLOAD', () => {
  const { io } = setup();
  const { clients, code } = newRoom(io, 3);
  for (const badTarget of [123, {}, [], true, 'B'.repeat(65)]) {
    clients[0].clear();
    clients[0].emit('kick_player', { roomCode: code, targetId: badTarget });
    assert.deepEqual(codesOn(clients[0], 'kick_error'), ['INVALID_PAYLOAD'], label(badTarget).slice(0, 20));
  }
  assert.equal(rm.getRoom(code).players.length, 3);
});

// ── Missing fields keep old behaviour (compat) ───────────────────────────────

test('field yang hilang pada payload objek tetap memakai kode lama (bukan INVALID_PAYLOAD)', () => {
  const { io } = setup();
  const { clients } = newRoom(io, 2);
  const c = clients[0];
  const expect = [
    ['join_room', 'error', 'ROOM_NOT_FOUND'],
    ['start_game', 'error', 'NOT_IN_ROOM'],
    ['play_cards', 'error', 'NOT_IN_ROOM'],
    ['skip_turn', 'error', 'NOT_IN_ROOM'],
    ['kick_player', 'kick_error', 'NOT_IN_ROOM'],
    ['return_to_room', 'return_room_error', 'NOT_IN_ROOM'],
  ];
  for (const [ev, ch, want] of expect) {
    c.clear();
    c.emit(ev, {});
    assert.deepEqual(codesOn(c, ch), [want], `${ev}({})`);
  }
  c.clear();
  c.emit('leave_room', {});
  const got = codesOn(c, 'leave_room_error');
  assert.equal(got.length, 1);
  assert.ok(!['INVALID_PAYLOAD', 'INTERNAL_ERROR'].includes(got[0]), `leave_room({}) → ${got[0]}`);
});

test('payload sah tetap berjalan normal (regresi): buat, gabung, keluar', () => {
  const { io } = setup();
  const a = io.connect(uid('a_')), b = io.connect(uid('b_'));
  a.emit('create_room', { maxGames: 4 });
  const code = a.last('room_created').code;
  b.emit('join_room', { roomCode: code });
  assert.equal(rm.getRoom(code).players.length, 2);
  b.emit('leave_room', { roomCode: code });
  assert.equal(b.last('room_left').roomCode, code);
  assert.equal(rm.getRoom(code).players.length, 1);
});

// ── Pure helper ──────────────────────────────────────────────────────────────

test('readPayload: tabel perilaku', () => {
  const { readPayload } = require(path.join('..', 'src', 'socket', 'payload.js'));
  assert.deepEqual(readPayload({ roomCode: 'ABC123' }, ['roomCode']), { roomCode: 'ABC123' });
  assert.deepEqual(readPayload({}, ['roomCode']), {});
  assert.equal(readPayload(undefined, ['roomCode']), null);
  assert.equal(readPayload(null, ['roomCode']), null);
  assert.deepEqual(readPayload(undefined, [], { allowEmpty: true }), {});
  assert.deepEqual(readPayload(null, [], { allowEmpty: true }), {});
  assert.equal(readPayload([], [], { allowEmpty: true }), null);
  assert.equal(readPayload({ roomCode: 5 }, ['roomCode']), null);
  assert.equal(readPayload({ roomCode: 'x'.repeat(65) }, ['roomCode']), null);
  assert.deepEqual(readPayload({ roomCode: 'x'.repeat(64) }, ['roomCode']), { roomCode: 'x'.repeat(64) });
});

// ── Safety net ───────────────────────────────────────────────────────────────

function withStubbedConsoleError(fn) {
  const orig = console.error; let calls = 0;
  console.error = () => { calls++; };
  try { return { result: fn(), calls }; } finally { console.error = orig; }
}

test('safety net: exception internal tidak lolos ke Socket.IO, pengirim mendapat INTERNAL_ERROR, server tetap melayani', () => {
  const { io } = setup();
  const a = io.connect(uid('a_')), b = io.connect(uid('b_'));
  a.emit('create_room', { maxGames: 4 });
  const code = a.last('room_created').code;

  const origGetRoom = rm.getRoom;
  rm.getRoom = () => { throw new Error('boom (disengaja oleh test)'); };
  let out;
  try {
    out = withStubbedConsoleError(() => { b.clear(); assert.doesNotThrow(() => b.emit('join_room', { roomCode: code })); });
  } finally { rm.getRoom = origGetRoom; }
  assert.deepEqual(codesOn(b, 'error'), ['INTERNAL_ERROR']);
  assert.equal(out.calls, 1, 'stack harus dilog satu kali');

  b.clear(); b.emit('join_room', { roomCode: code });     // server masih hidup dan benar
  assert.equal(rm.getRoom(code).players.length, 2);
});

test('safety net: event ber-channel khusus (leave_room) tetap melepas klien lewat leave_room_error', () => {
  const { io } = setup();
  const { clients, code } = newRoom(io, 2);
  const orig = rm.leaveRoom;
  rm.leaveRoom = () => { throw new Error('boom'); };
  try { withStubbedConsoleError(() => clients[1].emit('leave_room', { roomCode: code })); } finally { rm.leaveRoom = orig; }
  assert.deepEqual(codesOn(clients[1], 'leave_room_error'), ['INTERNAL_ERROR']);
  assert.deepEqual(codesOn(clients[1], 'error'), ['INTERNAL_ERROR']);
});

test('safety net: exception saat disconnecting tidak lolos dan tidak mengirim apa pun', () => {
  const { io } = setup();
  const { clients } = newRoom(io, 2);
  const orig = rm.markRestrictedDisconnected;
  rm.markRestrictedDisconnected = () => { throw new Error('boom'); };
  try {
    withStubbedConsoleError(() => { clients[1].clear(); assert.doesNotThrow(() => clients[1].disconnect()); });
  } finally { rm.markRestrictedDisconnected = orig; }
  assert.equal(clients[1].all('error').length, 0);
});

runTests(tests);
