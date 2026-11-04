'use strict';
/**
 * Simulasi Host Kick (Socket.IO tiruan, server ASLI: socketHandler.js + roomManager.js + engine.js).
 *   npm run test:kick      (dari folder backend)
 *
 * Aturan yang diuji:
 *   - Room (waiting): Host boleh Kick, pemain boleh bergabung lagi (bukan ban).
 *   - Game (playing): Kick ditolak.
 *   - Result: pemain yang di-Kick tetap melihat hasil, tidak boleh kembali ke Room sebelum ke Homepage;
 *     pembatasan bertahan saat refresh/reconnect dan berakhir saat kembali ke Homepage atau timeout disconnect.
 *   - Validasi hak akses di backend (event Socket.IO langsung dari non-host / non-anggota ditolak).
 */
const { assert, rm, setup, newRoom, uid, player, advance, playSetToEnd, runTests } = require('./helpers/sim');

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

const finishedRoom = async () => {
  const env = setup();
  const room = newRoom(env.io, 4, { start: true });
  await playSetToEnd(room.clients, room.users, room.code);
  return { ...env, ...room };
};
const waitingRoom = () => { const env = setup(); return { ...env, ...newRoom(env.io, 4) }; };
const members = (code) => rm.getRoom(code).players.map(p => p.id);
const noDisturbance = (cs) => cs.every(c => !c.all('player_disconnected').length && !c.all('session_replaced').length && !c.all('room_left').length);

// ── Room (belum mulai) ───────────────────────────────────────────────────────

test('Room: Host mengeluarkan pemain → dihapus dari room, target menerima "kicked", pemain lain mendapat update tanpa gangguan', () => {
  const { users, clients, code } = waitingRoom();
  clients.forEach(c => c.clear());
  clients[0].emit('kick_player', { roomCode: code, targetId: users[2] });

  assert.equal(clients[0].last('kick_done').mode, 'room');
  assert.deepEqual(members(code), [users[0], users[1], users[3]]);
  assert.equal(clients[2].last('kicked').roomCode, code);
  assert.ok(!clients[2].socket.rooms.has(code), 'socket target harus keluar dari room');
  for (const i of [0, 1, 3]) {
    const upd = clients[i].last('room_updated');
    assert.deepEqual(upd.players.map(p => p.id), [users[0], users[1], users[3]]);
  }
  assert.equal(clients[2].all('room_updated').length, 0, 'target tidak boleh menerima update room lagi');
  assert.ok(noDisturbance([clients[0], clients[1], clients[3]]));
  assert.equal(rm.getRoom(code).hostId, users[0]);
  assert.equal(rm.getRestriction(users[2]), null, 'kick di Room bukan pembatasan Result');
});

test('Room: pemain yang di-Kick boleh bergabung kembali (bukan permanent ban)', () => {
  const { users, clients, code } = waitingRoom();
  clients[0].emit('kick_player', { roomCode: code, targetId: users[3] });
  assert.equal(members(code).length, 3);
  clients[3].emit('join_room', { roomCode: code });
  assert.deepEqual(clients[3].all('error'), []);
  assert.ok(members(code).includes(users[3]));
  assert.ok(clients[3].socket.rooms.has(code));
  clients[0].emit('start_game', { roomCode: code });          // room kembali penuh dan bisa dimulai
  assert.equal(rm.getRoom(code).status, 'playing');
});

test('Room: pemain yang di-Kick lalu refresh → mendapat alasan KICKED (bukan state room lama)', () => {
  const { io, users, clients, code } = waitingRoom();
  clients[0].emit('kick_player', { roomCode: code, targetId: users[1] });
  clients[1].disconnect();
  const fresh = io.connect(users[1]); fresh.emit('resume_session');
  assert.equal(fresh.last('session_none').reason, 'KICKED');
});

test('Room: setelah di-Kick lalu bergabung lagi dan keluar sendiri, refresh tidak menampilkan alasan KICKED yang basi', () => {
  const { io, users, clients, code } = waitingRoom();
  clients[0].emit('kick_player', { roomCode: code, targetId: users[1] });
  clients[1].emit('join_room', { roomCode: code });            // bergabung lagi tanpa refresh di antaranya
  assert.ok(members(code).includes(users[1]));
  clients[1].emit('leave_room', { roomCode: code });
  clients[1].disconnect();
  const again = io.connect(users[1]); again.emit('resume_session');
  assert.notEqual(again.last('session_none')?.reason, 'KICKED', 'alasan KICKED tidak boleh basi setelah bergabung lagi');
});

