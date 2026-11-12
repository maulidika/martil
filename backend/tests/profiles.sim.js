'use strict';
/**
 * Public player profiles (real socketHandler.js + roomManager.js, fake Socket.IO): the server sends the real
 * username of every player in `profiles`, keyed by the internal player id.
 *   npm run test:profiles      (from the backend folder)
 *
 * Covered:
 *   - every Room state carries `profiles: { [playerId]: { username } }` (create, join, resume, game state)
 *   - WHITELIST: only `username` is ever sent (extra token claims such as email or role never leak)
 *   - the internal id never depends on the username; `players` keeps its old shape (no duplicate name field)
 *   - invalid usernames (non-string, empty, over-long) produce no profile instead of an error; names are trimmed
 *   - names follow membership: leaving, Kick or seat expiry removes the entry
 *   - names are frozen into the set result (set_over / setResult) so Result stays correct after players leave
 *   - the view of a player kicked from Result still has every name
 */
const { TURN_TIMEOUT_MS } = require('../src/game/engine.js');
const { assert, rm, setup, uid, advance, runTests } = require('./helpers/sim');

// Installed AFTER the helper: this layer decides when the 5 s gap between games ends (needed to finish a set).
const gapCallbacks = [];
const prevSetTimeout = global.setTimeout;
const prevClearTimeout = global.clearTimeout;
global.setTimeout = (fn, ms, ...a) => {
  if (ms === 5000) { const t = { fn, fake: true }; gapCallbacks.push(t); return t; }
  if (ms === TURN_TIMEOUT_MS) return { fn, fake: true };
  return prevSetTimeout(fn, ms, ...a);
};
global.clearTimeout = (h) => (h && typeof h === 'object' && h.fake ? undefined : prevClearTimeout(h));
const endGap = () => { const t = gapCallbacks.shift(); assert.ok(t, 'tidak ada jeda yang menunggu'); t.fn(); };

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

const NAMES = ['Budi', 'Sari', 'Andi', 'Dewi'];

/** n players with real usernames; the first one hosts. Returns { clients, users, code }. */
function makeRoom(io, n = 4, { maxGames = 3 } = {}) {
  const users = NAMES.slice(0, n).map((name) => uid(`${name.toLowerCase()}_`));
  const clients = users.map((u, i) => io.connect(u, NAMES[i]));
  clients[0].emit('create_room', { maxGames });
  const code = clients[0].last('room_created').code;
  for (let i = 1; i < n; i++) clients[i].emit('join_room', { roomCode: code });
  return { clients, users, code };
}
const expectProfiles = (users, names) => Object.fromEntries(users.map((u, i) => [u, { username: names[i] }]));

/** Play a whole set quickly: the player on turn is left with one card and plays it. */
function finishSet({ clients, users, code }) {
  const game = () => rm.getRoom(code).currentGame;
  const finishGame = () => {
    const turn = game().currentTurn;
    game().hands[turn] = [game().hands[turn][0]];
    clients[users.indexOf(turn)].emit('play_cards', { roomCode: code, cardIds: [game().hands[turn][0].id] });
  };
  for (let i = 1; i < rm.getRoom(code).maxGames; i++) { finishGame(); endGap(); }
  finishGame();
  assert.equal(rm.getRoom(code).status, 'done');
}

// ── Names in every Room state ────────────────────────────────────────────────

test('room_created dan room_updated membawa profiles: nama host dan pemain yang bergabung', () => {
  const { io } = setup();
  const [a, b] = [uid('a_'), uid('b_')];
  const ca = io.connect(a, 'Budi'), cb = io.connect(b, 'Sari');
  ca.emit('create_room', { maxGames: 4 });
  const created = ca.last('room_created');
  assert.deepEqual(ca.last('room_updated').profiles, { [a]: { username: 'Budi' } }, 'state pertama setelah membuat room');
  cb.emit('join_room', { roomCode: created.code });
  const upd = ca.last('room_updated');
  assert.deepEqual(upd.profiles, { [a]: { username: 'Budi' }, [b]: { username: 'Sari' } });
  assert.deepEqual(cb.last('room_updated').profiles, upd.profiles, 'semua pemain menerima peta yang sama');
});

test('resume (refresh/reconnect) membawa profiles di session_restored', () => {
  const { io } = setup();
  const R = makeRoom(io, 3);
  R.clients[1].disconnect();
  const back = io.connect(R.users[1], 'Sari');
  back.emit('resume_session');
  assert.deepEqual(back.last('session_restored').profiles, expectProfiles(R.users, NAMES));
});

