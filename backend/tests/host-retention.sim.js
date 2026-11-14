'use strict';
/**
 * Host retention across disconnects (real socketHandler.js + roomManager.js, fake Socket.IO, simulated clock).
 *   npm run test:hostkeep      (from the backend folder)
 *
 * Rules covered:
 *   - a temporary disconnect NEVER moves the Host: not at 0 s, not at 59 s, not even at exactly 60 s (any Room status)
 *   - a Host who reconnects within the grace period is still the Host
 *   - the Host moves only when the grace period (60 s) has really passed, or the Host really leaves (leave_room)
 *   - when a game is in progress the old Host KEEPS the seat, so the Host role returns to them on reconnect
 *     (unless the interim Host is no longer the Host: any other Host change cancels it)
 *   - host_changed events say why and after how long (this is what the server log shows as ROOM_HOST_CHANGED)
 *   - ids never change; the reconnect mechanism itself (session_restored, player_reconnected) is unchanged
 */
const { assert, rm, setup, newRoom, advance, runTests } = require('./helpers/sim');

const tests = [];
const test = (name, fn) => tests.push({ name, fn });
const GRACE = rm.RECONNECT_WINDOW_MS;           // 60 000 ms
const hostOf = (code) => rm.getRoom(code).hostId;
const memberIds = (code) => rm.getRoom(code).players.map(p => p.id);

/** Room with the Host (P1) already disconnected. */
function hostDown(status, n = 4) {
  const env = setup();
  const R = newRoom(env.io, n, { start: status === 'playing' });
  R.clients[0].disconnect();                    // P1 is the Host
  return { ...env, ...R };
}
const finishSetFast = (R) => {                  // leaves the Room in status 'done' (everybody connected)
  const g = () => rm.getRoom(R.code).currentGame;
  const room = rm.getRoom(R.code);
  room.maxGames = 1;
  const turn = g().currentTurn; g().hands[turn] = [g().hands[turn][0]];
  R.clients[R.users.indexOf(turn)].emit('play_cards', { roomCode: R.code, cardIds: [g().hands[turn][0].id] });
  assert.equal(room.status, 'done');
};

// ── A temporary disconnect never moves the Host ──────────────────────────────

for (const status of ['waiting', 'playing']) {
  test(`${status}: Host terputus sementara tidak berpindah (0, 1, 30, 59 dtk, dan tepat 60 dtk)`, () => {
    const { handle, users, code } = hostDown(status);
    for (const at of [0, 1, 30, 59, 60]) {
      const target = at * 1000, already = rm.getRoom(code).players[0].disconnectedAt;
      advance(Math.max(0, already + target - Date.now()));
      handle.sweep();
      assert.equal(hostOf(code), users[0], `Host berpindah pada ${at} dtk`);
      assert.ok(memberIds(code).includes(users[0]), `kursi Host hilang pada ${at} dtk`);
    }
  });
}

test('done (Result): Host terputus sementara tidak berpindah sampai tepat 60 dtk', () => {
  const env = setup(); const R = newRoom(env.io, 4, { start: true }); finishSetFast(R);
  R.clients[0].disconnect(); const t0 = rm.getRoom(R.code).players[0].disconnectedAt;
  for (const at of [0, 30, 59, 60]) { advance(t0 + at * 1000 - Date.now()); env.handle.sweep(); assert.equal(hostOf(R.code), R.users[0], `${at} dtk`); }
});

test('batas tepat: berpindah baru setelah LEBIH dari 60 dtk (60.001 dtk)', () => {
  const { handle, users, code } = hostDown('playing');
  const t0 = rm.getRoom(code).players[0].disconnectedAt;
  advance(t0 + GRACE - Date.now()); handle.sweep(); assert.equal(hostOf(code), users[0]);
  advance(1); handle.sweep(); assert.notEqual(hostOf(code), users[0]);
});

test('pemain non-Host terputus/kembali (bahkan lewat 60 dtk di game) tidak mengubah Host', () => {
  const env = setup(); const R = newRoom(env.io, 4, { start: true });
  R.clients[2].disconnect(); advance(GRACE + 5000); env.handle.sweep();
  assert.equal(hostOf(R.code), R.users[0]);
  const back = env.io.connect(R.users[2]); back.emit('resume_session');
  assert.equal(hostOf(R.code), R.users[0]);
});

// ── A Host who comes back in time stays the Host ─────────────────────────────

