'use strict';

const { is2, is3Diamond } = require('./deck');

/**
 * Score for a losing player's remaining hand.
 */
function calcRemainingScore(hand) {
  if (!hand || hand.length === 0) return { score: 0, penaltyType: 'winner' };

  // Never played (still has all 13)
  if (hand.length === 13) {
    return { score: 52, penaltyType: 'never_played' };
  }

  // Exactly 1 card left = 3♦
  if (hand.length === 1 && is3Diamond(hand[0])) {
    return { score: 35, penaltyType: 'solo_3diamond' };
  }

  const twos    = hand.filter(is2);
  const normals = hand.filter(c => !is2(c));

  const normalScore = normals.length < 9 ? normals.length : normals.length * 2;
  const twoScore    = twos.length * 5;

  return { score: normalScore + twoScore, penaltyType: null };
}

/**
 * Score bonus for the winner based on their last played combo.
 */
function calcWinnerScore(lastCombo) {
  const { type, cards } = lastCombo;
  if (type === 'single') {
    if (cards[0].rank === '2')      return { score: -10, winType: 'single2' };
    if (is3Diamond(cards[0]))       return { score: -35, winType: 'single3diamond' };
  }
  return { score: -5, winType: 'normal' };
}

/**
 * Full game score for all players.
 */
function calcGameScores(players, winnerId, lastCombo) {
  return players.map(p => {
    if (p.id === winnerId) {
      const { score, winType } = calcWinnerScore(lastCombo);
      return { id: p.id, score, winType, isWinner: true, remainingCards: [] };
    }
    const { score, penaltyType } = calcRemainingScore(p.hand);
    return { id: p.id, score, penaltyType, isWinner: false, remainingCards: p.hand };
  });
}

/**
 * Final set rankings (lowest score = rank 1).
 */
function calcSetRankings(totals) {
  return Object.entries(totals)
    .map(([id, totalScore]) => ({ id, totalScore }))
    .sort((a, b) => a.totalScore - b.totalScore)
    .map((p, i) => ({ ...p, rank: i + 1 }));
}

module.exports = { calcRemainingScore, calcWinnerScore, calcGameScores, calcSetRankings };
