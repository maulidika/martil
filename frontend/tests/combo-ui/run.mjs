import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { detectCombo, compareCombos, canBeat, sortHand } from './utils/comboDetector.mjs'
import { listAvailableCombos, pickNext, COMBO_TYPES } from './utils/comboPicker.mjs'
import * as G from './utils/groupChain.mjs'
import { INITIAL_UI, syncUi, reduceHandUi } from './utils/handUi.mjs'

const require = createRequire(import.meta.url)
const server = require('./server/game/validator.js')

let pass = 0, fail = 0
const t = (name, fn) => { try { fn(); pass++; console.log('  PASS ', name) } catch (e) { fail++; console.log('  FAIL ', name, '\n        ', e.message) } }

const RANKS = ['3','4','5','6','7','8','9','10','J','Q','K','A','2'], SUITS = ['D','C','H','S']
const deck = RANKS.flatMap(r => SUITS.map(s => ({ rank: r, suit: s, id: r + s })))
const cards = (...ids) => ids.map(id => deck.find(c => c.id === id))
let seed = 12345
const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32
const randomHand = (n = 13) => { const d = [...deck]; for (let i = d.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [d[i], d[j]] = [d[j], d[i]] } return d.slice(0, n) }
const keyOf = (c) => c.subtype || c.type

// ── Combo Detector: daftar kandidat ─────────────────────────────────────────
const handA = cards('3D','3C','3S','4H','5D','5H','6C','7S','9S','10S','JS','KS','2D')

t('kandidat tiap jenis sah menurut detectCombo, diurutkan terlemah → terkuat, tanpa kandidat setara', () => {
  const av = listAvailableCombos(handA)
  for (const [type, list] of Object.entries(av)) {
    for (const { ids, combo } of list) assert.equal(keyOf(detectCombo(cards(...ids))), type)
    for (let i = 1; i < list.length; i++) assert.ok(compareCombos(list[i].combo, list[i - 1].combo) > 0, `${type} #${i} harus lebih kuat`)
  }
  assert.deepEqual(av.single.map(x => x.ids[0]), sortHand(handA).map(c => c.id))   // single: 3D … 2D
})
t('properti (300 tangan acak): jenis & urutan kandidat sama dengan brute force memakai validator SERVER', () => {
  for (let n = 0; n < 300; n++) {
    const hand = randomHand(5 + Math.floor(rnd() * 9))
    const av = listAvailableCombos(hand)
    // brute force dengan server
    const sorted = sortHand(hand), expectTypes = new Map()
    const rec = (start, acc, size) => {
      if (acc.length === size) { const c = server.detectCombo(acc.slice()); if (c) { const k = c.subtype || c.type; (expectTypes.get(k) || expectTypes.set(k, []).get(k)).push(c) } return }
      for (let i = start; i < sorted.length; i++) { acc.push(sorted[i]); rec(i + 1, acc, size); acc.pop() }
    }
    for (const size of [1, 2, 3, 5]) if (sorted.length >= size) rec(0, [], size)
    assert.deepEqual(Object.keys(av).sort(), [...expectTypes.keys()].sort(), `jenis tersedia tidak sama pada ${hand.map(c => c.id)}`)
    for (const [k, list] of Object.entries(av)) {
      for (let i = 1; i < list.length; i++) {
        const lo = server.detectCombo(cards(...list[i - 1].ids)), hi = server.detectCombo(cards(...list[i].ids))
        assert.ok(server.canBeat(hi, lo) && !server.canBeat(lo, hi), `${k}: urutan salah menurut server`)
      }
      // jumlah kandidat = jumlah tingkat kekuatan berbeda menurut server
      const classes = []
      for (const c of expectTypes.get(k)) if (!classes.some(x => !server.canBeat(c, x) && !server.canBeat(x, c))) classes.push(c)
      assert.equal(list.length, classes.length, `${k}: jumlah kandidat berbeda`)
    }
  }
})
t('tangan tanpa kombinasi lebih tinggi hanya menampilkan jenis yang memang ada', () => {
  const av = listAvailableCombos(cards('3D','5C','7H','9S','JD'))
  assert.deepEqual(Object.keys(av), ['single'])
  assert.equal(listAvailableCombos([]).single, undefined)
})
t('jenis yang tampil di panel mengikuti urutan lemah → kuat', () => {
  assert.deepEqual(COMBO_TYPES.map(x => x.key), ['single','pair','tris','straight','flush','fullhouse','fourofakind','straightflush','royalflush'])
})
t('Four of a Kind: kandidat setara (kartu ke-5 berbeda) hanya diwakili satu, yang terendah', () => {
  const av = listAvailableCombos(cards('4D','4C','4H','4S','2D','KC','AH'))
  assert.equal(av.fourofakind.length, 1)
  assert.deepEqual(av.fourofakind[0].ids.sort(), ['4C','4D','4H','4S','KC'].sort())
})