for (const status of ['waiting', 'playing']) {
  test(`${status}: Host kembali pada 45 dtk tetap Host; sesi dipulihkan; pemain lain diberi tahu`, () => {
    const { io, handle, clients, users, code } = hostDown(status);
    advance(45_000); handle.sweep();
    clients[1].clear();
    const back = io.connect(users[0]); back.emit('resume_session');
    assert.equal(hostOf(code), users[0]);
    assert.equal(back.last('session_restored').hostId, users[0]);
    assert.ok(clients[1].last('player_reconnected'), 'player_reconnected tetap dikirim');
    advance(60_000); handle.sweep();                           // lama sesudah itu pun tetap Host
    assert.equal(hostOf(code), users[0]);
  });
}

test('Host kembali di antara 60 dtk dan sweeper berikutnya (game berjalan): tetap Host, pemain lain melihat Host asli', () => {
  const { io, clients, users, code } = hostDown('playing');
  advance(GRACE + 5000);                                       // sweeper belum jalan
  clients[1].clear();
  const back = io.connect(users[0]); back.emit('resume_session');
  assert.equal(hostOf(code), users[0]);
  assert.equal(back.last('session_restored').hostId, users[0]);
  assert.equal(clients[1].last('game_state').hostId, users[0]);
});

// ── The Host moves only after the grace period ───────────────────────────────

test('WAITING: setelah lebih dari 60 dtk kursi Host dihapus dan Host berpindah ke pemain terhubung; kembali = EXPIRED', () => {
  const { io, handle, users, code } = hostDown('waiting');
  advance(GRACE + 1000);
  const events = handle.sweep();
  assert.equal(hostOf(code), users[1]);
  assert.ok(!memberIds(code).includes(users[0]));
  const ev = events.find(e => e.type === 'host_changed');
  assert.equal(ev.reason, 'HOST_SEAT_REMOVED'); assert.equal(ev.previousHostId, users[0]); assert.equal(ev.hostId, users[1]);
  const back = io.connect(users[0]); back.emit('resume_session');
  assert.equal(back.last('session_none')?.reason, 'EXPIRED');
  assert.equal(hostOf(code), users[1], 'Host tidak boleh kembali ke pemain yang kursinya sudah dihapus');
});

test('PLAYING: lewat 60 dtk Host berpindah ke pemain terhubung berikutnya tetapi kursi lama dipertahankan; event menjelaskan sebabnya', () => {
  const { handle, clients, users, code } = hostDown('playing');
  advance(GRACE + 1000); clients[1].clear();
  const events = handle.sweep();
  assert.equal(hostOf(code), users[1]);
  assert.ok(memberIds(code).includes(users[0]), 'kursi Host lama harus dipertahankan selama game');
  const ev = events.find(e => e.type === 'host_changed');
  assert.equal(ev.reason, 'HOST_DISCONNECT_EXPIRED'); assert.equal(ev.previousHostId, users[0]);
  assert.ok(ev.hostDisconnectedForMs > GRACE && ev.hostDisconnectedForMs < GRACE + 5000, `hostDisconnectedForMs=${ev.hostDisconnectedForMs}`);
  assert.equal(clients[1].last('game_state').hostId, users[1], 'pemain lain menerima Host baru');
});

test('PLAYING: Host yang kembali setelah digeser mendapat peran Host kembali; semua pemain diberi tahu; id tidak berubah', () => {
  const { io, handle, clients, users, code } = hostDown('playing');
  advance(GRACE + 30_000); handle.sweep();
  assert.equal(hostOf(code), users[1]);
  clients[2].clear();
  const back = io.connect(users[0]); back.emit('resume_session');
  assert.equal(hostOf(code), users[0]);
  assert.equal(back.last('session_restored').hostId, users[0]);
  assert.equal(clients[2].last('game_state').hostId, users[0], 'pemain lain melihat Host kembali');
  assert.deepEqual(memberIds(code), users, 'urutan dan ID pemain tidak berubah');
  assert.equal(rm.getRoom(code).hostDisplacement, null);
});

test('PLAYING: pemulihan Host hanya sekali; terputus lagi sebentar tidak memindahkan Host', () => {
  const { io, handle, users, code } = hostDown('playing');
  advance(GRACE + 1000); handle.sweep();
  const back = io.connect(users[0]); back.emit('resume_session');
  assert.equal(hostOf(code), users[0]);
  back.disconnect(); advance(30_000); handle.sweep();
  assert.equal(hostOf(code), users[0]);
});

