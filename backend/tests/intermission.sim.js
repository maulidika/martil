'use strict';
/**
 * H4 — protection during the ~5 s gap between two games (real socketHandler.js + roomManager.js + engine.js,
 * fake Socket.IO; the 5 s and 30 s timers are captured so the test decides when they fire).
 *   npm run test:intermission      (from the backend folder)
 *
 * Before the fix, the next game's state already existed during the gap, so the server accepted
 * play_cards / skip_turn before `game_started` was ever sent to the clients.
 *
 * Covered:
 *   - during the gap play_cards and skip_turn answer GAME_STARTING (current player AND everyone else),
 *     nothing changes, nothing is broadcast, no turn timer starts, auto-skip is a no-op
 *   - when the gap ends: game_started goes out, the 30 s timer starts, the turn clock is fresh, plays work
 *   - the gap repeats for every game change; there is none after the last game; the flag does not leak into the next set
 *   - reconnecting during the gap restores the session as before and does not end the gap
 */
const path = require('path');
const { assert, rm, setup, newRoom, runTests, advance } = require('./helpers/sim');
const { TURN_TIMEOUT_MS } = require(path.join('..', 'src', 'game', 'engine.js'));

// Installed AFTER the helper (whose wrapper turns 5 s into setImmediate) so this layer sees 5 s first.
const gapCallbacks = [];                     // pending 5 s intermission callbacks
const turnTimers = [];                       // every 30 s turn timer: { fn, cleared, fired }
const prevSetTimeout = global.setTimeout;
const prevClearTimeout = global.clearTimeout;
global.setTimeout = (fn, ms, ...a) => {
  if (ms === 5000) { const t = { fn, gap: true }; gapCallbacks.push(t); return t; }
  if (ms === TURN_TIMEOUT_MS) { const t = { fn, cleared: false, fired: false }; turnTimers.push(t); return t; }
  return prevSetTimeout(fn, ms, ...a);
};
global.clearTimeout = (h) => {
  if (h && typeof h === 'object' && 'fn' in h) { h.cleared = true; return; }
  return prevClearTimeout(h);
};
const pendingTurnTimers = () => turnTimers.filter(t => !t.cleared && !t.fired);
/** Let the 5 s gap end now. */
const endGap = () => { const t = gapCallbacks.shift(); assert.ok(t, 'tidak ada callback jeda yang menunggu'); t.fn(); };

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

function liveGame() {
  gapCallbacks.length = 0; turnTimers.length = 0;
  const env = setup();
  const room = newRoom(env.io, 4, { start: true });
  const game = () => rm.getRoom(room.code).currentGame;
  const clientOf = (id) => room.clients[room.users.indexOf(id)];
  /** Force the current game to end right now: the player on turn is left with one card and plays it. */
  const finishGame = () => {
    const turn = game().currentTurn;
    game().hands[turn] = [game().hands[turn][0]];
    clientOf(turn).emit('play_cards', { roomCode: room.code, cardIds: [game().hands[turn][0].id] });
  };
  return { ...env, ...room, game, clientOf, finishGame };
}
const snap = (g) => JSON.stringify(g.game());
const inGap = (g) => g.clients.forEach(c => c.clear());

/** A valid single-card play for `client`'s hand. */
const someCard = (g, client) => g.game().hands[g.users[g.clients.indexOf(client)]][0].id;

// ── During the gap ───────────────────────────────────────────────────────────

test('game selesai: game_over dikirim, tetapi game_started BELUM dan tidak ada timer giliran', () => {
  const g = liveGame();
  g.finishGame();
  for (const c of g.clients) {
    assert.equal(c.all('game_over').length, 1);
    assert.equal(c.all('game_started').length, 1, 'hanya game_started awal');
  }
  assert.equal(gapCallbacks.length, 1);
  assert.equal(pendingTurnTimers().length, 0);
});