// ── Combo Detector: siklus klik ─────────────────────────────────────────────
t('klik berulang pada jenis yang sama berganti terlemah → terkuat lalu kembali ke pertama', () => {
  const av = listAvailableCombos(handA), n = av.pair.length
  assert.ok(n >= 3)
  let last = null, sel = [], seen = []
  for (let i = 0; i < n + 2; i++) {
    const r = pickNext(av, 'pair', last, sel); seen.push(r.index); last = { type: 'pair', index: r.index }; sel = r.ids
  }
  assert.deepEqual(seen, [...Array(n).keys(), 0, 1])
})
t('ganti jenis atau ubah seleksi manual → mulai lagi dari yang terlemah', () => {
  const av = listAvailableCombos(handA)
  const a = pickNext(av, 'pair', null, []); const b = pickNext(av, 'pair', { type: 'pair', index: a.index }, a.ids)
  assert.equal(b.index, 1)
  assert.equal(pickNext(av, 'tris', { type: 'pair', index: 1 }, b.ids).index, 0)               // jenis lain
  assert.equal(pickNext(av, 'pair', { type: 'pair', index: 1 }, [...b.ids, '9S']).index, 0)    // seleksi diubah manual
  assert.equal(pickNext(av, 'royalflush', null, []), null)                                      // jenis tidak tersedia
})

