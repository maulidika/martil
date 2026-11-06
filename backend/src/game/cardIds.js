'use strict';

/**
 * Validation of the `cardIds` list a client sends with `play_cards`.
 * Pure function: no state, no side effects. The engine is the authority; the
 * socket layer only forwards what the client sent.
 */

const { createDeck } = require('./deck');

/** Every legal card id (e.g. "3S", "10H"). Built from the deck so it never drifts from deck.js. */
const VALID_CARD_IDS = new Set(createDeck().map(c => c.id));

/** A hand never holds more than 13 cards, so a longer list can never be a legal play. */
const MAX_CARD_IDS = 13;

/**
 * @param {unknown} cardIds
 * @returns {null | 'NO_CARDS_SELECTED' | 'INVALID_CARD_IDS'} null when the list is well-formed.
 *   Well-formed only means "shape is valid": membership in the player's hand and the
 *   combo rules are still checked by the engine afterwards.
 */
function validateCardIds(cardIds) {
  // Same code as before for "nothing sent" so existing clients keep working.
  if (!cardIds) return 'NO_CARDS_SELECTED';
  if (!Array.isArray(cardIds)) return 'INVALID_CARD_IDS';
  if (cardIds.length === 0) return 'NO_CARDS_SELECTED';
  if (cardIds.length > MAX_CARD_IDS) return 'INVALID_CARD_IDS';

  const seen = new Set();
  for (const id of cardIds) {
    if (typeof id !== 'string' || !VALID_CARD_IDS.has(id)) return 'INVALID_CARD_IDS';
    if (seen.has(id)) return 'INVALID_CARD_IDS'; // one physical card cannot be played twice
    seen.add(id);
  }
  return null;
}

module.exports = { validateCardIds, VALID_CARD_IDS, MAX_CARD_IDS };
