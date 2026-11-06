'use strict';

/**
 * Input guards for Socket.IO event payloads. Pure functions, no state.
 *
 * A client can emit any event with any payload (nothing, null, a number, an array...).
 * Destructuring such a value in a handler signature throws, so every handler reads its
 * payload through readPayload() first and answers INVALID_PAYLOAD when the shape is wrong.
 */

/** Longest string field we accept (room codes are 6 chars, user ids are UUIDs of 36). */
const MAX_STRING_LEN = 64;

const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

/**
 * @param {unknown}  data            what the client sent as the event payload
 * @param {string[]} stringFields    fields that, when present, must be strings (<= MAX_STRING_LEN chars)
 * @param {{allowEmpty?: boolean}} [opts] allowEmpty: undefined/null means "no payload" and becomes {}
 * @returns {object|null} the payload object, or null when it is malformed
 *
 * A missing field is NOT an error here: handlers keep their existing "missing → NOT_IN_ROOM /
 * ROOM_NOT_FOUND" behaviour. Only a field that is present with the wrong type is rejected.
 */
function readPayload(data, stringFields = [], { allowEmpty = false } = {}) {
  if (data === undefined || data === null) return allowEmpty ? {} : null;
  if (!isPlainObject(data)) return null;
  for (const field of stringFields) {
    const v = data[field];
    if (v === undefined) continue;
    if (typeof v !== 'string' || v.length > MAX_STRING_LEN) return null;
  }
  return data;
}

/**
 * Which client-visible event(s) carry a rejection for each event. These mirror the channels the
 * handlers already use for their own rejections, so a client waiting for e.g. `leave_room_error`
 * is still released.
 */
const ERROR_CHANNELS = {
  leave_room:     ['leave_room_error', 'error'],
  return_to_room: ['return_room_error', 'error'],
  kick_player:    ['kick_error'],
};

/** Emit `{ code }` on every channel that belongs to `event`. Never throws. */
function emitRejection(socket, event, code) {
  for (const channel of ERROR_CHANNELS[event] || ['error']) {
    try { socket.emit(channel, { code }); } catch { /* socket already gone */ }
  }
}

module.exports = { readPayload, emitRejection, MAX_STRING_LEN, ERROR_CHANNELS };