// ── Group Chain ──────────────────────────────────────────────────────────────
const hand = ['3D','3C','4H','5D','6C','7S','9S','JS','KS','2D']
t('groupSelected: minimal 2 kartu, urutan mengikuti tangan, jumlah grup tidak dibatasi', () => {
  assert.deepEqual(G.groupSelected([], ['9S'], hand), [])
  let gs = G.groupSelected([], ['9S', '3D'], hand); assert.deepEqual(gs, [['3D', '9S']])
  gs = G.groupSelected(gs, ['4H', '5D'], hand); gs = G.groupSelected(gs, ['6C', '7S'], hand); gs = G.groupSelected(gs, ['JS', 'KS'], hand)
  assert.equal(gs.length, 4)
  assert.deepEqual(G.mainDeckIds(hand, gs), ['3C', '2D'])
})
t('mengelompokkan kartu yang berasal dari grup lama membubarkan grup itu; sisanya kembali ke dek utama', () => {
  const gs = [['3D', '3C', '4H'], ['5D', '6C']]
  const next = G.groupSelected(gs, ['3C', '9S'], hand)
  assert.deepEqual(next, [['5D', '6C'], ['3C', '9S']])
  assert.deepEqual(G.mainDeckIds(hand, next), ['3D', '4H', '7S', 'JS', 'KS', '2D'])
})
t('ungroup mengembalikan seluruh kartu grup ke dek utama; grup lain utuh', () => {
  const gs = [['3D', '3C'], ['5D', '6C']]; const next = G.ungroupAt(gs, 0)
  assert.deepEqual(next, [['5D', '6C']]); assert.ok(G.mainDeckIds(hand, next).includes('3D'))
})
t('pruneGroups: kartu dimainkan → seluruh grup terkait bubar; grup lain utuh; referensi sama bila tak berubah', () => {
  const gs = [['3D', '3C', '4H'], ['5D', '6C'], ['9S', 'JS']]
  assert.equal(G.pruneGroups(gs, hand), gs)
  const afterPlay = hand.filter(id => !['3D', '9S', '2D'].includes(id))   // main 3D (grup 1), 9S (grup 3), 2D (bebas)
  const next = G.pruneGroups(gs, afterPlay)
  assert.deepEqual(next, [['5D', '6C']])
  assert.deepEqual(G.mainDeckIds(afterPlay, next), ['3C', '4H', '7S', 'JS', 'KS'])   // sisa kartu grup kembali ke dek
})
t('pruneGroups: grup tersisa < 2 kartu dibubarkan', () => { assert.deepEqual(G.pruneGroups([['3D']], ['3D']), []) })
t('Flexible grouping: Combo Detector mengambil kartu dari grup dan dek; selisih grup tetap utuh sampai dimainkan', () => {
  const hand2 = ['3D','3C','3S','5D','5H','6C','9S','JS']
  const gs = [['3D','3C'], ['5D','5H']]
  const av = listAvailableCombos(hand2.map(id => deck.find(c => c.id === id)))
  const tris = av.tris[0].ids.sort()
  assert.deepEqual(tris, ['3C','3D','3S'])                      // 2 kartu dari grup + 1 dari dek
  assert.deepEqual(G.pruneGroups(gs, hand2), gs)                // hanya memilih: grup tidak berubah
  const played = hand2.filter(id => !tris.includes(id))
  assert.deepEqual(G.mainDeckIds(played, G.pruneGroups(gs, played)), ['6C','9S','JS'])
  assert.deepEqual(G.pruneGroups(gs, played), [['5D','5H']])    // grup 3D-3C bubar, 5D-5H tetap
})
t('pilih grup: seluruh kartunya terpilih; pilih lagi → terlepas', () => {
  let sel = G.EMPTY_SELECTION
  sel = G.tapGroup(sel, ['3D','3C']); assert.deepEqual(sel.ids, ['3D','3C'])
  sel = G.tapGroup(sel, ['3D','3C']); assert.deepEqual(sel.ids, [])
  assert.equal(G.isGroupSelected(['3D','3C'], ['3C','3D','9S']), true)
  assert.equal(G.isGroupSelected(['3D','3C'], ['3C']), false)
})

// ── Prioritas seleksi ────────────────────────────────────────────────────────
t('Combo Detector menggantikan seleksi sebelumnya (manual maupun detektor)', () => {
  let sel = G.tapCard(G.tapCard(G.EMPTY_SELECTION, '3D'), '9S')
  assert.deepEqual(sel.ids, ['3D', '9S'])
  sel = G.selectByDetector(['5D', '5H']); assert.deepEqual(sel.ids, ['5D', '5H']); assert.equal(sel.source, 'detector')
  sel = G.selectByDetector(['6C']); assert.deepEqual(sel.ids, ['6C'])
})
t('seleksi manual setelah Combo Detector menggantikan seleksi detektor, lalu menambah seperti biasa', () => {
  let sel = G.selectByDetector(['5D', '5H'])
  sel = G.tapCard(sel, '9S'); assert.deepEqual(sel, { ids: ['9S'], source: 'manual' })
  sel = G.tapCard(sel, 'JS'); assert.deepEqual(sel.ids, ['9S', 'JS'])
  sel = G.tapCard(sel, '9S'); assert.deepEqual(sel.ids, ['JS'])
  sel = G.selectByDetector(['5D', '5H']); sel = G.tapGroup(sel, ['3D', '3C']); assert.deepEqual(sel.ids, ['3D', '3C'])
})
// ── Posisi tombol ────────────────────────────────────────────────────────────
t('anchorAbove: tengah-tengah rentang kartu terpilih, di atas kartu tertinggi', () => {
  assert.deepEqual(G.anchorAbove([{ left: 10, top: 52, width: 42 }, { left: 36, top: 52, width: 42 }, { left: 100, top: 70, width: 30 }]), { x: 70, y: 52 })
  assert.deepEqual(G.anchorAbove([{ left: 0, top: 8, width: 40 }]), { x: 20, y: 8 })
  assert.equal(G.anchorAbove([]), null)
})

