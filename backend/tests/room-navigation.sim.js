'use strict';
/**
 * Simulasi multiplayer untuk navigasi room:
 *   - Exit Room (sebelum game mulai) dan Back to Menu Utama (dari Scoreboard) → leave_room
 *   - Back to Room (dari Scoreboard) → return_to_room
 *
 *   npm run test:nav      (dari folder backend)
 *
 * Satu set penuh (4 game) dimainkan oleh bot di engine ASLI, jadi transisi
 * playing → done → waiting dan flag inRoom diuji dari kode yang sama dengan produksi.
 */
const { assert, rm, setup, newRoom, uid, player, advance, playSetToEnd, runTests } = require('./helpers/sim');

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

/** Room 4 pemain yang set-nya sudah selesai (status done, semua di Scoreboard). */
async function finishedRoom() {
  const env = setup();
  const room = newRoom(env.io, 4, { start: true });
  await playSetToEnd(room.clients, room.users, room.code);
  return { ...env, ...room };
}
const members = (code) => rm.getRoom(code).players.map(p => p.id);
const noDisconnectEvents = (clients) => clients.every(c => c.all('player_disconnected').length === 0);

// ── Scoreboard ───────────────────────────────────────────────────────────────

test('satu set penuh selesai: semua menerima set_over dengan 4 game di riwayat; semua pemain di Scoreboard', async () => {
  const { clients, code } = await finishedRoom();
  const room = rm.getRoom(code);
  assert.equal(room.status, 'done');
  for (const c of clients) {
    const so = c.last('set_over');
    assert.equal(so.rankings.length, 4);
    assert.equal(so.gameHistory.length, 4, 'riwayat harus memuat game terakhir');
  }
  assert.ok(room.players.every(p => p.inRoom === false));
  assert.equal(room.setResult.gameHistory.length, 4);
});

test('Back to Room: pemain tetap anggota, room di-reset ke waiting, pemain lain tidak terganggu', async () => {
  const { users, clients, code } = await finishedRoom();
  const hostBefore = rm.getRoom(code).hostId;
  clients.forEach(c => c.clear());
  clients[1].emit('return_to_room', { roomCode: code });

  const room = rm.getRoom(code);
  const back = clients[1].last('room_returned');
  assert.ok(back, 'room_returned tidak dikirim');
  assert.equal(back.status, 'waiting');
  assert.equal(back.game, null);
  assert.deepEqual(back.setScores, {});
  assert.deepEqual(back.gameHistory, []);
  assert.equal(room.setId, null);
  assert.equal(room.players.length, 4, 'keanggotaan harus tetap');
  assert.equal(room.hostId, hostBefore);
  assert.equal(player(code, users[1]).inRoom, true);
  assert.deepEqual(room.players.filter(p => p.inRoom).map(p => p.id), [users[1]]);
  // pemain lain di Scoreboard menerima update room, tanpa disconnect/state game
  for (const i of [0, 2, 3]) {
    assert.equal(clients[i].last('room_updated').status, 'waiting');
    assert.equal(clients[i].all('game_state').length, 0);
    assert.equal(clients[i].all('room_left').length, 0);
  }
  assert.ok(noDisconnectEvents(clients));
  assert.ok(room.players.every(p => p.connected));
  // hasil set tetap tersedia untuk yang belum kembali
  assert.equal(room.setResult.gameHistory.length, 4);
});

test('Back to Room idempoten (tekan dua kali tidak mereset ulang atau duplikasi)', async () => {
  const { clients, code } = await finishedRoom();
  clients[0].emit('return_to_room', { roomCode: code });
  clients[0].emit('return_to_room', { roomCode: code });
  assert.equal(clients[0].all('room_returned').length, 2);
  assert.equal(rm.getRoom(code).players.length, 4);
  assert.equal(rm.getRoom(code).status, 'waiting');
});

test('host tidak bisa mulai sebelum keempat pemain kembali; setelah semua kembali set baru mulai bersih', async () => {
  const { users, clients, code } = await finishedRoom();
  const hostIdx = users.indexOf(rm.getRoom(code).hostId);
  clients[hostIdx].emit('return_to_room', { roomCode: code });
  clients[hostIdx].clear();
  clients[hostIdx].emit('start_game', { roomCode: code });
  assert.equal(clients[hostIdx].last('error').code, 'PLAYERS_NOT_READY');
  assert.equal(rm.getRoom(code).status, 'waiting');

  clients.forEach((c, i) => { if (i !== hostIdx) c.emit('return_to_room', { roomCode: code }); });
  clients.forEach(c => c.clear());
  clients[hostIdx].emit('start_game', { roomCode: code });

  const room = rm.getRoom(code);
  assert.equal(room.status, 'playing');
  assert.equal(room.currentGame.gameNumber, 1);
  assert.deepEqual(Object.values(room.setScores), [0, 0, 0, 0]);
  assert.deepEqual(room.gameHistory, []);
  assert.equal(room.setResult, null, 'hasil set lama harus dibersihkan saat set baru mulai');
  for (const c of clients) {
    assert.equal(c.last('game_state').game.myHand.length, 13);
    assert.equal(c.last('game_started').gameNumber, 1);
  }
});