test('state game (game_state / session_restored saat bermain) membawa profiles semua pemain', () => {
  const { io } = setup();
  const R = makeRoom(io, 4);
  R.clients[0].emit('start_game', { roomCode: R.code });
  for (const c of R.clients) assert.deepEqual(c.last('game_state').profiles, expectProfiles(R.users, NAMES));
  R.clients[2].disconnect();
  const back = io.connect(R.users[2], 'Andi'); back.emit('resume_session');
  assert.deepEqual(back.last('session_restored').profiles, expectProfiles(R.users, NAMES));
});

// ── Whitelist and identity ───────────────────────────────────────────────────

test('daftar putih: klaim tambahan di token (email, role, passwordHash) tidak pernah dikirim', () => {
  const { io } = setup();
  const a = uid('a_'), b = uid('b_');
  const ca = io.connect(a, 'Budi', { email: 'budi@mail.test', role: 'admin', passwordHash: '$2a$secret', token: 'jwt.secret.value' });
  const cb = io.connect(b, 'Sari');
  ca.emit('create_room', { maxGames: 4 });
  const code = ca.last('room_created').code;
  cb.emit('join_room', { roomCode: code });
  ca.emit('start_game', { roomCode: code });                                  // also covers error payloads etc.
  const wire = JSON.stringify([ca.socket.inbox, cb.socket.inbox, rm.publicState(code, b)]);
  assert.ok(ca.socket.inbox.length >= 3 && cb.socket.inbox.length >= 2, 'tidak ada pesan yang diperiksa');
  for (const secret of ['budi@mail.test', 'admin', '$2a$secret', 'jwt.secret.value', 'passwordHash', 'email']) assert.ok(!wire.includes(secret), `${secret} bocor`);
  for (const id of Object.keys(ca.last('room_updated').profiles)) assert.deepEqual(Object.keys(ca.last('room_updated').profiles[id]), ['username']);
});

test('players tetap berbentuk { id, connected, inRoom }: nama tidak digandakan di dua tempat', () => {
  const { io } = setup();
  const R = makeRoom(io, 2);
  for (const p of rm.publicState(R.code, R.users[0]).players) assert.deepEqual(Object.keys(p).sort(), ['connected', 'id', 'inRoom']);
});

test('id internal tidak bergantung pada username: username sama tetap dua pemain berbeda', () => {
  const { io } = setup();
  const a = uid('a_'), b = uid('b_');
  const ca = io.connect(a, 'Kembar'), cb = io.connect(b, 'Kembar');
  ca.emit('create_room', { maxGames: 4 }); cb.emit('join_room', { roomCode: ca.last('room_created').code });
  const state = rm.publicState(ca.last('room_created').code, a);
  assert.deepEqual(state.players.map(p => p.id), [a, b]);
  assert.deepEqual(state.profiles, { [a]: { username: 'Kembar' }, [b]: { username: 'Kembar' } });
  assert.ok(![a, b].some(id => id === 'Kembar'));
});

// ── Invalid usernames ────────────────────────────────────────────────────────

test('username tidak valid (bukan string, kosong, spasi, >30 karakter) → tanpa profil dan tanpa error', () => {
  const { io } = setup();
  for (const bad of [null, 123, '', '   ', 'x'.repeat(31), {}, [], true]) {
    const u = uid('bad_'); const c = io.connect(u, bad);
    c.emit('create_room', { maxGames: 4 });
    const code = c.last('room_created')?.code;
    assert.ok(code, `room tidak jadi dibuat untuk username ${JSON.stringify(bad)}`);
    assert.deepEqual(rm.publicState(code, u).profiles, {}, `profil muncul untuk ${JSON.stringify(bad)}`);
    assert.equal(c.all('error').length, 0);
  }
});

test('username dirapikan (trim) dan batas 30 karakter masih diterima', () => {
  const { io } = setup();
  const u = uid('t_'); const c = io.connect(u, '  Budi  ');
  c.emit('create_room', { maxGames: 4 });
  assert.deepEqual(rm.publicState(c.last('room_created').code, u).profiles, { [u]: { username: 'Budi' } });
  const v = uid('t_'); const long = 'y'.repeat(30); const d = io.connect(v, long);
  d.emit('create_room', { maxGames: 4 });
  assert.equal(rm.publicState(d.last('room_created').code, v).profiles[v].username, long);
});