// ── Skenario interaksi lengkap lewat reducer yang dipakai GamePage ──────────────
const H = ['3D','3C','3S','4H','5D','5H','6C','7S','9S','JS','KS','2D']
const handCards = cards(...H)
const av = listAvailableCombos(handCards)
const start = () => ({ ui: syncUi(INITIAL_UI, 'ROOM:1', H), sel: [] })
const step = (st, action, hand = H) => { const r = reduceHandUi(st.ui, st.sel, hand, action); return { ui: r.ui, sel: r.selIds } }

t('skenario: pilih 2 kartu → GROUP → kartu pindah ke grup, seleksi kosong', () => {
  let st = start()
  st = step(st, { type: 'tapCard', id: '9S' }); st = step(st, { type: 'tapCard', id: 'JS' })
  assert.deepEqual(st.sel, ['9S', 'JS'])
  st = step(st, { type: 'group' })
  assert.deepEqual(st.ui.groups, [['9S', 'JS']]); assert.deepEqual(st.sel, [])
  assert.ok(!G.mainDeckIds(H, st.ui.groups).includes('9S'))
})
t('skenario: GROUP butuh minimal 2 kartu', () => {
  let st = step(start(), { type: 'tapCard', id: '9S' }); st = step(st, { type: 'group' })
  assert.deepEqual(st.ui.groups, []); assert.deepEqual(st.sel, ['9S'])
})
t('skenario: klik grup memilih semua kartunya; UNGROUP mengembalikan semuanya ke dek utama', () => {
  let st = start()
  st = step(st, { type: 'tapCard', id: '5D' }); st = step(st, { type: 'tapCard', id: '5H' }); st = step(st, { type: 'group' })
  st = step(st, { type: 'tapGroup', index: 0 }); assert.deepEqual(st.sel, ['5D', '5H'])
  st = step(st, { type: 'ungroup', index: 0 })
  assert.deepEqual(st.ui.groups, []); assert.deepEqual(st.sel, [])
  assert.deepEqual(G.mainDeckIds(H, st.ui.groups), H)
})
t('skenario: banyak grup selama kartu cukup (4 grup dari 8 kartu)', () => {
  let st = start()
  for (const pair of [['3D','3C'], ['4H','5D'], ['6C','7S'], ['9S','JS']]) {
    for (const id of pair) st = step(st, { type: 'tapCard', id })
    st = step(st, { type: 'group' })
  }
  assert.equal(st.ui.groups.length, 4); assert.deepEqual(G.mainDeckIds(H, st.ui.groups), ['3S', '5H', 'KS', '2D'])
})
t('skenario: Combo Detector mengambil kartu dari grup + dek; dimainkan → kartu keluar, sisa grup kembali ke dek', () => {
  let st = start()
  for (const id of ['3D', '3C']) st = step(st, { type: 'tapCard', id }); st = step(st, { type: 'group' })      // grup [3D,3C]
  for (const id of ['5D', '5H']) st = step(st, { type: 'tapCard', id }); st = step(st, { type: 'group' })      // grup [5D,5H]
  st = step(st, { type: 'detector', available: av, kind: 'tris' })
  assert.deepEqual([...st.sel].sort(), ['3C', '3D', '3S'])                       // 2 dari grup + 1 dari dek
  assert.deepEqual(st.ui.groups, [['3D', '3C'], ['5D', '5H']])                   // memilih tidak mengubah grup
  st = step(st, { type: 'clear' })                                               // PLAY → resetSel
  const afterPlay = H.filter(id => !['3C', '3D', '3S'].includes(id))
  const synced = syncUi(st.ui, 'ROOM:1', afterPlay)                              // tangan baru dari server
  assert.deepEqual(synced.groups, [['5D', '5H']])                                // grup terkait bubar, grup lain utuh
  assert.ok(G.mainDeckIds(afterPlay, synced.groups).includes('4H'))
})
t('skenario: sisa kartu grup yang kartunya sebagian dimainkan kembali ke dek utama', () => {
  let st = start()
  for (const id of ['6C', '7S', '9S']) st = step(st, { type: 'tapCard', id }); st = step(st, { type: 'group' })
  const afterPlay = H.filter(id => id !== '7S')
  const synced = syncUi(st.ui, 'ROOM:1', afterPlay)
  assert.deepEqual(synced.groups, [])
  assert.ok(['6C', '9S'].every(id => G.mainDeckIds(afterPlay, synced.groups).includes(id)))
})
t('skenario: CLEAR membersihkan seleksi tanpa menghapus Group Chain', () => {
  let st = start()
  for (const id of ['9S', 'JS']) st = step(st, { type: 'tapCard', id }); st = step(st, { type: 'group' })
  st = step(st, { type: 'tapCard', id: '3D' }); st = step(st, { type: 'tapGroup', index: 0 })
  st = step(st, { type: 'clear' })
  assert.deepEqual(st.sel, []); assert.deepEqual(st.ui.groups, [['9S', 'JS']])
})
t('skenario: Combo Detector berulang lewat reducer: ganti pilihan, wrap, lalu seleksi manual menggantikan', () => {
  let st = start(); const n = av.pair.length; const seen = []
  for (let i = 0; i < n + 1; i++) { st = step(st, { type: 'detector', available: av, kind: 'pair' }); seen.push([...st.sel].sort().join('+')) }
  assert.equal(new Set(seen.slice(0, n)).size, n); assert.equal(seen[n], seen[0])        // semua berbeda, lalu kembali ke pertama
  st = step(st, { type: 'tapCard', id: '2D' }); assert.deepEqual(st.sel, ['2D'])         // manual menggantikan seleksi detektor
  st = step(st, { type: 'detector', available: av, kind: 'tris' }); assert.equal(st.sel.length, 3)   // detektor menggantikan manual
  st = step(st, { type: 'tapCard', id: '9S' }); st = step(st, { type: 'tapCard', id: 'JS' })
  st = step(st, { type: 'detector', available: av, kind: 'pair' }); assert.equal(st.ui.lastPick.index, 0)   // seleksi diubah → mulai dari awal
})
t('skenario: Combo Detector tetap bekerja di luar giliran (tidak bergantung giliran)', () => {
  // reducer tidak punya konsep giliran; PLAY/SKIP-lah yang dibatasi (diuji lewat legalitas + render)
  const st = step(start(), { type: 'detector', available: av, kind: 'single' })
  assert.deepEqual(st.sel, ['3D'])
})
t('game/room baru: grup dan seleksi direset (id kartu dipakai ulang antar game)', () => {
  let st = start()
  for (const id of ['9S', 'JS']) st = step(st, { type: 'tapCard', id }); st = step(st, { type: 'group' })
  assert.equal(syncUi(st.ui, 'ROOM:1', H), st.ui)                 // game sama, tangan sama: tidak berubah
  const next = syncUi(st.ui, 'ROOM:2', H)                          // game berikutnya, kartu 9S/JS kebetulan sama
  assert.deepEqual(next.groups, []); assert.equal(next.key, 'ROOM:2')
})

