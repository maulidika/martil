'use strict';

const { deal, findFirstPlayer, sortHand } = require('./deck');
const { detectCombo, canBeat, cardsInHand } = require('./validator');
const { calcGameScores } = require('./scorer');

const TURN_TIMEOUT_MS = 30_000;

class GameEngine {
  /**
   * Create initial game state.
   * @param {string[]} playerIds - 4 player IDs in seat order
   * @param {number}   gameNumber
   * @param {string|null} firstPlayerId - null = use 3♠ rule
   */
  static initGame(playerIds, gameNumber, firstPlayerId = null) {
    const hands  = deal();
    const handMap = {};
    playerIds.forEach((id, i) => { handMap[id] = sortHand(hands[i]); });

    let startIdx;
    if (firstPlayerId && playerIds.includes(firstPlayerId)) {
      startIdx = playerIds.indexOf(firstPlayerId);
    } else {
      startIdx = findFirstPlayer(playerIds.map(id => handMap[id]));
    }

    return {
      gameNumber,
      phase: 'playing',      // 'playing' | 'game_over'
      playerIds,
      hands: handMap,
      currentTurn: playerIds[startIdx],
      table: [],             // [{ playerId, combo }]  – current rally
      skipCount: 0,
      lastPlayerId: null,    // who last played a non-skip in this rally
      turnStartedAt: Date.now(),
    };
  }

  // ─── Actions ──────────────────────────────────────────────────────────────

  static processPlay(state, playerId, cardIds) {
    if (state.phase !== 'playing')          return err('GAME_NOT_ACTIVE');
    if (state.currentTurn !== playerId)      return err('NOT_YOUR_TURN');
    if (!cardIds || cardIds.length === 0)    return err('NO_CARDS_SELECTED');

    const hand = state.hands[playerId];
    const playedCards = cardIds.map(id => hand.find(c => c.id === id)).filter(Boolean);
    if (playedCards.length !== cardIds.length) return err('CARD_NOT_IN_HAND');
    if (!cardsInHand(playedCards, hand))        return err('CARD_NOT_IN_HAND');

    const combo = detectCombo(playedCards);
    if (!combo) return err('INVALID_COMBO');

    // Must beat current table top (if any)
    const tableTop = state.table.at(-1);
    if (tableTop && !canBeat(combo, tableTop.combo)) return err('CANNOT_BEAT_TABLE');

    // Remove played cards from hand
    const played = new Set(cardIds);
    const newHand = hand.filter(c => !played.has(c.id));
    const newHands = { ...state.hands, [playerId]: newHand };
    const newTable = [...state.table, { playerId, combo }];
    const next     = GameEngine._next(state.playerIds, playerId);

    const newState = {
      ...state,
      hands: newHands,
      table: newTable,
      skipCount: 0,
      lastPlayerId: playerId,
      currentTurn: next,
      turnStartedAt: Date.now(),
    };

    // Win condition
    if (newHand.length === 0) {
      const scores = calcGameScores(
        state.playerIds.map(id => ({ id, hand: newHands[id] })),
        playerId,
        combo,
      );
      return ok(
        { ...newState, phase: 'game_over' },
        { type: 'game_over', winnerId: playerId, lastCombo: combo, scores },
      );
    }

    return ok(newState, { type: 'cards_played', playerId, combo });
  }

  static processSkip(state, playerId) {
    if (state.phase !== 'playing')      return err('GAME_NOT_ACTIVE');
    if (state.currentTurn !== playerId) return err('NOT_YOUR_TURN');

    const newSkip = state.skipCount + 1;
    const next    = GameEngine._next(state.playerIds, playerId);

    if (newSkip >= 3) {
      // Rally ends – last player leads free
      const newState = {
        ...state,
        table: [],
        skipCount: 0,
        lastPlayerId: null,
        currentTurn: state.lastPlayerId,
        turnStartedAt: Date.now(),
      };
      return ok(newState, { type: 'rally_ended', nextPlayer: state.lastPlayerId });
    }

    const newState = {
      ...state,
      skipCount: newSkip,
      currentTurn: next,
      turnStartedAt: Date.now(),
    };
    return ok(newState, { type: 'player_skipped', playerId, nextTurn: next });
  }

  static processAutoSkip(state) {
    return GameEngine.processSkip(state, state.currentTurn);
  }

  // ─── Public view (hides opponents' cards) ─────────────────────────────────

  static publicState(state, forPlayerId) {
    return {
      gameNumber:    state.gameNumber,
      phase:         state.phase,
      myHand:        state.hands[forPlayerId] || [],
      opponents:     state.playerIds
        .filter(id => id !== forPlayerId)
        .map(id => ({ id, cardCount: (state.hands[id] || []).length })),
      currentTurn:   state.currentTurn,
      table:         state.table,
      skipCount:     state.skipCount,
      timeLeft:      Math.max(0, TURN_TIMEOUT_MS - (Date.now() - state.turnStartedAt)),
    };
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  static _next(ids, currentId) {
    return ids[(ids.indexOf(currentId) + 1) % ids.length];
  }
}

// result helpers
function ok(state, event) { return { ok: true, state, event }; }
function err(code)        { return { ok: false, error: code }; }

module.exports = { GameEngine, TURN_TIMEOUT_MS };
