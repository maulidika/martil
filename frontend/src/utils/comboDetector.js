// Client-side combo detection — mirrors server validator for instant UI feedback.
// Server still validates everything authoritatively.

const RANKS = ['3','4','5','6','7','8','9','10','J','Q','K','A','2']
const SUITS = ['D','C','H','S']
const RV = Object.fromEntries(RANKS.map((r,i) => [r,i]))
const SV = Object.fromEntries(SUITS.map((s,i) => [s,i]))
export const SUIT_SYM = { S:'♠', H:'♥', C:'♣', D:'♦' }
export const IS_RED   = { H: true, D: true }

export function compareCards(a, b) {
  const rv = RV[a.rank] - RV[b.rank]
  return rv !== 0 ? rv : SV[a.suit] - SV[b.suit]
}

export function sortHand(cards) {
  return [...cards].sort(compareCards)
}

// Straight yang sah (harus identik dengan VALID_STRAIGHTS di backend/src/game/validator.js).
// Kunci disusun dengan urutan tangan pemain (3 < 4 < ... < K < A < 2), sama seperti
// hasil sort pada _paketan() — jadi A-2-3-4-5 berkunci '3,4,5,A,2'.
const VALID_STRAIGHTS = (() => {
  const sortedKey = (ranks) => [...ranks].sort((a, b) => RV[a] - RV[b]).join(',')
  const s = new Set()

  // Jendela 5 kartu berurutan dari 3 sampai As: 3-4-5-6-7 … 10-J-Q-K-A.
  // J-Q-K-A-2, Q-K-A-2-3, dan K-A-2-3-4 TIDAK sah (2 tidak boleh di tengah/ujung atas).
  for (let i = 0; i <= RANKS.length - 5; i++) {
    const seq = RANKS.slice(i, i + 5)
    if (seq.indexOf('2') > 1) continue
    s.add(sortedKey(seq))
  }

  // Khusus: A-2-3-4-5 dan 2-3-4-5-6 (2 berperan sebagai kartu rendah).
  // Tidak muncul pada jendela di atas karena 2 adalah kartu tertinggi pada urutan tangan.
  s.add(sortedKey(['A', '2', '3', '4', '5']))
  s.add(sortedKey(['2', '3', '4', '5', '6']))
  return s
})()

export function detectCombo(cards) {
  if (!cards?.length) return null
  switch (cards.length) {
    case 1: return { type:'single', label: cardLabel(cards[0]), cards }
    case 2: return _pair(cards)
    case 3: return _tris(cards)
    case 5: return _paketan(cards)
    default: return null
  }
}

function _pair(cards) {
  if (cards[0].rank !== cards[1].rank) return null
  return { type:'pair', label:`Pair ${cards[0].rank}`, cards }
}

function _tris(cards) {
  if (!cards.every(c => c.rank === cards[0].rank)) return null
  return { type:'tris', label:`Tris ${cards[0].rank}`, cards }
}

function _paketan(raw) {
  const cards   = [...raw].sort(compareCards)
  const ranks   = cards.map(c => c.rank)
  const sameSuit = cards.every(c => c.suit === cards[0].suit)
  const straight = VALID_STRAIGHTS.has(ranks.join(','))
  const counts  = ranks.reduce((a,r)=>{ a[r]=(a[r]||0)+1; return a },{})
  const vals    = Object.values(counts)

  if (sameSuit && ranks.join(',') === '10,J,Q,K,A')
    return { type:'paketan', subtype:'royalflush',    label:'Royal Flush',       cards }
  if (sameSuit && straight)
    return { type:'paketan', subtype:'straightflush', label:'Straight Flush',    cards }
  if (vals.includes(4))
    return { type:'paketan', subtype:'fourofakind',   label:'Four of a Kind',    cards }
  if (vals.includes(3) && vals.includes(2))
    return { type:'paketan', subtype:'fullhouse',     label:'Full House',        cards }
  if (sameSuit)
    return { type:'paketan', subtype:'flush',         label:'Flush',             cards }
  if (straight)
    return { type:'paketan', subtype:'straight',      label:'Straight',          cards }
  return null
}

export function cardLabel(card) {
  return `${card.rank}${SUIT_SYM[card.suit]}`
}

export function comboLabel(combo) {
  if (!combo) return ''
  if (combo.type === 'single') return cardLabel(combo.cards[0])
  if (combo.type === 'pair')   return `Pair ${combo.cards[0].rank}`
  if (combo.type === 'tris')   return `Tris ${combo.cards[0].rank}`
  if (combo.type === 'paketan') {
    const sub = { royalflush:'Royal Flush', straightflush:'Straight Flush',
                  fourofakind:'Four of a Kind', fullhouse:'Full House',
                  flush:'Flush', straight:'Straight' }
    return sub[combo.subtype] || combo.subtype
  }
  return ''
}