test('PLAYING: hanya Host yang digeser yang boleh mengambil perannya kembali; pemain lain yang kembali tidak merebutnya', () => {
  const { io, handle, clients, users, code } = hostDown('playing');
  advance(GRACE + 1000); handle.sweep();
  assert.equal(hostOf(code), users[1]);
  clients[2].disconnect();
  const back3 = io.connect(users[2]); back3.emit('resume_session');
  assert.equal(hostOf(code), users[1], 'P3 tidak boleh mengambil Host');
  clients[1].disconnect(); advance(30_000);
  const back2 = io.connect(users[1]); back2.emit('resume_session');
  assert.equal(hostOf(code), users[1], 'Host sementara yang kembali tetap Host');
});

test('event pemulihan Host menyebut alasan dan Host sementara sebelumnya (log ROOM_HOST_CHANGED)', () => {
  const { handle, users, code } = hostDown('playing');
  advance(GRACE + 1000); handle.sweep();
  const r = rm.resumeSession(users[0], 'sock-reclaim');
  const ev = r.events.find(e => e.type === 'host_changed');
  assert.deepEqual({ reason: ev.reason, hostId: ev.hostId, previousHostId: ev.previousHostId }, { reason: 'HOST_RECONNECTED', hostId: users[0], previousHostId: users[1] });
});

test('WAITING: Host yang kursinya sudah dihapus lalu masuk lagi sebagai pemain biasa TIDAK merebut Host saat refresh', () => {
  const { io, handle, users, code } = hostDown('waiting');
  advance(GRACE + 1000); handle.sweep();
  assert.equal(hostOf(code), users[1]);
  const again = io.connect(users[0]); again.emit('join_room', { roomCode: code });      // masuk lagi sebagai pemain baru
  assert.ok(memberIds(code).includes(users[0]));
  assert.equal(hostOf(code), users[1]);
  again.disconnect(); const refreshed = io.connect(users[0]); refreshed.emit('resume_session');
  assert.equal(hostOf(code), users[1], 'refresh tidak boleh mengembalikan Host');
});

// ── The Host really leaves / other Host changes cancel the reclaim ───────────

test('Host benar-benar keluar (leave_room): Host berpindah seketika; tidak ada pemulihan', () => {
  const env = setup(); const R = newRoom(env.io, 3);
  R.clients[0].emit('leave_room', { roomCode: R.code });
  assert.equal(hostOf(R.code), R.users[1]);
  assert.equal(rm.getRoom(R.code).hostDisplacement, null);
});

test('pemulihan dibatalkan bila Host sementara sudah tidak menjadi Host (perubahan Host lain)', () => {
  const { io, handle, users, code } = hostDown('playing');
  advance(GRACE + 1000); handle.sweep();
  assert.equal(hostOf(code), users[1]);
  rm.getRoom(code).hostId = users[2];                          // some other change made P3 the Host
  const back = io.connect(users[0]); back.emit('resume_session');
  assert.equal(hostOf(code), users[2], 'Host P3 tidak boleh direbut');
});

test('pemulihan dibatalkan bila Host sementara keluar dari Room (leaveRoom menghapus catatan)', () => {
  const { io, handle, users, code } = hostDown('playing');
  advance(GRACE + 1000); handle.sweep();
  const room = rm.getRoom(code);
  assert.deepEqual(room.hostDisplacement, { from: users[0], to: users[1] });
  room.status = 'waiting';                                      // as if the set ended and the Room was reset (white-box)
  assert.ok(rm.leaveRoom(code, users[1]).ok);
  assert.equal(room.hostDisplacement, null);
  const newHost = hostOf(code);
  const back = io.connect(users[0]); back.emit('resume_session');
  assert.equal(hostOf(code), newHost, 'Host yang baru tidak boleh diganti');
});

test('pemain yang sudah tidak ada di Room tidak bisa merebut Host (catatan basi)', () => {
  const { handle, users, code } = hostDown('playing');
  advance(GRACE + 1000); handle.sweep();
  const room = rm.getRoom(code);
  room.players.splice(0, 1);                                    // P1 no longer in the Room (white-box)
  assert.equal(rm.resumeSession(users[0], 'sock-x').ok, false);
  assert.equal(hostOf(code), users[1]);
});

// ── Unchanged reconnect behaviour ────────────────────────────────────────────

test('reconnect lama tetap utuh: tab lama mendapat session_replaced dan peran Host tidak bergeser oleh tab ganda', () => {
  const env = setup(); const R = newRoom(env.io, 4, { start: true });
  const second = env.io.connect(R.users[0]); second.emit('resume_session');   // tab kedua, akun sama (tab pertama masih terhubung)
  assert.equal(hostOf(R.code), R.users[0]);
  assert.ok(second.last('session_restored'));
  assert.ok(R.clients[0].last('session_replaced'), 'tab lama harus diberi tahu bahwa sesinya diambil alih');
});

runTests(tests);