// ── REGRESSI BUG 1: Full House — Pair independen terkunci, hanya Tris yang berganti ─────────────
const fh = (ids) => (listAvailableCombos(cards(...ids)).fullhouse || []).map(x => [...x.ids].sort().join(','))
const sorted = (...ids) => ids.sort().join(',')
t('Full House: 555 + 666 + 22 → 555+22 lalu 666+22 (Pair 22 tetap, hanya Tris berganti)', () => {
  assert.deepEqual(fh(['5D','5C','5H','6D','6C','6H','2D','2C']), [sorted('5D','5C','5H','2D','2C'), sorted('6D','6C','6H','2D','2C')])
})
t('Full House: tanpa Pair independen (hanya 555 dan 666) → 555+66 dan 666+55 diizinkan', () => {
  assert.deepEqual(fh(['5D','5C','5H','6D','6C','6H']), [sorted('5D','5C','5H','6D','6C'), sorted('5D','5C','6D','6C','6H')])   // 555+66 lalu 666+55
})
t('Full House: beberapa Pair independen → satu Pair yang sama (terlemah) dipakai di semua alternatif', () => {
  const r = fh(['5D','5C','5H','6D','6C','6H','2D','2C','7D','7S'])
  assert.deepEqual(r, [sorted('5D','5C','5H','7D','7S'), sorted('6D','6C','6H','7D','7S')])
})
t('Full House: tiga tris tanpa Pair independen → Pair berasal dari pemecahan tris lain', () => {
  const r = fh(['5D','5C','5H','6D','6C','6H','7D','7C','7H'])
  assert.equal(r.length, 3)
  for (const x of r) assert.equal(x.split(',').length, 5)
})
t('Full House: Pair independen + Four of a Kind → Tris diambil dari quad, Pair tetap independen', () => {
  const r = fh(['5D','5C','5H','5S','2D','2C'])
  assert.equal(r.length, 1); assert.ok(r[0].includes('2C') && r[0].includes('2D'))
})
t('Full House: siklus klik mengganti Tris saja; Pair independen identik di tiap alternatif, lalu kembali ke pertama', () => {
  const av = listAvailableCombos(cards('5D','5C','5H','6D','6C','6H','2D','2C'))
  let last = null, sel = [], seen = []
  for (let i = 0; i < 3; i++) { const r = pickNext(av, 'fullhouse', last, sel); seen.push([...r.ids].sort().join(',')); last = { type: 'fullhouse', index: r.index }; sel = r.ids }
  assert.deepEqual(seen, [sorted('5D','5C','5H','2D','2C'), sorted('6D','6C','6H','2D','2C'), sorted('5D','5C','5H','2D','2C')])
})
t('properti (500 tangan acak): ada Pair independen ⇒ semua Full House memakai Pair itu; tidak ada ⇒ Pair dari pemecahan', () => {
  let withPair = 0, withoutPair = 0
  for (let n = 0; n < 500; n++) {
    const hand = randomHand(8 + Math.floor(rnd() * 6))
    const cnt = {}; for (const c of hand) cnt[c.rank] = (cnt[c.rank] || 0) + 1
    const list = listAvailableCombos(hand).fullhouse || []
    const independent = Object.keys(cnt).filter(r => cnt[r] === 2)
    const pairRanks = list.map(x => { const cs = cards(...x.ids); const c = {}; for (const k of cs) c[k.rank] = (c[k.rank] || 0) + 1; return Object.keys(c).find(r => c[r] === 2) })
    if (!list.length) continue
    if (independent.length) {
      withPair++
      assert.ok(pairRanks.every(r => cnt[r] === 2), `Pair independen tidak dipakai pada ${hand.map(c => c.id)}`)
      assert.equal(new Set(pairRanks).size, 1, `Pair berubah antar alternatif pada ${hand.map(c => c.id)}`)
    } else {
      withoutPair++
      assert.ok(pairRanks.every(r => cnt[r] >= 3), `Pair seharusnya hasil pemecahan pada ${hand.map(c => c.id)}`)
    }
  }
  assert.ok(withPair > 5 && withoutPair > 5, `sampel kurang beragam (${withPair}/${withoutPair})`)
})

