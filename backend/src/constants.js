'use strict';

/**
 * Game and Room constants: ONE definition for the whole backend.
 * The frontend still repeats a few of them as literals (the player count, the games-per-set choices, the code length,
 * the 30 s turn timer); tests/constants.sim.js fails when the two sides disagree.
 * The error code NEED_4_PLAYERS keeps its name: it is part of the client protocol (PLAYERS_PER_ROOM is its value).
 */
module.exports = Object.freeze({
  /** A Room holds exactly this many players; a game starts only with all of them. */
  PLAYERS_PER_ROOM: 4,
  /** Length of a Room code (upper-case letters and digits). */
  ROOM_CODE_LENGTH: 6,
  /** Games per set a Room can be created with. */
  ALLOWED_MAX_GAMES: Object.freeze([3, 4, 5]),
  DEFAULT_MAX_GAMES: 4,
  /** Time a player has for one turn before the server skips them. */
  TURN_TIMEOUT_MS: 30_000,
});