test('Room: kick pemain yang sedang terputus tetap berhasil dan tidak mengganggu pemain lain', () => {
  const { users, clients, code } = waitingRoom();
  clients[2].disconnect();
  clients.forEach(c => c.clear());
  clients[0].emit('kick_player', { roomCode: code, targetId: users[2] });
  assert.deepEqual(members(code), [users[0], users[1], users[3]]);
  assert.ok(noDisturbance([clients[0], clients[1], clients[3]]));
});

// ── Hak akses & status (backend) ─────────────────────────────────────────────

test('hanya Host: non-host yang mengirim kick_player langsung ditolak, room tidak berubah', () => {
  const { users, clients, code } = waitingRoom();
  clients[1].emit('kick_player', { roomCode: code, targetId: users[2] });
  assert.equal(clients[1].last('kick_error').code, 'NOT_HOST');
  assert.equal(members(code).length, 4);
  assert.equal(clients[2].all('kicked').length, 0);
});

test('non-anggota room yang memalsukan event kick_player ditolak', () => {
  const { io, users, code } = waitingRoom();
  const outsider = io.connect(uid('x_'));
  outsider.emit('kick_player', { roomCode: code, targetId: users[1] });
  assert.equal(outsider.last('kick_error').code, 'NOT_IN_ROOM');
  assert.equal(members(code).length, 4);
});

test('Host tidak bisa mengeluarkan diri sendiri atau pemain yang tidak ada di room', () => {
  const { users, clients, code } = waitingRoom();
  clients[0].emit('kick_player', { roomCode: code, targetId: users[0] });
  assert.equal(clients[0].last('kick_error').code, 'CANNOT_KICK_SELF');
  clients[0].emit('kick_player', { roomCode: code, targetId: 'bukan-anggota' });
  assert.equal(clients[0].last('kick_error').code, 'TARGET_NOT_IN_ROOM');
  clients[0].emit('kick_player', { roomCode: code });
  assert.equal(members(code).length, 4);
});

test('Game berlangsung: Host tidak bisa Kick; game dan semua pemain tidak berubah', () => {
  const env = setup(); const { users, clients, code } = newRoom(env.io, 4, { start: true });
  const before = JSON.stringify(rm.getRoom(code).currentGame);
  clients.forEach(c => c.clear());
  clients[0].emit('kick_player', { roomCode: code, targetId: users[1] });
  assert.equal(clients[0].last('kick_error').code, 'GAME_IN_PROGRESS');
  assert.equal(members(code).length, 4);
  assert.equal(JSON.stringify(rm.getRoom(code).currentGame), before);
  assert.equal(clients[1].all('kicked').length + clients[1].all('kicked_from_result').length, 0);
  assert.equal(rm.getRestriction(users[1]), null);
});

test('Homepage: pemain yang belum di Room tidak bisa Kick maupun di-Kick (tidak ada room)', () => {
  const { io } = setup(); const lone = io.connect(uid('h_'));
  lone.emit('kick_player', { roomCode: 'ZZZZZZ', targetId: 'siapa' });
  assert.equal(lone.last('kick_error').code, 'NOT_IN_ROOM');
});

// ── Result ───────────────────────────────────────────────────────────────────

test('Result: pemain yang di-Kick dikeluarkan dari kursi room tetapi pembatasan + hasil set disimpan; "kicked_from_result" dikirim', async () => {
  const { users, clients, code } = await finishedRoom();
  clients.forEach(c => c.clear());
  clients[0].emit('kick_player', { roomCode: code, targetId: users[3] });
  assert.equal(clients[0].last('kick_done').mode, 'result');
  assert.deepEqual(members(code), [users[0], users[1], users[2]]);
  assert.equal(clients[3].last('kicked_from_result').roomCode, code);
  assert.equal(clients[3].all('kicked').length, 0);
  assert.ok(!clients[3].socket.rooms.has(code));
  const r = rm.getRestriction(users[3]);
  assert.ok(r && r.code === code);
  assert.equal(r.setResult.rankings.length, 4, 'hasil set utuh (4 pemain) tetap tersimpan untuk yang di-Kick');
  assert.equal(r.setResult.gameHistory.length, 4);
  for (const i of [0, 1, 2]) assert.equal(clients[i].last('room_updated').players.length, 3);
  assert.ok(noDisturbance([clients[0], clients[1], clients[2]]));
  assert.equal(rm.getRoom(code).setResult.rankings.length, 4, 'setResult room untuk pemain lain tidak dihapus');
});

