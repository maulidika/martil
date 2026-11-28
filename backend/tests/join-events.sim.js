'use strict';
/**
 * S7: what join_room sends. A fresh join used to send the newcomer's own view of the room twice (once to them, once again to
 * the whole room including them), and gave every OTHER member a view personalised for the newcomer. Now the newcomer gets one
 * room_updated with their own view and everyone else gets one room_updated with the neutral view (forPlayerId = null).
 * Real socket handlers + roomManager, fake Socket.IO, real in-memory SQLite (helpers/sim.js).
 *   npm run test:joinevents      (from the backend folder)
 */
const { assert, rm, setup, newRoom, runTests } = require('./helpers/sim');

const plain = (x) => JSON.parse(JSON.stringify(x));
const tests = [];
const test = (name, fn) => tests.push({ name, fn });

let seq = 0;
/** A new connected user with an id nobody used before (one account may only be in one Room). */
function joiner(io) { const id = `joiner-${++seq}`; const c = io.connect(id, 'Joiner'); return { c, id }; }

test('pendatang menerima tepat satu room_updated, berisi pandangannya sendiri', () => {
  const { io } = setup(); const r = newRoom(io, 2);
  const { c: j, id } = joiner(io); j.clear();
  j.emit('join_room', { roomCode: r.code });
  assert.equal(j.all('room_updated').length, 1);
  assert.deepEqual(plain(j.last('room_updated')), plain(rm.publicState(r.code, id)));
  assert.equal(j.last('room_updated').players.length, 3);
});

test('anggota lama menerima tepat satu room_updated, berisi pandangan netral (forPlayerId = null)', () => {
  const { io } = setup(); const r = newRoom(io, 3);
  r.clients.forEach((c) => c.clear());
  const { c: j } = joiner(io); j.emit('join_room', { roomCode: r.code });
  for (const c of r.clients) {
    assert.equal(c.all('room_updated').length, 1);
    assert.deepEqual(plain(c.last('room_updated')), plain(rm.publicState(r.code, null)));
  }
});

test('pandangan yang dipersonalisasi untuk pendatang hanya dihitung untuk pendatang itu', () => {
  const { io } = setup(); const r = newRoom(io, 3);
  const { c: j, id } = joiner(io);
  const orig = rm.publicState; const asked = [];
  rm.publicState = (code, forId) => { asked.push([code, forId]); return orig(code, forId); };
  try { j.emit('join_room', { roomCode: r.code }); } finally { rm.publicState = orig; }
  assert.deepEqual(asked.map((a) => JSON.stringify(a)).sort(), [[r.code, id], [r.code, null]].map((a) => JSON.stringify(a)).sort());   // order is not behavior
});

test('orang di luar room tidak menerima apa pun dari join itu', () => {
  const { io } = setup(); const r = newRoom(io, 2);
  const outsider = io.connect('outsider-1', 'Outsider'); outsider.clear();
  const { c: j } = joiner(io); j.emit('join_room', { roomCode: r.code });
  assert.equal(outsider.all('room_updated').length, 0);
});

test('join ditolak (Room tidak ada / sudah penuh): tidak ada room_updated untuk siapa pun', () => {
  const { io } = setup(); const r = newRoom(io, 4);
  r.clients.forEach((c) => c.clear());
  const { c: j } = joiner(io); j.clear();
  j.emit('join_room', { roomCode: r.code });          // room is full
  j.emit('join_room', { roomCode: 'NOPE00' });
  assert.deepEqual(j.all('error').map((e) => e.code).length, 2);
  assert.equal(j.all('room_updated').length, 0);
  for (const c of r.clients) assert.equal(c.all('room_updated').length, 0);
});

runTests(tests);
