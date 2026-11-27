'use strict';

/**
 * Every SQL statement that persists Room/Set/Game results lives here (it used to be inline in rooms/roomManager.js).
 * The functions are thin and keep the exact statements, argument order and write order the room manager always used:
 * nothing here decides game rules, validates input or wraps statements in a transaction.
 */
const { v4: uuidv4 } = require('uuid');
const { db } = require('./database');

/** New Room row: status 'waiting' by the schema default. */
function insertRoom(id, code, hostId, maxGames) {
  db().prepare('INSERT INTO rooms (id, code, host_id, max_games) VALUES (?, ?, ?, ?)').run(id, code, hostId, maxGames);
}

/** rooms.status: 'waiting' | 'playing' | 'done' | 'closed'. */
function setRoomStatus(roomId, status) {
  db().prepare('UPDATE rooms SET status = ? WHERE id = ?').run(status, roomId);
}

/** New Set row (started_at by the schema default, ended_at NULL until endSet). */
function insertSet(setId, roomId) {
  db().prepare('INSERT INTO sets (id, room_id) VALUES (?, ?)').run(setId, roomId);
}

function endSet(setId) {
  db().prepare('UPDATE sets SET ended_at = datetime(\'now\') WHERE id = ?').run(setId);
}

/**
 * One finished Game: the `games` row, then one `game_scores` row per entry of `scores`
 * ({ id, score, remainingCards?, penaltyType? }); remaining cards are stored as JSON, a missing penalty as NULL.
 */
function insertGame(gameId, setId, gameNumber, winnerId, winType, scores) {
  db().prepare(
    'INSERT INTO games (id, set_id, game_number, winner_id, win_type, ended_at) VALUES (?, ?, ?, ?, ?, datetime(\'now\'))'
  ).run(gameId, setId, gameNumber, winnerId, winType);

  const scoreStmt = db().prepare(
    'INSERT INTO game_scores (id, game_id, user_id, score, remaining_cards, penalty_type) VALUES (?, ?, ?, ?, ?, ?)'
  );
  for (const s of scores) {
    scoreStmt.run(uuidv4(), gameId, s.id, s.score, JSON.stringify(s.remainingCards || []), s.penaltyType || null);
  }
}

module.exports = { insertRoom, setRoomStatus, insertSet, endSet, insertGame };
