'use strict';

// Rank order: 3 < 4 < 5 < 6 < 7 < 8 < 9 < 10 < J < Q < K < A < 2
const RANKS = ['3','4','5','6','7','8','9','10','J','Q','K','A','2'];
// Suit tiebreak: Spade > Heart > Club > Diamond
const SUITS = ['D','C','H','S'];

const RANK_VALUE = Object.fromEntries(RANKS.map((r, i) => [r, i]));
const SUIT_VALUE = Object.fromEntries(SUITS.map((s, i) => [s, i]));

const SUIT_SYMBOL = { S: '♠', H: '♥', C: '♣', D: '♦' };

function createDeck() {
  const deck = [];
  for (const rank of RANKS) {
    for (const suit of SUITS) {
      deck.push({ rank, suit, id: `${rank}${suit}` });
    }
  }
  return deck;
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function deal() {
  const deck = shuffle(createDeck());
  return [
    deck.slice(0, 13),
    deck.slice(13, 26),
    deck.slice(26, 39),
    deck.slice(39, 52),
  ];
}

function compareCards(a, b) {
  const rv = RANK_VALUE[a.rank] - RANK_VALUE[b.rank];
  return rv !== 0 ? rv : SUIT_VALUE[a.suit] - SUIT_VALUE[b.suit];
}

function sortHand(hand) {
  return [...hand].sort(compareCards);
}

function findFirstPlayer(hands) {
  for (let i = 0; i < hands.length; i++) {
    if (hands[i].some(c => c.rank === '3' && c.suit === 'S')) return i;
  }
  return 0;
}

const is2 = (c) => c.rank === '2';
const is3Diamond = (c) => c.rank === '3' && c.suit === 'D';

module.exports = {
  RANKS, SUITS, RANK_VALUE, SUIT_VALUE, SUIT_SYMBOL,
  createDeck, shuffle, deal,
  compareCards, sortHand, findFirstPlayer,
  is2, is3Diamond,
};
