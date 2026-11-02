// Combo Detector: daftar kombinasi yang bisa dibentuk dari seluruh tangan (dek utama + grup),
// diurutkan dari terlemah ke terkuat. Memakai detectCombo/compareCombos yang sudah ada.
import { detectCombo, compareCombos, sortHand } from './comboDetector'

// Urutan tampil jenis kombinasi (dari yang paling lemah).
export const COMBO_TYPES = [
  { key: 'single',        label: 'Single' },
  { key: 'pair',          label: 'Pair' },
  { key: 'tris',          label: 'Tris' },
  { key: 'straight',      label: 'Straight' },
  { key: 'flush',         label: 'Flush' },
  { key: 'fullhouse',     label: 'Full House' },
  { key: 'fourofakind',   label: 'Four of a Kind' },
  { key: 'straightflush', label: 'Straight Flush' },
  { key: 'royalflush',    label: 'Royal Flush' },
]

const typeKeyOf = (combo) => combo.subtype || combo.type

// Semua subset ukuran k (indeks naik) dari array.
function* subsets(arr, k, start = 0, acc = []) {
  if (acc.length === k) { yield acc.slice(); return }
  for (let i = start; i <= arr.length - (k - acc.length); i++) {
    acc.push(arr[i]); yield* subsets(arr, k, i + 1, acc); acc.pop()
  }
}

/**
 * @returns {Record<string, {ids: string[], combo: object}[]>} per jenis, urut terlemah → terkuat.
 * Kandidat yang sama kuat (mis. Four of a Kind dengan kartu ke-5 berbeda) hanya diwakili satu:
 * yang tersusun dari kartu terendah, supaya siklus klik tidak berisi pilihan yang setara.
 */
export function listAvailableCombos(hand) {
  const cards = sortHand(hand || [])
  const byType = {}
  for (const size of [1, 2, 3, 5]) {
    if (cards.length < size) continue
    for (const sub of subsets(cards, size)) {
      const combo = detectCombo(sub)
      if (!combo) continue
      ;(byType[typeKeyOf(combo)] ||= []).push({ ids: sub.map(c => c.id), combo })
    }
  }
  for (const key of Object.keys(byType)) {
    const sorted = byType[key].map((x, i) => ({ x, i }))
      .sort((a, b) => compareCombos(a.x.combo, b.x.combo) || a.i - b.i)
      .map(({ x }) => x)
    byType[key] = sorted.filter((x, i) => i === 0 || compareCombos(x.combo, sorted[i - 1].combo) !== 0)
  }
  return byType
}

export const sameIds = (a, b) => a.length === b.length && a.every(id => b.includes(id))

/**
 * Klik pada jenis `type`. Klik berulang pada jenis yang sama (dan seleksi masih persis kandidat
 * terakhir) maju ke kandidat berikutnya, lalu kembali ke yang pertama. Selain itu mulai dari yang terlemah.
 * @returns {{ids: string[], index: number, count: number} | null}
 */
export function pickNext(available, type, last, selectedIds) {
  const list = available?.[type]
  if (!list?.length) return null
  let index = 0
  if (last && last.type === type && list[last.index] && sameIds(list[last.index].ids, selectedIds)) {
    index = (last.index + 1) % list.length
  }
  return { ids: list[index].ids, index, count: list.length }
}

/** Pilihan Combo Detector yang masih berlaku (seleksi saat ini persis kandidat terakhir), atau null. */
export function activePickOf(lastPick, available, selectedIds) {
  const cand = lastPick && available?.[lastPick.type]?.[lastPick.index]
  return cand && sameIds(cand.ids, selectedIds) ? lastPick : null
}
