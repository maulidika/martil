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

const VALID_STRAIGHTS = (() => {
  const s = new Set()
  for (let i = 0; i <= RANKS.length - 5; i++) {
    const seq = RANKS.slice(i, i + 5)
    if (seq.indexOf('2') > 1) continue
    s.add(seq.join(','))
  }
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