test('Back to Menu Utama dari Scoreboard: keluar dari room, pemain lain tetap terhubung', async () => {
  const { users, clients, code } = await finishedRoom();
  clients.forEach(c => c.clear());
  clients[2].emit('leave_room', { roomCode: code });

  assert.equal(clients[2].last('room_left').roomCode, code);
  assert.ok(!clients[2].socket.rooms.has(code));
  assert.ok(!members(code).includes(users[2]));
  assert.equal(members(code).length, 3);
  assert.equal(rm.getRoom(code).status, 'done');
  for (const i of [0, 1, 3]) {
    assert.equal(clients[i].last('room_updated').players.length, 3);
    assert.ok(clients[i].socket.rooms.has(code));
  }
  assert.ok(noDisconnectEvents(clients), 'keluar sengaja tidak boleh dianggap disconnect');
  assert.ok(rm.getRoom(code).players.every(p => p.connected));
  // tidak ada sesi lama yang bisa dipulihkan
  const c2 = clients[2];
  c2.emit('resume_session');
  assert.equal(c2.last('session_none').reason, 'NO_ROOM');
  assert.equal(c2.all('session_restored').length, 0);
});

test('Back to Room dan Back to Menu Utama berbeda & berurutan acak: A kembali, B keluar, C & D kembali, E bergabung → set baru mulai', async () => {
  const { io, users, clients, code } = await finishedRoom();
  clients[0].emit('return_to_room', { roomCode: code });
  clients[1].emit('leave_room', { roomCode: code });
  clients[2].emit('return_to_room', { roomCode: code });
  clients[3].emit('return_to_room', { roomCode: code });
  const room = rm.getRoom(code);
  assert.equal(room.status, 'waiting');
  assert.equal(room.players.length, 3);
  assert.ok(room.players.every(p => p.inRoom));

  const e = io.connect(uid('newcomer_'));
  e.emit('join_room', { roomCode: code });
  assert.equal(e.all('error').length, 0, JSON.stringify(e.all('error')));
  assert.equal(room.players.length, 4);

  clients.forEach(c => c.clear());
  clients[0].emit('start_game', { roomCode: code });
  assert.equal(rm.getRoom(code).status, 'playing');
  assert.equal(clients[1].all('game_state').length, 0, 'pemain yang sudah keluar tidak boleh menerima state game baru');
  assert.equal(clients[1].all('game_started').length, 0);
  assert.equal(e.last('game_state').game.myHand.length, 13);
});

test('pemain baru bisa masuk ke room berstatus done yang punya kursi kosong (room di-reset)', async () => {
  const { io, users, clients, code } = await finishedRoom();
  clients[3].emit('leave_room', { roomCode: code });
  assert.equal(rm.getRoom(code).status, 'done');
  const e = io.connect(uid('newcomer_'));
  e.emit('join_room', { roomCode: code });
  const room = rm.getRoom(code);
  assert.equal(e.all('error').length, 0);
  assert.equal(room.status, 'waiting');
  assert.deepEqual(room.setScores, {});
  assert.equal(player(code, e.userId).inRoom, true);
  assert.deepEqual(room.players.filter(p => !p.inRoom).length, 3);   // yang lain masih di Scoreboard
});

test('refresh: pemain yang masih di Scoreboard kembali ke Scoreboard, yang sudah Back to Room kembali ke Room', async () => {
  const { io, users, clients, code } = await finishedRoom();
  clients[0].emit('return_to_room', { roomCode: code });          // status → waiting
  // B belum kembali, refresh
  clients[1].disconnect();
  const b = io.connect(users[1]); b.emit('resume_session');
  const rb = b.last('session_restored');
  assert.equal(rb.view, 'result');
  assert.equal(rb.setResult.gameHistory.length, 4);
  assert.equal(rb.status, 'waiting');
  // A sudah kembali, refresh
  clients[0].disconnect();
  const a = io.connect(users[0]); a.emit('resume_session');
  assert.equal(a.last('session_restored').view, 'room');
  assert.equal(a.last('session_restored').status, 'waiting');
  // status done (belum ada yang kembali)
  const env2 = await finishedRoom();
  env2.clients[2].disconnect();
  const c = env2.io.connect(env2.users[2]); c.emit('resume_session');
  assert.equal(c.last('session_restored').view, 'result');
});

test('kembali/keluar ditolak dari socket yang bukan anggota room', async () => {
  const { io, code } = await finishedRoom();
  const outsider = io.connect(uid('outsider_'));
  outsider.emit('return_to_room', { roomCode: code });
  outsider.emit('leave_room', { roomCode: code });
  assert.equal(outsider.all('return_room_error')[0].code, 'NOT_IN_ROOM');
  assert.equal(outsider.all('leave_room_error')[0].code, 'NOT_IN_ROOM');
  assert.equal(rm.getRoom(code).players.length, 4);
});