// Urutan tampil kartu sebuah kombinasi di meja (hanya tampilan; kartu di tangan, data server,
// dan aturan tidak berubah). Straight rendah ditulis menurut urutan mainnya:
// A-2-3-4-5 dan 2-3-4-5-6, bukan 3-4-5-A-2 / 3-4-5-6-2 (urutan tangan di mana 2 tertinggi).
const LOW_STRAIGHT_DISPLAY = [['A', '2', '3', '4', '5'], ['2', '3', '4', '5', '6']]

export function displayOrder(combo) {
  const cards = combo?.cards || []
  if (combo?.type !== 'paketan' || (combo.subtype !== 'straight' && combo.subtype !== 'straightflush')) return cards
  const ranks = new Set(cards.map(c => c.rank))
  const written = LOW_STRAIGHT_DISPLAY.find(seq => ranks.size === 5 && seq.every(r => ranks.has(r)))
  return written ? written.map(r => cards.find(c => c.rank === r)) : cards
}

// ── Perbandingan kekuatan (cermin canBeat/compareCombo di backend/src/game/validator.js) ──
// Dipakai hanya untuk umpan balik instan di UI (tombol PLAY, urutan Combo Detector);
// server tetap memvalidasi segalanya. Diuji identik dengan server di backend/tests/combo.consistency.js.
const PAKETAN_TIER = { straight: 1, flush: 2, fullhouse: 3, fourofakind: 4, straightflush: 5, royalflush: 6 }
const LOW_STRAIGHT_TOP = { '3,4,5,A,2': '5', '3,4,5,6,2': '6' }

// Detail kekuatan sebuah kombinasi hasil detectCombo().
function strength(combo) {
  const cards = [...combo.cards].sort(compareCards)
  const ranks = cards.map(c => c.rank)
  const counts = ranks.reduce((a, r) => { a[r] = (a[r] || 0) + 1; return a }, {})
  const rankWith = (n) => Object.keys(counts).find(r => counts[r] === n)
  const topRank = LOW_STRAIGHT_TOP[ranks.join(',')]
  const highCard = topRank ? cards.find(c => c.rank === topRank) : cards[4]
  switch (combo.type) {
    case 'single': return { cards }
    case 'pair':   return { rank: cards[0].rank, cards }
    case 'tris':   return { rank: cards[0].rank, cards }
    default:
      return {
        tier: PAKETAN_TIER[combo.subtype], subtype: combo.subtype, suit: cards[0].suit,
        highCard, threeRank: rankWith(3), fourRank: rankWith(4), cards,
      }
  }
}

function compareSameSubtype(a, b) {
  switch (a.subtype) {
    case 'straight': case 'straightflush': case 'royalflush':
      return compareCards(a.highCard, b.highCard)
    case 'flush': {
      const sv = SV[a.suit] - SV[b.suit]
      return sv !== 0 ? sv : compareCards(a.highCard, b.highCard)
    }
    case 'fullhouse':   return RV[a.threeRank] - RV[b.threeRank]
    case 'fourofakind': return RV[a.fourRank] - RV[b.fourRank]
    default: return 0
  }
}

// >0 jika a lebih kuat dari b, 0 sama kuat, <0 lebih lemah. Hanya bermakna untuk tipe yang sama.
export function compareCombos(a, b) {
  const x = strength(a), y = strength(b)
  if (a.type === 'single') return compareCards(x.cards[0], y.cards[0])
  if (a.type === 'pair') {
    const rv = RV[x.rank] - RV[y.rank]
    if (rv !== 0) return rv
    return compareCards(x.cards[1], y.cards[1])   // kartu tertinggi pasangan
  }
  if (a.type === 'tris') return RV[x.rank] - RV[y.rank]
  if (x.tier !== y.tier) return x.tier - y.tier
  return compareSameSubtype(x, y)
}

// Apakah `play` boleh dimainkan di atas `table` (meja kosong = selalu boleh).
export function canBeat(play, table) {
  if (!play) return false
  if (!table) return true
  if (play.type !== table.type) return false
  if (play.type === 'paketan') {
    const x = strength(play), y = strength(table)
    if (x.tier !== y.tier) return x.tier > y.tier
    return compareSameSubtype(x, y) > 0
  }
  return compareCombos(play, table) > 0
}
