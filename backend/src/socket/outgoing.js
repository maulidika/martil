'use strict';

/**
 * Shape of the game-flow events the server sends to clients (payloads only: WHEN to emit stays in socketHandler.js and
 * gameFlow.js). One place per shape instead of an object literal at every emit, so a field cannot drift between the handler
 * that sends `turn_changed` after a play, the one after a skip, and the timer that sends it after an auto-skip.
 * Pure functions: they read their arguments and never change them.
 */

/** After the turn moved: who is up now. */
const turnChanged = (room) => ({ currentTurn: room.currentGame.currentTurn });

/** A rally ended (everyone else skipped): who leads the next one. */
const rallyEnded = (event) => ({ nextPlayer: event.nextPlayer });

/** A game started (the first one of a Set, or the next one after the gap). */
const gameStarted = (gameNumber, room) => ({ gameNumber, currentTurn: room.currentGame.currentTurn });

const cardsPlayed = (playerId, event) => ({ playerId, combo: event.combo });

const playerSkipped = (playerId) => ({ playerId });

/** The 30 s turn timer skipped `playerId` for them. */
const autoSkipped = (playerId) => ({ playerId });

/** A game finished (also sent for the last game of a Set, right before set_over). */
const gameOver = (room, event) => ({
  winnerId:    event.winnerId,
  scores:      event.scores,
  setScores:   room.setScores,
  gameHistory: room.gameHistory,
});

/** The Set finished. */
const setOver = (event) => ({
  rankings:    event.rankings,
  setScores:   event.setScores,
  gameHistory: event.gameHistory,
  profiles:    event.profiles,
});

module.exports = { turnChanged, rallyEnded, gameStarted, cardsPlayed, playerSkipped, autoSkipped, gameOver, setOver };