test('Result: Back to Room oleh pemain yang di-Kick ditolak berulang kali (KICKED_FROM_ROOM) tanpa efek ke room dan tanpa event error generik', async () => {
  const { users, clients, code } = await finishedRoom();
  clients[0].emit('kick_player', { roomCode: code, targetId: users[3] });
  const snapshot = JSON.stringify(rm.getRoom(code).players);
  clients[3].clear();
  for (let i = 0; i < 3; i++) clients[3].emit('return_to_room', { roomCode: code });
  assert.deepEqual(clients[3].all('return_room_error'), Array(3).fill({ code: 'KICKED_FROM_ROOM' }));
  assert.equal(clients[3].all('room_returned').length, 0);
  assert.equal(clients[3].all('error').length, 0);
  assert.equal(JSON.stringify(rm.getRoom(code).players), snapshot);
  assert.equal(rm.getRoom(code).status, 'done');
});

test('Result: pemain yang di-Kick tidak bisa menembus lewat join_room / create_room / start_game / play_cards langsung', async () => {
  const { users, clients, code } = await finishedRoom();
  clients[0].emit('kick_player', { roomCode: code, targetId: users[3] });
  clients[3].clear();
  clients[3].emit('join_room', { roomCode: code });
  assert.equal(clients[3].last('error').code, 'KICKED_FROM_ROOM');
  clients[3].emit('create_room', { maxGames: 4 });
  assert.equal(clients[3].last('error').code, 'KICKED_FROM_ROOM');
  clients[3].emit('start_game', { roomCode: code });
  clients[3].emit('play_cards', { roomCode: code, cardIds: ['3D'] });
  clients[3].emit('kick_player', { roomCode: code, targetId: users[1] });
  assert.equal(clients[3].last('kick_error').code, 'NOT_IN_ROOM');
  assert.equal(members(code).length, 3);
  assert.equal(rm.getRoom(code).status, 'done');
});

test('Result: pemain lain tidak terpengaruh: Back to Room tetap berfungsi; kursi kosong bisa diisi pemain baru; set baru bisa dimulai', async () => {
  const { io, users, clients, code } = await finishedRoom();
  clients[0].emit('kick_player', { roomCode: code, targetId: users[3] });
  for (const i of [0, 1, 2]) clients[i].emit('return_to_room', { roomCode: code });
  assert.ok([0, 1, 2].every(i => clients[i].last('room_returned')));
  assert.equal(rm.getRoom(code).status, 'waiting');
  const fresh = io.connect(uid('n_')); fresh.emit('join_room', { roomCode: code });
  assert.equal(members(code).length, 4);
  fresh.emit('return_to_room', { roomCode: code });
  clients[0].emit('start_game', { roomCode: code });
  assert.equal(rm.getRoom(code).status, 'playing');
  assert.ok(rm.getRestriction(users[3]), 'pembatasan tidak hilang hanya karena set baru dimulai');
  assert.equal(rm.getRestriction(users[3]).setResult.rankings.length, 4, 'hasil untuk pemain yang di-Kick tidak ikut terhapus');
});

test('Result: refresh → pembatasan tetap berlaku, kembali ke Result dengan hasil lengkap (berulang kali)', async () => {
  const { io, users, clients, code } = await finishedRoom();
  clients[0].emit('kick_player', { roomCode: code, targetId: users[3] });
  clients[3].disconnect();
  for (let i = 0; i < 3; i++) {
    const tab = io.connect(users[3]); tab.emit('resume_session');
    const st = tab.last('session_restored');
    assert.ok(st, 'harus dipulihkan, bukan session_none');
    assert.equal(st.view, 'result'); assert.equal(st.restricted, true);
    assert.equal(st.setResult.rankings.length, 4); assert.equal(st.setResult.gameHistory.length, 4);
    assert.equal(st.code, code);
    tab.emit('return_to_room', { roomCode: code });
    assert.equal(tab.last('return_room_error').code, 'KICKED_FROM_ROOM');
    assert.ok(!tab.socket.rooms.has(code));
    tab.disconnect();
  }
  assert.equal(members(code).length, 3);
});

test('Result: pemain yang di-Kick tetap melihat hasil walau room sudah berganti set (setResult room sudah dibersihkan)', async () => {
  const { io, users, clients, code } = await finishedRoom();
  clients[0].emit('kick_player', { roomCode: code, targetId: users[3] });
  rm.getRoom(code).setResult = null;                     // seperti saat set baru dimulai
  clients[3].disconnect();
  const tab = io.connect(users[3]); tab.emit('resume_session');
  assert.equal(tab.last('session_restored').setResult.rankings.length, 4);
});