test('selama jeda: play_cards dan skip_turn dari SEMUA pemain ditolak GAME_STARTING; state, siaran, dan timer tidak berubah', () => {
  const g = liveGame();
  g.finishGame();
  const before = snap(g);
  const timersBefore = turnTimers.length;
  inGap(g);
  for (const c of g.clients) {
    c.emit('play_cards', { roomCode: g.code, cardIds: [someCard(g, c)] });
    assert.equal(c.last('error')?.code, 'GAME_STARTING', 'play_cards');
    c.clear();
    c.emit('skip_turn', { roomCode: g.code });
    assert.equal(c.last('error')?.code, 'GAME_STARTING', 'skip_turn');
  }
  assert.equal(snap(g), before, 'state game berikutnya tidak boleh berubah');
  for (const c of g.clients) {
    for (const ev of ['cards_played', 'player_skipped', 'turn_changed', 'game_state', 'game_started']) {
      assert.equal(c.all(ev).length, 0, `${ev} tidak boleh disiarkan selama jeda`);
    }
  }
  assert.equal(turnTimers.length, timersBefore, 'aksi yang ditolak tidak boleh memasang timer');
});

test('selama jeda: processAutoSkip tidak melakukan apa-apa', () => {
  const g = liveGame();
  g.finishGame();
  const before = snap(g);
  assert.equal(rm.processAutoSkip(g.code), null);
  assert.equal(snap(g), before);
});

// ── When the gap ends ────────────────────────────────────────────────────────

test('jeda berakhir: game_started untuk semua, timer 30 dtk terpasang, jam giliran segar, aksi sah diterima', () => {
  const g = liveGame();
  g.finishGame();
  inGap(g);
  advance(5000);                                      // the gap really lasts ~5 s on the (simulated) clock
  endGap();
  for (const c of g.clients) {
    const gs = c.last('game_started');
    assert.equal(gs.gameNumber, 2);
    assert.equal(gs.currentTurn, g.game().currentTurn);
  }
  assert.equal(pendingTurnTimers().length, 1);
  assert.equal(g.game().turnStartedAt, Date.now(), 'jam giliran harus dimulai ulang tepat saat jeda berakhir');

  const turn = g.game().currentTurn; const me = g.clientOf(turn);
  me.clear();
  me.emit('play_cards', { roomCode: g.code, cardIds: [g.game().hands[turn][0].id] });
  assert.equal(me.last('error'), undefined);
  assert.equal(me.all('cards_played').length, 1);
});

test('jeda berulang di setiap pergantian game (2→3), dan dilepas lagi', () => {
  const g = liveGame();
  g.finishGame(); endGap();
  g.finishGame();                                     // game 2 selesai
  inGap(g);
  const turn = g.game().currentTurn;
  g.clientOf(turn).emit('play_cards', { roomCode: g.code, cardIds: [g.game().hands[turn][0].id] });
  assert.equal(g.clientOf(turn).last('error')?.code, 'GAME_STARTING');
  endGap();
  g.clientOf(turn).clear();
  g.clientOf(turn).emit('play_cards', { roomCode: g.code, cardIds: [g.game().hands[turn][0].id] });
  assert.equal(g.clientOf(turn).last('error'), undefined);
  assert.equal(g.game().gameNumber, 3);
});

// ── No gap after the last game; no leakage ───────────────────────────────────

test('set selesai: tidak ada jeda; aksi memberi NO_ACTIVE_GAME (kode lama); tidak ada callback tersisa', () => {
  const g = liveGame();
  for (let i = 1; i <= 3; i++) { g.finishGame(); endGap(); }
  g.finishGame();                                     // game ke-4 = terakhir
  assert.equal(rm.getRoom(g.code).status, 'done');
  assert.equal(gapCallbacks.length, 0, 'tidak boleh ada jeda setelah game terakhir');
  g.clients[0].clear();
  g.clients[0].emit('play_cards', { roomCode: g.code, cardIds: ['3S'] });
  assert.equal(g.clients[0].last('error')?.code, 'NO_ACTIVE_GAME');
});