// ── REGRESI BUG 2: seleksi dek utama dan Group Chain eksklusif ──────────────────────────────
const twoGroups = () => {                       // grup A = [3D,3C], grup B = [5D,5H]; dek utama = sisanya
  let st = start()
  for (const id of ['3D', '3C']) st = step(st, { type: 'tapCard', id }); st = step(st, { type: 'group' })
  for (const id of ['5D', '5H']) st = step(st, { type: 'tapCard', id }); st = step(st, { type: 'group' })
  assert.deepEqual(st.ui.groups, [['3D', '3C'], ['5D', '5H']]); assert.deepEqual(st.sel, [])
  return st
}
const sameGroups = (st, before) => assert.deepEqual(st.ui.groups, before.ui.groups, 'Group Chain tidak boleh berubah saat berpindah sumber seleksi')
t('dek utama → klik grup: seleksi dek dibersihkan, seluruh kartu grup aktif, tidak ada GROUP/penggabungan', () => {
  const base = twoGroups()
  let st = step(base, { type: 'tapCard', id: '9S' }); st = step(st, { type: 'tapCard', id: 'JS' })
  assert.equal(G.canGroupSelection(st.sel, st.ui.groups), true)          // sebelum pindah: GROUP tersedia
  st = step(st, { type: 'tapGroup', index: 0 })
  assert.deepEqual(st.sel, ['3D', '3C']); sameGroups(st, base)
  assert.equal(G.canGroupSelection(st.sel, st.ui.groups), false)         // sesudah pindah: GROUP tidak muncul
})
t('Group A → klik Group B: A turun, B naik', () => {
  const base = twoGroups()
  let st = step(base, { type: 'tapGroup', index: 0 }); assert.deepEqual(st.sel, ['3D', '3C'])
  st = step(st, { type: 'tapGroup', index: 1 })
  assert.deepEqual(st.sel, ['5D', '5H']); sameGroups(st, base)
  assert.equal(G.canGroupSelection(st.sel, st.ui.groups), false)
})
t('Group → klik dek utama: grup turun, seleksi dek utama aktif; kartu berikutnya menambah seleksi dek', () => {
  const base = twoGroups()
  let st = step(base, { type: 'tapGroup', index: 1 })
  st = step(st, { type: 'tapCard', id: '9S' })
  assert.deepEqual(st.sel, ['9S']); sameGroups(st, base)                 // grup turun, tidak tergabung
  assert.equal(G.canGroupSelection(st.sel, st.ui.groups), false)         // baru 1 kartu dek → belum ada GROUP
  st = step(st, { type: 'tapCard', id: 'JS' })
  assert.deepEqual(st.sel, ['9S', 'JS']); assert.equal(G.canGroupSelection(st.sel, st.ui.groups), true)   // ≥2 kartu dek → GROUP
})
t('klik grup yang sedang terpilih lagi → turun; rangkaian berpindah-pindah tidak pernah mengubah grup', () => {
  const base = twoGroups()
  let st = step(base, { type: 'tapGroup', index: 0 }); st = step(st, { type: 'tapGroup', index: 0 })
  assert.deepEqual(st.sel, [])
  for (const a of [{ type: 'tapCard', id: '4H' }, { type: 'tapGroup', index: 1 }, { type: 'tapCard', id: '7S' }, { type: 'tapGroup', index: 0 }, { type: 'tapCard', id: '2D' }, { type: 'tapGroup', index: 1 }]) {
    st = step(st, a); sameGroups(st, base)
  }
  assert.deepEqual(st.sel, ['5D', '5H'])
})
t('GROUP hanya untuk ≥2 kartu dek utama: <2, memuat kartu grup, atau seleksi campuran Combo Detector → tidak boleh', () => {
  const base = twoGroups()
  assert.equal(G.canGroupSelection(['9S'], base.ui.groups), false)
  assert.equal(G.canGroupSelection(['9S', 'JS'], base.ui.groups), true)
  assert.equal(G.canGroupSelection(['9S', '3D'], base.ui.groups), false)            // satu kartu berasal dari grup
  assert.equal(G.canGroupSelection(['3D', '3C'], base.ui.groups), false)            // grup utuh
  // Combo Detector memilih tris 3D,3C (grup) + 3S (dek): campuran → tanpa GROUP, aksi 'group' tidak berefek
  let st = step(base, { type: 'detector', available: listAvailableCombos(cards(...H)), kind: 'tris' })
  assert.deepEqual([...st.sel].sort(), ['3C', '3D', '3S']); assert.equal(G.canGroupSelection(st.sel, st.ui.groups), false)
  const after = step(st, { type: 'group' }); assert.deepEqual(after.ui.groups, base.ui.groups); assert.deepEqual(after.sel, st.sel)
})
t('Combo Detector yang hanya memilih kartu dek utama (≥2) tetap boleh di-GROUP', () => {
  const base = twoGroups()
  let st = step(base, { type: 'detector', available: listAvailableCombos(cards(...H)), kind: 'pair' })
  const cand = st.sel
  if (cand.every(id => !base.ui.groups.flat().includes(id))) assert.equal(G.canGroupSelection(cand, base.ui.groups), true)
  else { st = step(base, { type: 'detector', available: listAvailableCombos(cards('9S', 'JS', 'KS', '2D')), kind: 'single' }); assert.equal(G.canGroupSelection(st.sel, base.ui.groups), false) }
})
t('seleksi dek utama dibuat lewat klik manual lalu GROUP tetap membuat grup baru', () => {
  const base = twoGroups()
  let st = step(base, { type: 'tapCard', id: '9S' }); st = step(st, { type: 'tapCard', id: 'JS' }); st = step(st, { type: 'group' })
  assert.deepEqual(st.ui.groups, [['3D', '3C'], ['5D', '5H'], ['9S', 'JS']]); assert.deepEqual(st.sel, [])
})
t('UNGROUP, CLEAR, Combo Detector tetap berfungsi setelah berpindah sumber seleksi', () => {
  const base = twoGroups()
  let st = step(base, { type: 'tapCard', id: '9S' }); st = step(st, { type: 'tapGroup', index: 0 })
  st = step(st, { type: 'ungroup', index: 0 })
  assert.deepEqual(st.ui.groups, [['5D', '5H']]); assert.deepEqual(st.sel, [])
  assert.ok(G.mainDeckIds(H, st.ui.groups).includes('3D') && G.mainDeckIds(H, st.ui.groups).includes('3C'))
  st = step(st, { type: 'tapGroup', index: 0 }); st = step(st, { type: 'clear' })
  assert.deepEqual(st.sel, []); assert.deepEqual(st.ui.groups, [['5D', '5H']])
  st = step(st, { type: 'tapGroup', index: 0 }); st = step(st, { type: 'detector', available: listAvailableCombos(cards(...H)), kind: 'single' })
  assert.equal(st.sel.length, 1)                                                  // detektor menggantikan seleksi grup
})

