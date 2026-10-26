'use strict';

const { RANK_VALUE, SUIT_VALUE, compareCards } = require('./deck');

// ─── Straight lookup table ───────────────────────────────────────────────────
const ALL_RANKS = ['3','4','5','6','7','8','9','10','J','Q','K','A','2'];

const VALID_STRAIGHTS = (() => {
  // Sort a set of rank strings by card value (same logic as compareCards)
  function sortedKey(ranks) {
    return ranks
      .map(r => ({ rank: r, suit: 'S', id: r + 'S' }))
      .sort(compareCards)
      .map(c => c.rank)
      .join(',');
  }

  const set = new Set();

  // All 5-card windows through the rank array
  for (let i = 0; i <= ALL_RANKS.length - 5; i++) {
    const seq = ALL_RANKS.slice(i, i + 5);
    const idx2 = seq.indexOf('2');
    // Per spec: J-Q-K-A-2 and Q-K-A-2-3 are NOT valid straights.
    // Block any window where 2 appears at position >= 2 (i.e. in the middle or end as high card).
    if (idx2 > 1) continue;
    set.add(sortedKey(seq));
  }

  // Special: A-2-3-4-5 and 2-3-4-5-6 (2 acts as low card after Ace)
  // These don't appear in standard windows, add sorted keys explicitly.
  set.add(sortedKey(['A', '2', '3', '4', '5'])); // => '3,4,5,A,2'
  set.add(sortedKey(['2', '3', '4', '5', '6'])); // => '3,4,5,6,2'

  return set;
})();

const PAKETAN_TIER = {
  straight:      1,
  flush:         2,
  fullhouse:     3,
  fourofakind:   4,
  straightflush: 5,
  royalflush:    6,
};

// ─── Main detect entry ───────────────────────────────────────────────────────

function detectCombo(cards) {
  if (!cards || cards.length === 0) return null;
  switch (cards.length) {
    case 1: return { type: 'single', cards };
    case 2: return detectPair(cards);
    case 3: return detectTris(cards);
    case 5: return detectPaketan(cards);
    default: return null;
  }
}

// ─── Basic combos ────────────────────────────────────────────────────────────

function detectPair(cards) {
  if (cards[0].rank !== cards[1].rank) return null;
  return { type: 'pair', rank: cards[0].rank, cards };
}

function detectTris(cards) {
  if (!cards.every(c => c.rank === cards[0].rank)) return null;
  return { type: 'tris', rank: cards[0].rank, cards };
}

// ─── Paketan ─────────────────────────────────────────────────────────────────

function detectPaketan(rawCards) {
  const cards    = [...rawCards].sort(compareCards);
  const ranks    = cards.map(c => c.rank);
  const suits    = cards.map(c => c.suit);
  const sameSuit = suits.every(s => s === suits[0]);
  const seqKey   = ranks.join(',');
  const isStraight = VALID_STRAIGHTS.has(seqKey);
  const counts   = rankCounts(ranks);
  const vals     = Object.values(counts);

  // Royal Flush: 10-J-Q-K-A same suit
  if (sameSuit && ranks.join(',') === '10,J,Q,K,A') {
    return { type: 'paketan', subtype: 'royalflush', tier: PAKETAN_TIER.royalflush, suit: suits[0], highCard: cards[4], cards };
  }
  // Straight Flush
  if (sameSuit && isStraight) {
    return { type: 'paketan', subtype: 'straightflush', tier: PAKETAN_TIER.straightflush, highCard: cards[4], cards };
  }
  // Four of a Kind
  if (vals.includes(4)) {
    const fourRank = Object.entries(counts).find(([, v]) => v === 4)[0];
    return { type: 'paketan', subtype: 'fourofakind', tier: PAKETAN_TIER.fourofakind, fourRank, cards };
  }
  // Full House
  if (vals.includes(3) && vals.includes(2)) {
    const threeRank = Object.entries(counts).find(([, v]) => v === 3)[0];
    return { type: 'paketan', subtype: 'fullhouse', tier: PAKETAN_TIER.fullhouse, threeRank, cards };
  }
  // Flush
  if (sameSuit) {
    return { type: 'paketan', subtype: 'flush', tier: PAKETAN_TIER.flush, suit: suits[0], highCard: cards[4], cards };
  }
  // Straight
  if (isStraight) {
    return { type: 'paketan', subtype: 'straight', tier: PAKETAN_TIER.straight, highCard: cards[4], cards };
  }
  return null;
}

// ─── Comparison ──────────────────────────────────────────────────────────────

function canBeat(play, table) {
  if (play.type !== table.type) return false;
  if (play.type === 'paketan') {
    if (play.tier !== table.tier) return play.tier > table.tier;
    return comparePaketanSameSubtype(play, table) > 0;
  }
  return compareCombo(play, table) > 0;
}

function compareCombo(a, b) {
  if (a.type === 'single') return compareCards(a.cards[0], b.cards[0]);
  if (a.type === 'pair') {
    const rv = RANK_VALUE[a.rank] - RANK_VALUE[b.rank];
    if (rv !== 0) return rv;
    const aHigh = a.cards.reduce((h, c) => compareCards(c, h) > 0 ? c : h);
    const bHigh = b.cards.reduce((h, c) => compareCards(c, h) > 0 ? c : h);
    return compareCards(aHigh, bHigh);
  }
  if (a.type === 'tris') return RANK_VALUE[a.rank] - RANK_VALUE[b.rank];
  if (a.type === 'paketan') {
    if (a.tier !== b.tier) return a.tier - b.tier;
    return comparePaketanSameSubtype(a, b);
  }
  return 0;
}

function comparePaketanSameSubtype(a, b) {
  switch (a.subtype) {
    case 'straight':
    case 'straightflush':
    case 'royalflush':
      return compareCards(a.highCard, b.highCard);
    case 'flush': {
      const sv = SUIT_VALUE[a.suit] - SUIT_VALUE[b.suit];
      if (sv !== 0) return sv;
      return compareCards(a.highCard, b.highCard);
    }
    case 'fullhouse':   return RANK_VALUE[a.threeRank] - RANK_VALUE[b.threeRank];
    case 'fourofakind': return RANK_VALUE[a.fourRank]  - RANK_VALUE[b.fourRank];
    default: return 0;
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function rankCounts(ranks) {
  return ranks.reduce((acc, r) => { acc[r] = (acc[r] || 0) + 1; return acc; }, {});
}

function cardsInHand(playedCards, hand) {
  const handIds = new Set(hand.map(c => c.id));
  return playedCards.every(c => handIds.has(c.id));
}

module.exports = { detectCombo, canBeat, compareCombo, cardsInHand, PAKETAN_TIER };
