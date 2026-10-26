'use strict';

const { verifyToken } = require('../auth/jwt');
const rm = require('../rooms/roomManager');
const { TURN_TIMEOUT_MS } = require('../game/engine');

const timers = new Map(); // roomCode → timeoutHandle

module.exports = function registerSocketHandlers(io) {

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

    // ── create_room ────────────────────────────────────────────────────────
    socket.on('create_room', ({ maxGames = 4 } = {}) => {
      const result = rm.createRoom(userId, maxGames);
      if (!result.ok) return socket.emit('error', { code: result.error });

      socket.join(result.room.code);
      socket.emit('room_created', { code: result.room.code });
      socket.emit('room_updated', rm.publicState(result.room.code, userId));
    });

    // ── join_room ──────────────────────────────────────────────────────────
    socket.on('join_room', ({ roomCode }) => {
      const room = rm.getRoom(roomCode);
      if (!room) return socket.emit('error', { code: 'ROOM_NOT_FOUND' });

      // Reconnect path
      const existing = room.players.find(p => p.id === userId);
      if (existing && !existing.connected) {
        const result = rm.reconnect(roomCode, userId);
        if (!result.ok) return socket.emit('error', { code: result.error });

        socket.join(roomCode);
        socket.emit('reconnected', rm.publicState(roomCode, userId));
        socket.to(roomCode).emit('player_reconnected', { playerId: userId });
        return;
      }

      // Fresh join
      const result = rm.joinRoom(roomCode, userId);
      if (!result.ok) return socket.emit('error', { code: result.error });

      socket.join(roomCode);
      socket.emit('room_updated', rm.publicState(roomCode, userId));
      // Tell everyone (including new player) about the updated room
      io.to(roomCode).emit('room_updated', rm.publicState(roomCode, userId));
    });

    // ── start_game ─────────────────────────────────────────────────────────
    socket.on('start_game', ({ roomCode }) => {
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
    socket.on('disconnecting', () => {
      for (const roomCode of socket.rooms) {
        if (roomCode === socket.id) continue;
        rm.markDisconnected(roomCode, userId);
        socket.to(roomCode).emit('player_disconnected', { playerId: userId });
      }
    });
  });

  // ── Timer helpers ──────────────────────────────────────────────────────────

  function startTimer(io, roomCode) {
    clearTimer(roomCode);
    const room = rm.getRoom(roomCode);
    if (!room?.currentGame) return;

    const handle = setTimeout(() => {
      const autoResult = rm.processAutoSkip(roomCode);
      if (!autoResult) return;

      const { event, room } = autoResult;
      const skippedId = room.currentGame?.currentTurn ?? null;
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
      io.to(roomCode).emit('set_over', {
        rankings:  event.rankings,
        setScores: event.setScores,
      });
      clearTimer(roomCode);
    } else {
      setTimeout(() => {
        const fresh = rm.getRoom(roomCode);
        if (!fresh?.currentGame) return;
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
};