// ── PLAY: legalitas di klien = aturan engine ─────────────────────────────────
const legal = (sel, table) => { const c = detectCombo(cards(...sel)); return !!c && (!table || canBeat(c, detectCombo(cards(...table)))) }
t('legalitas PLAY: meja kosong = kombinasi sah; meja terisi harus tipe sama dan lebih kuat', () => {
  assert.equal(legal(['3D','4C']), false)                       // bukan pair
  assert.equal(legal(['3D','3C']), true)                        // pair, meja kosong
  assert.equal(legal(['4D','4C'], ['3D','3C']), true)
  assert.equal(legal(['3D','3C'], ['4D','4C']), false)
  assert.equal(legal(['4D','4C','4H'], ['3D','3C']), false)     // tipe beda
  assert.equal(legal(['3S','5S','8S','JS','KS'], ['3S','4H','5D','6C','7S']), true)    // flush > straight
  assert.equal(legal(['3S','4H','5D','6C','7S'], ['3S','5S','8S','JS','KS']), false)
  assert.equal(legal(['AS','2H','3D','4C','5S'], ['2S','3H','4D','5C','6S']), false)   // A-2-3-4-5 < 2-3-4-5-6
  assert.equal(legal(['4D','4C'], ['4D','4C']), false)          // sama kuat tidak mengalahkan
})

console.log(`\n${pass}/${pass + fail} lulus`); process.exit(fail ? 1 : 0)