test('semua pemain Back to Menu Utama → room dihapus', async () => {
  const { clients, code } = await finishedRoom();
  clients.forEach(c => c.emit('leave_room', { roomCode: code }));
  assert.equal(rm.getRoom(code), null);
  assert.equal(clients[3].last('room_left').roomDeleted, true);
});

// ── Exit Room (sebelum game dimulai) ─────────────────────────────────────────

test('Exit Room: pemain biasa keluar dari room waiting; pemain lain tetap terhubung & bisa lanjut', () => {
  const { io } = setup();
  const { users, clients, code } = newRoom(io, 3);
  clients.forEach(c => c.clear());
  clients[2].emit('leave_room', { roomCode: code });
  assert.equal(clients[2].last('room_left').roomCode, code);
  assert.deepEqual(members(code), [users[0], users[1]]);
  assert.equal(clients[0].last('room_updated').players.length, 2);
  assert.equal(rm.getRoom(code).hostId, users[0]);
  assert.ok(noDisconnectEvents(clients));
  assert.ok(rm.getRoom(code).players.every(p => p.connected));
  // yang tersisa bisa menerima pemain baru dan mulai bermain
  const x = io.connect(uid('x_')), y = io.connect(uid('y_'));
  x.emit('join_room', { roomCode: code }); y.emit('join_room', { roomCode: code });
  clients[0].emit('start_game', { roomCode: code });
  assert.equal(rm.getRoom(code).status, 'playing');
});

test('Exit Room oleh host: host berpindah ke pemain terhubung; room tetap ada', () => {
  const { io } = setup();
  const { users, clients, code } = newRoom(io, 3);
  clients.forEach(c => c.clear());
  clients[0].emit('leave_room', { roomCode: code });
  const room = rm.getRoom(code);
  assert.notEqual(room.hostId, users[0]);
  assert.ok(room.players.some(p => p.id === room.hostId && p.connected));
  assert.equal(clients[1].last('room_updated').hostId, room.hostId);
  assert.equal(clients[2].last('room_updated').hostId, room.hostId);
  assert.ok(!clients[0].socket.rooms.has(code));
  assert.ok(noDisconnectEvents(clients));
  // host baru bisa memimpin: sisa 2 pemain + 2 pemain baru = 4
  io.connect(uid('z_')).emit('join_room', { roomCode: code });
  io.connect(uid('w_')).emit('join_room', { roomCode: code });
  const newHost = [clients[1], clients[2]].find(c => c.userId === room.hostId);
  newHost.emit('start_game', { roomCode: code });
  assert.equal(rm.getRoom(code).status, 'playing');
});

test('host baru memilih pemain terhubung, bukan yang sedang terputus', () => {
  const { io } = setup();
  const { users, clients, code } = newRoom(io, 3);
  clients[1].disconnect();                               // pemain ke-2 terputus (belum kadaluarsa)
  clients[0].emit('leave_room', { roomCode: code });
  assert.equal(rm.getRoom(code).hostId, users[2]);
});

test('pemain terakhir keluar dari Room → room dihapus', () => {
  const { io } = setup();
  const { clients, code } = newRoom(io, 2);
  clients[0].emit('leave_room', { roomCode: code });
  assert.ok(rm.getRoom(code));
  clients[1].emit('leave_room', { roomCode: code });
  assert.equal(rm.getRoom(code), null);
  assert.equal(clients[1].last('room_left').roomDeleted, true);
});

test('Exit Room ditolak saat game berjalan (GAME_IN_PROGRESS), keanggotaan utuh', () => {
  const { io } = setup();
  const { users, clients, code } = newRoom(io, 4, { start: true });
  clients[1].emit('leave_room', { roomCode: code });
  clients[1].emit('return_to_room', { roomCode: code });
  assert.equal(clients[1].last('leave_room_error').code, 'GAME_IN_PROGRESS');
  assert.equal(clients[1].last('return_room_error').code, 'GAME_IN_PROGRESS');
  assert.equal(rm.getRoom(code).players.length, 4);
  assert.ok(clients[1].socket.rooms.has(code));
});

test('pemain yang keluar lalu refresh/reconnect tidak diseret kembali ke room lama', () => {
  const { io } = setup();
  const { users, clients, code } = newRoom(io, 3);
  clients[2].emit('leave_room', { roomCode: code });
  clients[2].disconnect();
  const again = io.connect(users[2]);
  again.emit('resume_session');
  assert.equal(again.last('session_none').reason, 'NO_ROOM');
  assert.ok(!members(code).includes(users[2]));
});

test('pemain yang keluar bisa langsung membuat/bergabung ke room lain', () => {
  const { io } = setup();
  const { users, clients, code } = newRoom(io, 2);
  clients[1].emit('leave_room', { roomCode: code });
  clients[1].emit('create_room', { maxGames: 4 });
  const newCode = clients[1].last('room_created').code;
  assert.notEqual(newCode, code);
  assert.deepEqual(members(newCode), [users[1]]);
  assert.equal(rm.findRoomByPlayer(users[1]).code, newCode);
});

runTests(tests);
