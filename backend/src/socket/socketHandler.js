'use strict';

const { verifyToken } = require('../auth/jwt');
const rm = require('../rooms/roomManager');
const { TURN_TIMEOUT_MS } = require('../game/engine');

const timers = new Map(); // roomCode → timeoutHandle

function debugLog(action, details = {}) {
  console.info(`[MARTIL ${new Date().toISOString()}] ${action}`, details);
}

const SWEEP_INTERVAL_MS = 10_000;

module.exports = function registerSocketHandlers(io, opts = {}) {
  const sweepIntervalMs = opts.sweepIntervalMs ?? SWEEP_INTERVAL_MS;

  // ── Auth middleware ──────────────────────────────────────────────────────
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error('AUTH_REQUIRED'));
    try {
      socket.user = verifyToken(token);
      next();
    } catch {
      next(new Error('INVALID_TOKEN'));
    }
  });

  io.on('connection', (socket) => {
    const userId = socket.user.id;
    debugLog('SOCKET_CONNECTED', { socketId: socket.id, userId });

    // ── create_room ────────────────────────────────────────────────────────
    socket.on('create_room', ({ maxGames = 4 } = {}) => {
      const result = rm.createRoom(userId, maxGames);
      if (!result.ok) return socket.emit('error', { code: result.error });

      rm.bindSocket(result.room.code, userId, socket.id);
      socket.join(result.room.code);
      socket.emit('room_created', { code: result.room.code });
      socket.emit('room_updated', rm.publicState(result.room.code, userId));
    });

    // ── join_room ──────────────────────────────────────────────────────────
    socket.on('join_room', ({ roomCode }) => {
      const room = rm.getRoom(roomCode);
      if (!room) return socket.emit('error', { code: 'ROOM_NOT_FOUND' });

      // Pemain sudah menjadi anggota room ini → pulihkan sesi (bukan join baru)
      if (room.players.some(p => p.id === userId)) {
        return resumeFor(socket, roomCode);
      }

      // Fresh join
      const result = rm.joinRoom(roomCode, userId);
      if (!result.ok) return socket.emit('error', { code: result.error });

      if (result.reset) debugLog('ROOM_RESET_FOR_NEW_SET', { roomCode, trigger: 'join_room', userId });
      debugLog('JOIN_ROOM', { roomCode, userId, players: result.room.players.length });
      rm.bindSocket(roomCode, userId, socket.id);
      socket.join(roomCode);
      socket.emit('room_updated', rm.publicState(roomCode, userId));
      // Tell everyone (including new player) about the updated room
      io.to(roomCode).emit('room_updated', rm.publicState(roomCode, userId));
    });

    // ── resume_session ─────────────────────────────────────────────────────
    // Dikirim klien setiap kali socket tersambung (login, refresh, atau reconnect).
    socket.on('resume_session', () => resumeFor(socket));

    // ── leave_room ─────────────────────────────────────────────────────────
    // Keluar dari room dengan sengaja ("Exit Room" di Room, "Back to Menu Utama" di Scoreboard).
    // Diizinkan saat status waiting/done. Hanya socket pemain ini yang keluar dari room;
    // pemain lain tidak terpengaruh.
    socket.on('leave_room', ({ roomCode } = {}) => {
      const code = String(roomCode || '').toUpperCase();
      debugLog('LEAVE_ROOM_REQUEST', { userId, roomCode: code });
      // Pemain yang di-Kick dari Result: kembali ke Homepage mengakhiri pembatasan.
      const restriction = rm.getRestriction(userId);
      if (restriction) {
        rm.clearRestriction(userId);
        debugLog('KICK_RESTRICTION_CLEARED', { userId, roomCode: restriction.code, how: 'leave_room' });
        return socket.emit('room_left', { roomCode: restriction.code, roomDeleted: false });
      }
      const result = rm.leaveRoom(code, userId);
      if (!result.ok) {
        debugLog('LEAVE_ROOM_REJECTED', { userId, roomCode: code, reason: result.error });
        socket.emit('leave_room_error', { code: result.error });
        return socket.emit('error', { code: result.error });
      }

      // Intentional leave: socket.leave() must not be treated as a disconnect.
      socket.leave(code);
      if (result.roomDeleted) {
        clearTimer(code);
        debugLog('ROOM_DELETED', { roomCode: code, reason: 'last player left' });
      } else {
        if (result.hostChanged) debugLog('ROOM_HOST_TRANSFERRED', { roomCode: code, from: userId, to: result.newHostId });
        io.to(code).emit('room_updated', rm.publicState(code, null));
      }
      socket.emit('room_left', { roomCode: code, roomDeleted: result.roomDeleted });
      debugLog('ROOM_PLAYER_LEFT', {
        userId,
        roomCode: code,
        remainingPlayers: result.room.players.length,
        roomDeleted: result.roomDeleted,
      });
    });

    // ── return_to_room ─────────────────────────────────────────────────────
    // "Back to Room" di Scoreboard: tetap menjadi anggota room, state set lama dibersihkan.
    socket.on('return_to_room', ({ roomCode } = {}) => {
      const code = String(roomCode || '').toUpperCase();
      debugLog('RETURN_TO_ROOM_REQUEST', { userId, roomCode: code });
      if (rm.getRestriction(userId)) {   // di-Kick dari Result: tidak boleh kembali ke Room sebelum ke Homepage
        debugLog('RETURN_TO_ROOM_REJECTED', { userId, roomCode: code, reason: 'KICKED_FROM_ROOM' });
        return socket.emit('return_room_error', { code: 'KICKED_FROM_ROOM' });
      }
      if (!socket.rooms.has(code)) {
        socket.emit('return_room_error', { code: 'NOT_IN_ROOM' });
        return socket.emit('error', { code: 'NOT_IN_ROOM' });
      }
      const result = rm.returnToRoom(code, userId);
      if (!result.ok) {
        debugLog('RETURN_TO_ROOM_REJECTED', { userId, roomCode: code, reason: result.error });
        socket.emit('return_room_error', { code: result.error });
        return socket.emit('error', { code: result.error });
      }

      if (result.reset) debugLog('ROOM_RESET_FOR_NEW_SET', { roomCode: code, trigger: 'return_to_room', userId });
      debugLog('RETURN_TO_ROOM', {
        userId, roomCode: code, status: result.room.status,
        returned: result.room.players.filter(p => p.inRoom !== false).length,
        players: result.room.players.length,
      });
      socket.emit('room_returned', rm.publicState(code, userId));
      socket.to(code).emit('room_updated', rm.publicState(code, null));
    });

    // ── kick_player ────────────────────────────────────────────────────────
    // Hanya Host, hanya saat game tidak berlangsung. Semua validasi di roomManager.kickPlayer.
    socket.on('kick_player', ({ roomCode, targetId } = {}) => {
      const code = String(roomCode || '').toUpperCase();
      const target = String(targetId || '');
      if (!socket.rooms.has(code)) return socket.emit('kick_error', { code: 'NOT_IN_ROOM' });
      const result = rm.kickPlayer(code, userId, target);
      if (!result.ok) {
        debugLog('KICK_REJECTED', { roomCode: code, hostId: userId, targetId: target, reason: result.error });
        return socket.emit('kick_error', { code: result.error });
      }

      // Hanya socket milik target yang dilepas dari room; pemain lain tidak terpengaruh.
      for (const [, other] of io.sockets.sockets) {
        if (other.user?.id !== target || !other.rooms.has(code)) continue;
        other.leave(code);
        other.emit(result.mode === 'result' ? 'kicked_from_result' : 'kicked', { roomCode: code });
      }
      debugLog('PLAYER_KICKED', { roomCode: code, hostId: userId, targetId: target, mode: result.mode, remaining: result.room.players.length });
      io.to(code).emit('room_updated', rm.publicState(code, null));
      socket.emit('kick_done', { targetId: target, mode: result.mode });
    });

    // ── start_game ─────────────────────────────────────────────────────────
    socket.on('start_game', ({ roomCode }) => {
      if (!requireInRoom(socket, roomCode)) return;
      const room = rm.getRoom(roomCode);
      if (!room)                   return socket.emit('error', { code: 'ROOM_NOT_FOUND' });
      if (room.hostId !== userId)  return socket.emit('error', { code: 'NOT_HOST' });

      const result = rm.startSet(roomCode);
      if (!result.ok) return socket.emit('error', { code: result.error });

      emitPrivateStates(io, roomCode, result.room);
      io.to(roomCode).emit('game_started', {
        gameNumber:  1,
        currentTurn: result.room.currentGame.currentTurn,
      });

      startTimer(io, roomCode);
    });

    // ── play_cards ─────────────────────────────────────────────────────────
    socket.on('play_cards', ({ roomCode, cardIds }) => {
      if (!requireInRoom(socket, roomCode)) return;
      clearTimer(roomCode);

      const result = rm.processPlay(roomCode, userId, cardIds);
      if (!result.ok) {
        startTimer(io, roomCode); // restart timer even on error
        return socket.emit('error', { code: result.error });
      }

      const { event, room } = result;
      io.to(roomCode).emit('cards_played', { playerId: userId, combo: event.combo });

      if (event.type === 'game_over') {
        handleGameOver(io, roomCode, room, event);
      } else {
        emitPrivateStates(io, roomCode, room);
        io.to(roomCode).emit('turn_changed', { currentTurn: room.currentGame.currentTurn });
        startTimer(io, roomCode);
      }
    });

    // ── skip_turn ──────────────────────────────────────────────────────────
    socket.on('skip_turn', ({ roomCode }) => {
      if (!requireInRoom(socket, roomCode)) return;
      clearTimer(roomCode);

      const result = rm.processSkip(roomCode, userId);
      if (!result.ok) {
        startTimer(io, roomCode);
        return socket.emit('error', { code: result.error });
      }

      const { event, room } = result;
      io.to(roomCode).emit('player_skipped', { playerId: userId });

      if (event.type === 'rally_ended') {
        io.to(roomCode).emit('rally_ended', { nextPlayer: event.nextPlayer });
      }

      emitPrivateStates(io, roomCode, room);
      io.to(roomCode).emit('turn_changed', { currentTurn: room.currentGame.currentTurn });
      startTimer(io, roomCode);
    });

    // ── disconnect ─────────────────────────────────────────────────────────
    // Hanya socket yang masih menjadi socket aktif pemain yang dihitung sebagai terputus.
    socket.on('disconnecting', (reason) => {
      debugLog('SOCKET_DISCONNECTING', { socketId: socket.id, userId, reason, rooms: [...socket.rooms].filter(r => r !== socket.id) });
      if (rm.markRestrictedDisconnected(userId, socket.id)) debugLog('RESTRICTED_PLAYER_DISCONNECTED', { userId, socketId: socket.id });
      for (const roomCode of socket.rooms) {
        if (roomCode === socket.id) continue;
        const changed = rm.markDisconnected(roomCode, userId, socket.id);
        if (changed) {
          socket.to(roomCode).emit('player_disconnected', { playerId: userId });
          debugLog('PLAYER_DISCONNECTED', { roomCode, userId, socketId: socket.id });
        } else {
          debugLog('DISCONNECT_IGNORED', { roomCode, userId, socketId: socket.id, why: 'socket sudah digantikan atau pemain sudah terputus' });
        }
      }
    });
  });

  // ── Session resume ─────────────────────────────────────────────────────────

  function requireInRoom(socket, roomCode) {
    if (roomCode && socket.rooms.has(roomCode)) return true;
    socket.emit('error', { code: 'NOT_IN_ROOM' });
    return false;
  }

  function resumeFor(socket, hintCode = null) {
    const userId = socket.user.id;
    const r = rm.resumeSession(userId, socket.id, Date.now(), hintCode);
    if (r.events?.length) broadcastRoomEvents(r.events);

    if (r.ok && r.restricted) {   // di-Kick dari Result: tetap di Result, tanpa bergabung ke socket-room mana pun
      socket.emit('session_restored', r.state);
      debugLog('SESSION_RESTORED_RESTRICTED', { userId, roomCode: r.state.code, socketId: socket.id, wasDisconnected: r.wasDisconnected });
      return;
    }

    if (!r.ok) {
      if (r.error !== 'NO_ROOM') debugLog('SESSION_RESUME_REJECTED', { userId, socketId: socket.id, reason: r.error });
      socket.emit('session_none', { reason: r.error });
      return;
    }

    const { room } = r;
    const code = room.code;

    // Satu pemain = satu socket aktif per room: socket lain milik akun yang sama dilepas dari room.
    let replaced = 0;
    for (const [, other] of io.sockets.sockets) {
      if (other.id === socket.id || other.user?.id !== userId || !other.rooms.has(code)) continue;
      other.leave(code);
      other.emit('session_replaced', { roomCode: code });
      replaced += 1;
    }

    socket.join(code);
    socket.emit('session_restored', {
      ...rm.publicState(code, userId),
      setResult: room.setResult || null,
      view: rm.restoreView(room, userId),   // 'game' | 'result' | 'room' — ditentukan server
    });
    if (r.wasDisconnected) socket.to(code).emit('player_reconnected', { playerId: userId });

    debugLog('SESSION_RESTORED', {
      userId, roomCode: code, status: room.status, view: rm.restoreView(room, userId), socketId: socket.id,
      wasDisconnected: r.wasDisconnected, replacedSockets: replaced,
      game: room.currentGame ? { gameNumber: room.currentGame.gameNumber, currentTurn: room.currentGame.currentTurn } : null,
    });
  }

  // ── Sweeper: kadaluarsakan pemain terputus & tutup room yang ditinggalkan ──

  function broadcastRoomEvents(events) {
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

  function sweep(now = Date.now()) {
    const events = rm.sweepExpired(now);
    if (events.length) broadcastRoomEvents(events);
    return events;
  }

  let sweepTimer = null;
  if (sweepIntervalMs > 0) {
    sweepTimer = setInterval(() => sweep(), sweepIntervalMs);
    sweepTimer.unref?.();
  }

  // ── Timer helpers ──────────────────────────────────────────────────────────

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
      io.to(roomCode).emit('auto_skipped', { playerId: skippedId });

      if (event.type === 'rally_ended') {
        io.to(roomCode).emit('rally_ended', { nextPlayer: event.nextPlayer });
      }
      if (event.type === 'game_over') {
        handleGameOver(io, roomCode, room, event);
        return;
      }

      emitPrivateStates(io, roomCode, room);
      io.to(roomCode).emit('turn_changed', { currentTurn: room.currentGame.currentTurn });
      startTimer(io, roomCode);
    }, TURN_TIMEOUT_MS);

    timers.set(roomCode, handle);
  }

  function clearTimer(roomCode) {
    if (timers.has(roomCode)) {
      clearTimeout(timers.get(roomCode));
      timers.delete(roomCode);
    }
  }

  function handleGameOver(io, roomCode, room, event) {
    io.to(roomCode).emit('game_over', {
      winnerId:    event.winnerId,
      scores:      event.scores,
      setScores:   room.setScores,
      gameHistory: room.gameHistory,
    });

    if (event.setOver) {
      clearTimer(roomCode);
      debugLog('SET_OVER', { roomCode, status: room.status, players: room.players.map(p => p.id) });
      io.to(roomCode).emit('set_over', {
        rankings:    event.rankings,
        setScores:   event.setScores,
        gameHistory: event.gameHistory,
      });
    } else {
      setTimeout(() => {
        const fresh = rm.getRoom(roomCode);
        if (!fresh?.currentGame) return;
        rm.restartTurnClock(roomCode); // timeLeft yang dikirim harus sama dengan timer server (30 dtk penuh)
        emitPrivateStates(io, roomCode, fresh);
        io.to(roomCode).emit('game_started', {
          gameNumber:  event.nextGame,
          currentTurn: fresh.currentGame.currentTurn,
        });
        startTimer(io, roomCode);
      }, 5000);
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

  return { sweep, stop() { if (sweepTimer) clearInterval(sweepTimer); } };
};