test('Result: disconnect lalu reconnect sebelum timeout → pembatasan tetap berlaku, kembali ke Result', async () => {
  const { io, handle, users, clients, code } = await finishedRoom();
  clients[0].emit('kick_player', { roomCode: code, targetId: users[3] });
  clients[3].disconnect();
  advance(rm.RECONNECT_WINDOW_MS - 5_000); handle.sweep();
  assert.ok(rm.getRestriction(users[3]), 'belum boleh kedaluwarsa');
  const tab = io.connect(users[3]); tab.emit('resume_session');
  assert.equal(tab.last('session_restored').restricted, true);
  tab.emit('return_to_room', { roomCode: code });
  assert.equal(tab.last('return_room_error').code, 'KICKED_FROM_ROOM');
});

test('Result: disconnect melewati timeout yang ada → pembatasan berakhir; pemain kembali ke Homepage dan boleh bergabung lagi', async () => {
  const { io, handle, users, clients, code } = await finishedRoom();
  clients[0].emit('kick_player', { roomCode: code, targetId: users[3] });
  clients[3].disconnect();
  advance(rm.RECONNECT_WINDOW_MS + 1_000); handle.sweep();
  assert.equal(rm.getRestriction(users[3]), null);
  const tab = io.connect(users[3]); tab.emit('resume_session');
  assert.equal(tab.last('session_none').reason, 'EXPIRED');
  assert.equal(tab.all('session_restored').length, 0);
  tab.emit('join_room', { roomCode: code });
  assert.deepEqual(tab.all('error'), []);
  assert.ok(members(code).includes(users[3]));
});

test('Result: timeout dihitung tepat saat resume walau sweeper belum berjalan', async () => {
  const { io, users, clients, code } = await finishedRoom();
  clients[0].emit('kick_player', { roomCode: code, targetId: users[3] });
  clients[3].disconnect();
  advance(rm.RECONNECT_WINDOW_MS + 1_000);
  const tab = io.connect(users[3]); tab.emit('resume_session');
  assert.equal(tab.last('session_none').reason, 'EXPIRED');
});

test('Result: Kick pemain yang sudah terputus melanjutkan timeout yang berjalan (bukan mengulang dari nol)', async () => {
  const { handle, users, clients, code } = await finishedRoom();
  clients[3].disconnect();
  advance(50_000);
  clients[0].emit('kick_player', { roomCode: code, targetId: users[3] });
  advance(11_000); handle.sweep();
  assert.equal(rm.getRestriction(users[3]), null, 'total 61 dtk sejak terputus → berakhir');
});

test('Result: Back to Menu Utama (leave_room) mengakhiri pembatasan; boleh bergabung lagi ke room yang sama', async () => {
  const { users, clients, code } = await finishedRoom();
  clients[0].emit('kick_player', { roomCode: code, targetId: users[3] });
  clients[3].clear();
  clients[3].emit('leave_room', { roomCode: code });
  assert.equal(clients[3].last('room_left').roomCode, code);
  assert.equal(rm.getRestriction(users[3]), null);
  assert.equal(clients[3].all('error').length, 0);
  assert.equal(members(code).length, 3, 'leave_room tidak boleh mengubah anggota room lain');
  clients[3].emit('join_room', { roomCode: code });
  assert.deepEqual(clients[3].all('error'), []);
  assert.ok(members(code).includes(users[3]));
  assert.ok(clients[3].socket.rooms.has(code));
});

test('campuran: Host sudah di Room, target masih di Result → mode result; target sudah di Room → mode room', async () => {
  const { users, clients, code } = await finishedRoom();
  clients[0].emit('return_to_room', { roomCode: code });
  clients[1].emit('return_to_room', { roomCode: code });          // di Room: host + users[1]; users[2], users[3] masih di Result
  assert.equal(rm.getRoom(code).status, 'waiting');
  clients[0].emit('kick_player', { roomCode: code, targetId: users[3] });
  assert.equal(clients[0].last('kick_done').mode, 'result');
  assert.ok(rm.getRestriction(users[3]));
  clients[0].emit('kick_player', { roomCode: code, targetId: users[1] });
  assert.equal(clients[0].last('kick_done').mode, 'room');
  assert.equal(rm.getRestriction(users[1]), null);
  assert.equal(clients[1].last('kicked').roomCode, code);
  assert.deepEqual(members(code), [users[0], users[2]]);
});

test('pembatasan tidak bocor ke pemain lain atau room lain', async () => {
  const { users, clients, code } = await finishedRoom();
  clients[0].emit('kick_player', { roomCode: code, targetId: users[3] });
  for (const i of [0, 1, 2]) assert.equal(rm.getRestriction(users[i]), null);
  const other = setup(); const r2 = newRoom(other.io, 2);
  assert.equal(rm.getRestriction(r2.users[0]), null);
});

runTests(tests);