test('flag jeda tidak bocor ke set berikutnya: setelah Back to Room dan start_game, aksi sah diterima', () => {
  const g = liveGame();
  for (let i = 1; i <= 3; i++) { g.finishGame(); endGap(); }
  g.finishGame();
  for (const c of g.clients) c.emit('return_to_room', { roomCode: g.code });
  g.clients[0].emit('start_game', { roomCode: g.code });
  assert.equal(rm.getRoom(g.code).status, 'playing');
  const turn = g.game().currentTurn; const me = g.clientOf(turn);
  me.clear();
  me.emit('play_cards', { roomCode: g.code, cardIds: [g.game().hands[turn][0].id] });
  assert.equal(me.last('error'), undefined, `ditolak: ${JSON.stringify(me.last('error'))}`);
  assert.equal(me.all('cards_played').length, 1);
});

// ── endIntermission contract and flag lifecycle (white-box: stale flag forced on purpose) ──

test('endIntermission tanpa jeda aktif: mengembalikan null dan tidak menyentuh jam giliran', () => {
  const g = liveGame();
  const started = g.game().turnStartedAt;
  advance(3000);
  assert.equal(rm.endIntermission(g.code), null);
  assert.equal(g.game().turnStartedAt, started);
  assert.equal(rm.endIntermission('NOPE00'), null);
});

test('endIntermission setelah game berikutnya sudah dilepas: null (callback ganda tidak mengulang game_started)', () => {
  const g = liveGame();
  g.finishGame();
  assert.ok(rm.endIntermission(g.code), 'pelepasan pertama harus berhasil');
  assert.equal(rm.endIntermission(g.code), null, 'pelepasan kedua harus no-op');
});

test('flag basi dibersihkan saat Back to Room mereset room (jalur _resetRoomForNewSet)', () => {
  const g = liveGame();
  for (let i = 1; i <= 3; i++) { g.finishGame(); endGap(); }
  g.finishGame();
  assert.equal(rm.getRoom(g.code).status, 'done');
  rm.getRoom(g.code).intermission = true;             // simulate a stale flag
  g.clients[0].emit('return_to_room', { roomCode: g.code });
  assert.equal(rm.getRoom(g.code).status, 'waiting');
  assert.equal(rm.getRoom(g.code).intermission, false);
});

test('flag basi dibersihkan saat start_game memulai set baru (jalur startSet)', () => {
  const g = liveGame();
  for (let i = 1; i <= 3; i++) { g.finishGame(); endGap(); }
  g.finishGame();
  for (const c of g.clients) c.emit('return_to_room', { roomCode: g.code });
  rm.getRoom(g.code).intermission = true;             // simulate a stale flag AFTER the reset path already ran
  g.clients[0].emit('start_game', { roomCode: g.code });
  assert.equal(rm.getRoom(g.code).status, 'playing');
  const turn = g.game().currentTurn; const me = g.clientOf(turn);
  me.clear();
  me.emit('play_cards', { roomCode: g.code, cardIds: [g.game().hands[turn][0].id] });
  assert.equal(me.last('error'), undefined, `ditolak: ${JSON.stringify(me.last('error'))}`);
});

// ── Reconnect is untouched ───────────────────────────────────────────────────

test('refresh saat jeda: sesi dipulihkan seperti biasa dan jeda TIDAK berakhir karena resume', () => {
  const g = liveGame();
  g.finishGame();
  const idx = 2;
  g.clients[idx].disconnect();
  const back = g.io.connect(g.users[idx]);
  back.emit('resume_session');
  const restored = back.last('session_restored');
  assert.ok(restored, 'session_restored tidak dikirim');
  assert.equal(restored.status, 'playing');
  assert.equal(back.all('game_started').length, 0, 'resume tidak boleh mengumumkan game');
  assert.equal(gapCallbacks.length, 1, 'jeda masih menunggu');
  back.clear();
  back.emit('skip_turn', { roomCode: g.code });
  assert.equal(back.last('error')?.code, 'GAME_STARTING');
  endGap();
  assert.equal(g.clients[0].last('game_started').gameNumber, 2);
});

runTests(tests);
