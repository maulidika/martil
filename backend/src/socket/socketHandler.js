'use strict';

const { verifyToken } = require('../auth/jwt');
const rm = require('../rooms/roomManager');
const { readPayload, emitRejection, normalizeRoomCode } = require('./payload');
const { debugLog } = require('./debugLog');
const outgoing = require('./outgoing');
const { startTimer, clearTimer, handleGameOver, emitPrivateStates, broadcastRoomEvents, startSweeper } = require('./gameFlow');

/**
 * Register an event handler that can never throw into Socket.IO. Payload guards (readPayload)
 * handle the expected bad input; this is the safety net for anything unexpected: the error is
 * logged with its stack and the sender gets INTERNAL_ERROR, while the server keeps running.
 */
function onSafe(socket, event, handler, { notify = true } = {}) {
  socket.on(event, (...args) => {
    try {
      handler(...args);
    } catch (err) {
      debugLog('HANDLER_ERROR', { event, userId: socket.user?.id, message: err?.message });
      console.error(err?.stack || err);
      if (notify) emitRejection(socket, event, 'INTERNAL_ERROR');
    }
  });
}

module.exports = function registerSocketHandlers(io, opts = {}) {
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
    onSafe(socket, 'create_room', (data) => {
      const payload = readPayload(data, [], { allowEmpty: true });
      if (!payload) return emitRejection(socket, 'create_room', 'INVALID_PAYLOAD');
      const { maxGames = rm.DEFAULT_MAX_GAMES } = payload;   // validated by rm.createRoom (INVALID_MAX_GAMES)
      const result = rm.createRoom(userId, maxGames, socket.user.username);
      if (!result.ok) return socket.emit('error', { code: result.error });

      rm.bindSocket(result.room.code, userId, socket.id);
      socket.join(result.room.code);
      socket.emit('room_created', { code: result.room.code });
      socket.emit('room_updated', rm.publicState(result.room.code, userId));
    });

    // ── join_room ──────────────────────────────────────────────────────────
    onSafe(socket, 'join_room', (data) => {
      const payload = readPayload(data, ['roomCode']);
      if (!payload) return emitRejection(socket, 'join_room', 'INVALID_PAYLOAD');
      const roomCode = normalizeRoomCode(payload.roomCode);
      const room = rm.getRoom(roomCode);
      if (!room) return socket.emit('error', { code: 'ROOM_NOT_FOUND' });

      // Pemain sudah menjadi anggota room ini → pulihkan sesi (bukan join baru)
      if (room.players.some(p => p.id === userId)) {
        return resumeFor(socket, roomCode);
      }

      // Fresh join
      const result = rm.joinRoom(roomCode, userId, socket.user.username);
      if (!result.ok) return socket.emit('error', { code: result.error });

      if (result.reset) debugLog('ROOM_RESET_FOR_NEW_SET', { roomCode, trigger: 'join_room', userId });
      debugLog('JOIN_ROOM', { roomCode, userId, players: result.room.players.length });
      rm.bindSocket(roomCode, userId, socket.id);
      socket.join(roomCode);
      // The newcomer gets the room as seen by them; everyone else gets the neutral view (never a view personalised for the newcomer).
      socket.emit('room_updated', rm.publicState(roomCode, userId));
      socket.to(roomCode).emit('room_updated', rm.publicState(roomCode, null));
    });

    // ── resume_session ─────────────────────────────────────────────────────
    // Dikirim klien setiap kali socket tersambung (login, refresh, atau reconnect).
    onSafe(socket, 'resume_session', () => resumeFor(socket));

    // ── leave_room ─────────────────────────────────────────────────────────
    // Keluar dari room dengan sengaja ("Exit Room" di Room, "Back to Menu Utama" di Scoreboard).
    // Diizinkan saat status waiting/done. Hanya socket pemain ini yang keluar dari room;
    // pemain lain tidak terpengaruh.
    onSafe(socket, 'leave_room', (data) => {
      const payload = readPayload(data, ['roomCode']);
      if (!payload) return emitRejection(socket, 'leave_room', 'INVALID_PAYLOAD');
      const { roomCode } = payload;
      const code = normalizeRoomCode(roomCode);
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
    onSafe(socket, 'return_to_room', (data) => {
      const payload = readPayload(data, ['roomCode']);
      if (!payload) return emitRejection(socket, 'return_to_room', 'INVALID_PAYLOAD');
      const { roomCode } = payload;
      const code = normalizeRoomCode(roomCode);
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
    onSafe(socket, 'kick_player', (data) => {
      const payload = readPayload(data, ['roomCode', 'targetId']);
      if (!payload) return emitRejection(socket, 'kick_player', 'INVALID_PAYLOAD');
      const { roomCode, targetId } = payload;
      const code = normalizeRoomCode(roomCode);
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
    onSafe(socket, 'start_game', (data) => {
      const payload = readPayload(data, ['roomCode']);
      if (!payload) return emitRejection(socket, 'start_game', 'INVALID_PAYLOAD');
      const roomCode = normalizeRoomCode(payload.roomCode);
      if (!requireInRoom(socket, roomCode)) return;
      const room = rm.getRoom(roomCode);
      if (!room)                   return socket.emit('error', { code: 'ROOM_NOT_FOUND' });
      if (room.hostId !== userId)  return socket.emit('error', { code: 'NOT_HOST' });

      const result = rm.startSet(roomCode);
      if (!result.ok) return socket.emit('error', { code: result.error });

      emitPrivateStates(io, roomCode, result.room);
      io.to(roomCode).emit('game_started', outgoing.gameStarted(1, result.room));

      startTimer(io, roomCode);
    });

    // ── play_cards ─────────────────────────────────────────────────────────
    onSafe(socket, 'play_cards', (data) => {
      const payload = readPayload(data, ['roomCode']);
      if (!payload) return emitRejection(socket, 'play_cards', 'INVALID_PAYLOAD');
      const roomCode = normalizeRoomCode(payload.roomCode);
      const { cardIds } = payload;   // cardIds: shape is validated by the engine (game/cardIds.js)
      if (!requireInRoom(socket, roomCode)) return;

      // Validate first: a rejected action must leave the turn timer exactly as it was.
      const result = rm.processPlay(roomCode, userId, cardIds);
      if (!result.ok) return socket.emit('error', { code: result.error });
      clearTimer(roomCode);   // accepted: the turn is over, the next branch starts a fresh timer (or none)

      const { event, room } = result;
      io.to(roomCode).emit('cards_played', outgoing.cardsPlayed(userId, event));

      if (event.type === 'game_over') {
        handleGameOver(io, roomCode, room, event);
      } else {
        emitPrivateStates(io, roomCode, room);
        io.to(roomCode).emit('turn_changed', outgoing.turnChanged(room));
        startTimer(io, roomCode);
      }
    });

    // ── skip_turn ──────────────────────────────────────────────────────────
    onSafe(socket, 'skip_turn', (data) => {
      const payload = readPayload(data, ['roomCode']);
      if (!payload) return emitRejection(socket, 'skip_turn', 'INVALID_PAYLOAD');
      const roomCode = normalizeRoomCode(payload.roomCode);
      if (!requireInRoom(socket, roomCode)) return;

      // Validate first: a rejected action must leave the turn timer exactly as it was.
      const result = rm.processSkip(roomCode, userId);
      if (!result.ok) return socket.emit('error', { code: result.error });
      clearTimer(roomCode);

      const { event, room } = result;
      io.to(roomCode).emit('player_skipped', outgoing.playerSkipped(userId));

      if (event.type === 'rally_ended') {
        io.to(roomCode).emit('rally_ended', outgoing.rallyEnded(event));
      }

      emitPrivateStates(io, roomCode, room);
      io.to(roomCode).emit('turn_changed', outgoing.turnChanged(room));
      startTimer(io, roomCode);
    });

    // ── disconnect ─────────────────────────────────────────────────────────
    // Hanya socket yang masih menjadi socket aktif pemain yang dihitung sebagai terputus.
    onSafe(socket, 'disconnecting', (reason) => {
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
    }, { notify: false });   // the socket is already closing: nobody to tell
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
    if (r.events?.length) broadcastRoomEvents(io, r.events);

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

  const sweeper = startSweeper(io, opts.sweepIntervalMs);

  return { sweep: sweeper.sweep, stop: sweeper.stop };
};