test('rm.createRoom / rm.joinRoom tanpa argumen username tetap bekerja (kompatibel)', () => {
  const { io } = setup();
  const r = rm.createRoom('legacy_host'); assert.ok(r.ok);
  assert.deepEqual(rm.publicState(r.room.code, 'legacy_host').profiles, {});
  assert.ok(rm.joinRoom(r.room.code, 'legacy_guest', 'Tamu').ok);
  assert.deepEqual(rm.publicState(r.room.code, 'legacy_host').profiles, { legacy_guest: { username: 'Tamu' } });
});

// ── Names follow membership ──────────────────────────────────────────────────

test('leave_room (waiting) menghapus nama pemain itu dari profiles', () => {
  const { io } = setup();
  const R = makeRoom(io, 3);
  R.clients[2].emit('leave_room', { roomCode: R.code });
  assert.deepEqual(rm.publicState(R.code, R.users[0]).profiles, expectProfiles(R.users.slice(0, 2), NAMES));
  assert.deepEqual(R.clients[0].last('room_updated').profiles, expectProfiles(R.users.slice(0, 2), NAMES));
});

test('Kick di Room menghapus nama pemain itu dari profiles', () => {
  const { io } = setup();
  const R = makeRoom(io, 3);
  R.clients[0].emit('kick_player', { roomCode: R.code, targetId: R.users[1] });
  assert.deepEqual(Object.keys(rm.publicState(R.code, R.users[0]).profiles).sort(), [R.users[0], R.users[2]].sort());
});

test('kursi kedaluwarsa (terputus >60 dtk) menghapus nama pemain itu', () => {
  const { io, handle } = setup();
  const R = makeRoom(io, 3);
  R.clients[2].disconnect(); advance(61_000); handle.sweep();
  assert.deepEqual(Object.keys(rm.publicState(R.code, R.users[0]).profiles).sort(), [R.users[0], R.users[1]].sort());
});

test('bergabung lagi dengan username lain: profil mengikuti entri yang baru', () => {
  const { io } = setup();
  const a = uid('a_'), b = uid('b_');
  const ca = io.connect(a, 'Budi'); ca.emit('create_room', { maxGames: 4 });
  const code = ca.last('room_created').code;
  const cb = io.connect(b, 'Sari'); cb.emit('join_room', { roomCode: code }); cb.emit('leave_room', { roomCode: code });
  const cb2 = io.connect(b, 'SariBaru'); cb2.emit('join_room', { roomCode: code });
  assert.equal(rm.publicState(code, a).profiles[b].username, 'SariBaru');
});

// ── Set result ───────────────────────────────────────────────────────────────

test('nama dibekukan di hasil set: set_over.profiles dan setResult.profiles memuat 4 nama', () => {
  const { io } = setup();
  const R = makeRoom(io, 4);
  R.clients[0].emit('start_game', { roomCode: R.code });
  finishSet(R);
  for (const c of R.clients) assert.deepEqual(c.last('set_over').profiles, expectProfiles(R.users, NAMES));
  assert.deepEqual(rm.getRoom(R.code).setResult.profiles, expectProfiles(R.users, NAMES));
});

test('setelah satu pemain keluar dari Result: room_updated tidak memuat dia lagi, tetapi setResult tetap memuat 4 nama', () => {
  const { io } = setup();
  const R = makeRoom(io, 4);
  R.clients[0].emit('start_game', { roomCode: R.code });
  finishSet(R);
  R.clients[3].emit('leave_room', { roomCode: R.code });
  assert.deepEqual(Object.keys(rm.publicState(R.code, R.users[0]).profiles).sort(), R.users.slice(0, 3).sort());
  assert.deepEqual(rm.getRoom(R.code).setResult.profiles, expectProfiles(R.users, NAMES));
  R.clients[0].emit('resume_session');
  assert.deepEqual(R.clients[0].last('session_restored').setResult.profiles, expectProfiles(R.users, NAMES));
});

test('pemain yang di-Kick dari Result tetap melihat semua nama di hasil set (setelah refresh)', () => {
  const { io } = setup();
  const R = makeRoom(io, 4);
  R.clients[0].emit('start_game', { roomCode: R.code });
  finishSet(R);
  R.clients[0].emit('kick_player', { roomCode: R.code, targetId: R.users[2] });
  assert.ok(R.clients[2].last('kicked_from_result'));
  R.clients[2].disconnect();
  const back = io.connect(R.users[2], 'Andi'); back.emit('resume_session');
  const restored = back.last('session_restored');
  assert.equal(restored.restricted, true);
  assert.deepEqual(restored.setResult.profiles, expectProfiles(R.users, NAMES));
});

runTests(tests);
