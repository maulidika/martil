'use strict';

/**
 * Everything that happens on a clock or fans out after a game action: the 30 s turn timer (auto-skip), the 5 s gap between
 * games, the per-player private game states, and the periodic sweep of expired players/rooms. Moved out of socketHandler.js
 * unchanged (S6): the handlers decide WHEN to call these, this module decides what they do.
 *
 * The functions take `io` explicitly, as they always did. `timers` is module-level on purpose (one turn timer per room code,
 * shared by every registerSocketHandlers call, exactly as before).
 */
const rm = require('../rooms/roomManager');
const { TURN_TIMEOUT_MS } = require('../constants');
const { debugLog } = require('./debugLog');
const outgoing = require('./outgoing');

const timers = new Map(); // roomCode → timeoutHandle

/** Gap between two games of a Set. The test helper (helpers/sim.js) speeds up exactly this value, so keep it a plain 5000. */
const INTERMISSION_MS = 5000;
const SWEEP_INTERVAL_MS = 10_000;

// ── Timer helpers ──

function startTimer(io, roomCode) {
  clearTimer(roomCode);
  const room = rm.getRoom(roomCode);
  if (!room?.currentGame) return;

  const handle = setTimeout(() => {
    const skippedId = rm.getRoom(roomCode)?.currentGame?.currentTurn ?? null; // sebelum giliran berpindah
    const autoResult = rm.processAutoSkip(roomCode);
    if (!autoResult) return;

    const { event, room } = autoResult;
    debugLog('AUTO_SKIP', { roomCode, playerId: skippedId, result: event.type });
    io.to(roomCode).emit('auto_skipped', outgoing.autoSkipped(skippedId));

    if (event.type === 'rally_ended') {
      io.to(roomCode).emit('rally_ended', outgoing.rallyEnded(event));
    }
    if (event.type === 'game_over') {
      handleGameOver(io, roomCode, room, event);
      return;
    }

    emitPrivateStates(io, roomCode, room);
    io.to(roomCode).emit('turn_changed', outgoing.turnChanged(room));
    startTimer(io, roomCode);
  }, TURN_TIMEOUT_MS);

  timers.set(roomCode, handle);
}

/** Number of rooms that currently have a turn timer registered (for tests: a cleared timer must not stay in the table). */
function pendingTimerCount() {
  return timers.size;
}

function clearTimer(roomCode) {
  if (timers.has(roomCode)) {
    clearTimeout(timers.get(roomCode));
    timers.delete(roomCode);
  }
}

function handleGameOver(io, roomCode, room, event) {
  io.to(roomCode).emit('game_over', outgoing.gameOver(room, event));

  if (event.setOver) {
    clearTimer(roomCode);
    debugLog('SET_OVER', { roomCode, status: room.status, players: room.players.map(p => p.id) });
    io.to(roomCode).emit('set_over', outgoing.setOver(event));
  } else {
    setTimeout(() => {
      // Releases the gap (plays/skips are rejected with GAME_STARTING until now) and restarts the
      // turn clock so the timeLeft we send matches the server timer (full 30 s).
      const fresh = rm.endIntermission(roomCode);
      if (!fresh) return;
      emitPrivateStates(io, roomCode, fresh);
      io.to(roomCode).emit('game_started', outgoing.gameStarted(event.nextGame, fresh));
      startTimer(io, roomCode);
    }, INTERMISSION_MS);
  }
}

// Send individual private game states so opponents can't see each other's cards
function emitPrivateStates(io, roomCode, room) {
  if (!room?.currentGame) return;
  for (const [, socket] of io.sockets.sockets) {
    if (!socket.rooms.has(roomCode)) continue;
    const uid = socket.user?.id;
    if (!uid) continue;
    socket.emit('game_state', rm.publicState(roomCode, uid));
  }
}

// ── Sweeper: expire disconnected players and close abandoned rooms ──

function broadcastRoomEvents(io, events) {
  const touched = new Set();
  for (const e of events) {
    debugLog(`ROOM_${e.type.toUpperCase()}`, e);
    if (e.type === 'room_deleted' || e.type === 'room_abandoned') clearTimer(e.code);
    else if (e.type !== 'restriction_expired') touched.add(e.code);
  }
  for (const code of touched) {
    const room = rm.getRoom(code);
    if (!room) continue;
    if (room.status === 'playing') emitPrivateStates(io, code, room);
    else io.to(code).emit('room_updated', rm.publicState(code, null));
  }
}

function sweep(io, now = Date.now()) {
  const events = rm.sweepExpired(now);
  if (events.length) broadcastRoomEvents(io, events);
  return events;
}

/** Start the periodic sweep (a non-positive interval means: no timer, call sweep() by hand). Returns { sweep, stop }. */
function startSweeper(io, intervalMs) {
  const everyMs = intervalMs ?? SWEEP_INTERVAL_MS;
  let sweepTimer = null;
  if (everyMs > 0) {
    sweepTimer = setInterval(() => sweep(io), everyMs);
    sweepTimer.unref?.();
  }
  return { sweep: (now = Date.now()) => sweep(io, now), stop() { if (sweepTimer) clearInterval(sweepTimer); } };
}

module.exports = {
  startTimer, clearTimer, pendingTimerCount, handleGameOver, emitPrivateStates, broadcastRoomEvents, sweep, startSweeper,
  INTERMISSION_MS, SWEEP_INTERVAL_MS,
};
