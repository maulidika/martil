'use strict';
/**
 * S6: the shape of the game-flow events sent to clients is defined once, in src/socket/outgoing.js; socketHandler.js and
 * gameFlow.js only choose when to emit. Real builders, plus the real socket handlers/engine with a fake Socket.IO.
 *   npm run test:outgoing      (from the backend folder)
 *
 *   - each builder returns exactly its documented fields and never changes its arguments
 *   - LOCATION: every emit of these events in socketHandler.js / gameFlow.js goes through its builder (no object literal)
 *   - WIRING: over a whole Set played through the real handlers, each event that reaches a client carries exactly those fields
 */
const fs = require('node:fs');
const path = require('node:path');
const { assert, setup, newRoom, playSetToEnd, runTests } = require('./helpers/sim');
const outgoing = require('../src/socket/outgoing');

const SRC = path.join(__dirname, '../src');
const read = (rel) => fs.readFileSync(path.join(SRC, rel), 'utf8');
const stripComments = (code) => code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1');
const clone = (x) => JSON.parse(JSON.stringify(x));

// event name → [builder name, exact field names the clients receive]
const SHAPES = {
  turn_changed:   ['turnChanged',   ['currentTurn']],
  rally_ended:    ['rallyEnded',    ['nextPlayer']],
  game_started:   ['gameStarted',   ['currentTurn', 'gameNumber']],
  cards_played:   ['cardsPlayed',   ['combo', 'playerId']],
  player_skipped: ['playerSkipped', ['playerId']],
  auto_skipped:   ['autoSkipped',   ['playerId']],
  game_over:      ['gameOver',      ['gameHistory', 'scores', 'setScores', 'winnerId']],
  set_over:       ['setOver',       ['gameHistory', 'profiles', 'rankings', 'setScores']],
};

const room = { currentGame: { currentTurn: 'u2' }, setScores: { u1: 3, u2: -3 }, gameHistory: [{ gameNumber: 1 }] };
const playEvent = { combo: { type: 'single', cards: [{ id: '3D' }] }, nextPlayer: 'u3', winnerId: 'u1', scores: [{ id: 'u1', score: 9 }],
  rankings: [{ id: 'u1', rank: 1 }], setScores: { u1: 9 }, gameHistory: [{ gameNumber: 1 }], profiles: { u1: { name: 'A' } } };

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

test('builder: bentuk tiap payload persis (nilai dan nama field)', () => {
  assert.deepEqual(outgoing.turnChanged(room), { currentTurn: 'u2' });
  assert.deepEqual(outgoing.rallyEnded(playEvent), { nextPlayer: 'u3' });
  assert.deepEqual(outgoing.gameStarted(2, room), { gameNumber: 2, currentTurn: 'u2' });
  assert.deepEqual(outgoing.cardsPlayed('u1', playEvent), { playerId: 'u1', combo: playEvent.combo });
  assert.deepEqual(outgoing.playerSkipped('u4'), { playerId: 'u4' });
  assert.deepEqual(outgoing.autoSkipped('u4'), { playerId: 'u4' });
  assert.deepEqual(outgoing.gameOver(room, playEvent), { winnerId: 'u1', scores: playEvent.scores, setScores: room.setScores, gameHistory: room.gameHistory });
  assert.deepEqual(outgoing.setOver(playEvent), { rankings: playEvent.rankings, setScores: playEvent.setScores, gameHistory: playEvent.gameHistory, profiles: playEvent.profiles });
});

test('builder: field persis yang terdaftar (tidak ada tambahan diam-diam)', () => {
  const made = {
    turn_changed: outgoing.turnChanged(room), rally_ended: outgoing.rallyEnded(playEvent), game_started: outgoing.gameStarted(1, room),
    cards_played: outgoing.cardsPlayed('u1', playEvent), player_skipped: outgoing.playerSkipped('u1'), auto_skipped: outgoing.autoSkipped('u1'),
    game_over: outgoing.gameOver(room, playEvent), set_over: outgoing.setOver(playEvent),
  };
  for (const [ev, [, keys]] of Object.entries(SHAPES)) assert.deepEqual(Object.keys(made[ev]).sort(), keys, ev);
  assert.deepEqual(Object.keys(outgoing).sort(), Object.values(SHAPES).map(([b]) => b).sort(), 'builder tanpa entri SHAPES (atau sebaliknya)');
});

const deepFreeze = (x) => { if (x && typeof x === 'object') { Object.values(x).forEach(deepFreeze); Object.freeze(x); } return x; };
test('builder: murni: argumen (dibekukan) tidak bisa diubah, hasil sama dua kali', () => {
  const r = deepFreeze(clone(room)), e = deepFreeze(clone(playEvent));        // a builder that writes to its argument throws
  for (const f of [() => outgoing.turnChanged(r), () => outgoing.rallyEnded(e), () => outgoing.gameStarted(1, r), () => outgoing.cardsPlayed('u1', e),
    () => outgoing.playerSkipped('u1'), () => outgoing.autoSkipped('u1'), () => outgoing.gameOver(r, e), () => outgoing.setOver(e)]) assert.deepEqual(f(), f());
});

// ── location ─────────────────────────────────────────────────────────────────────────────────────────
const emitCalls = (code, event) => [...stripComments(code).matchAll(new RegExp(`\\.emit\\('${event}',\\s*([^\\n]*)`, 'g'))].map((m) => m[1]);
test('pemeriksa lokasi: emit dengan object literal terdeteksi, dengan builder tidak', () => {
  assert.deepEqual(emitCalls("io.emit('turn_changed', { currentTurn: 1 });", 'turn_changed'), ['{ currentTurn: 1 });']);
  assert.deepEqual(emitCalls("io.emit('turn_changed', outgoing.turnChanged(room));", 'turn_changed'), ['outgoing.turnChanged(room));']);
  assert.deepEqual(emitCalls("// io.emit('turn_changed', { x: 1 })", 'turn_changed'), []);
});
test('lokasi: setiap emit event ini di socketHandler.js/gameFlow.js memakai builder-nya', () => {
  const sources = ['socket/socketHandler.js', 'socket/gameFlow.js'].map(read);
  for (const [ev, [builder]] of Object.entries(SHAPES)) {
    const calls = sources.flatMap((s) => emitCalls(s, ev));
    assert.ok(calls.length >= 1, `${ev}: tidak ada emit ditemukan`);
    for (const c of calls) assert.ok(c.startsWith(`outgoing.${builder}(`), `${ev}: emit harus memakai outgoing.${builder}(...), ditemukan: ${c}`);
  }
});

// ── wiring ───────────────────────────────────────────────────────────────────────────────────────────
test('wiring: sepanjang satu Set penuh, tiap event yang sampai ke klien membawa field persis yang terdaftar', async () => {
  const { io } = setup();
  const r = newRoom(io, 4, { start: true });
  await playSetToEnd(r.clients, r.users, r.code);
  const c = r.clients[0];
  for (const ev of ['cards_played', 'turn_changed', 'game_started', 'game_over', 'set_over']) assert.ok(c.all(ev).length >= 1, `${ev} harus muncul`);
  assert.equal(c.all('game_started').length, 4); assert.equal(c.all('game_over').length, 4); assert.equal(c.all('set_over').length, 1);
  for (const [ev, [, keys]] of Object.entries(SHAPES)) for (const payload of c.all(ev)) assert.deepEqual(Object.keys(payload).sort(), keys, ev);
});

runTests(tests);
