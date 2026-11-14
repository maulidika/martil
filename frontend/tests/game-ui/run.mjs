import assert from 'node:assert/strict'
import { computeLayout, seatSides, orderOpponents, turnRingPct, CARD_RATIO } from './utils/gameLayout.mjs'
import { getProfile, formatCoins, betLabel } from './utils/profile.mjs'

let pass = 0, fail = 0
const t = (name, fn) => { try { fn(); pass++; console.log('  PASS ', name) } catch (e) { fail++; console.log('  FAIL ', name, '\n        ', e.message) } }

// Resolusi umum (lebar × tinggi viewport pada zoom 100%): laptop, desktop, tablet, HP landscape/portrait.
const VIEWPORTS = [[1366, 650], [1366, 768], [1280, 620], [1440, 760], [1536, 730], [1920, 950], [1920, 1080], [2560, 1300], [1024, 600], [1024, 768], [844, 390], [740, 360], [390, 780], [360, 640], [412, 860]]

t('13 kartu selalu muat di lebar yang tersedia (tanpa scroll horizontal) dan tidak lebih besar dari batas', () => {
  for (const [w, h] of VIEWPORTS) {
    const L = computeLayout(w, h)
    const rowWidth = L.card + 12 * L.card * L.step + 20            // + padding dalam deretan
    const avail = w - L.side * 2 - (L.compact ? 12 : 40)
    assert.ok(rowWidth <= avail + 1, `${w}x${h}: deretan ${rowWidth} > tersedia ${avail}`)
    assert.ok(L.card >= (L.compact ? 38 : 44) && L.card <= 110, `${w}x${h}: ukuran kartu ${L.card} di luar batas`)
    assert.equal(L.cardH, Math.round(L.card * CARD_RATIO))
  }
})
t('kartu tidak dikecilkan berlebihan pada layar desktop/laptop (zoom 100%)', () => {
  assert.ok(computeLayout(1366, 650).card >= 80)
  assert.ok(computeLayout(1920, 950).card >= 100)
  assert.ok(computeLayout(1280, 620).card >= 74)
})
t('tinggi zona tangan + kursi tidak melebihi layar; kartu di meja tidak menimpa kursi atas', () => {
  for (const [w, h] of VIEWPORTS) {
    const L = computeLayout(w, h)
    const tableTop = (L.compact ? 64 : 10) + L.seatH
    const tableH = L.table * CARD_RATIO + L.seatFont * 3.4
    assert.ok(L.bottomH + tableTop + Math.min(tableH, 60) <= h, `${w}x${h}: zona bawah ${L.bottomH} + kursi ${tableTop} melebihi tinggi layar`)
    assert.ok(L.table >= 30 && L.table <= L.card * 1.2 + 1)
    assert.ok(L.lift >= 8)
  }
})
t('layar sempit (<720px) memakai layout compact tanpa kolom samping; selebihnya kolom samping selalu ada', () => {
  assert.equal(computeLayout(390, 780).compact, true); assert.equal(computeLayout(390, 780).side, 0)
  assert.equal(computeLayout(719, 700).compact, true); assert.equal(computeLayout(720, 700).compact, false)
  for (const [w, h] of VIEWPORTS.filter(v => v[0] >= 720)) { const L = computeLayout(w, h); assert.ok(L.side >= 108 && L.side <= 176) }
})
t('ukuran adaptif terhadap viewport (lebih besar di layar besar, tidak NaN)', () => {
  const a = computeLayout(1366, 650), b = computeLayout(1920, 1080)
  assert.ok(b.card > a.card && b.avatar > a.avatar)
  for (const [w, h] of VIEWPORTS) for (const v of Object.values(computeLayout(w, h))) if (typeof v === 'number') assert.ok(Number.isFinite(v))
})
t('daftar Combo Detector boleh tumbuh ke atas tetapi tidak menimpa kursi kiri', () => {
  for (const [w, h] of VIEWPORTS.filter(v => v[0] >= 720)) {
    const L = computeLayout(w, h)
    const seatBottom = L.seatFont * 5 + 12 + L.seatH
    assert.ok(h - L.detectorMaxH - 110 >= seatBottom + 12 - 1 || L.detectorMaxH === 70, `${w}x${h}: detektor menimpa kursi`)
  }
})

t('posisi kursi proporsional (berlawanan arah jarum jam): 1 lawan = atas; 2 = kanan/kiri; 3 = kanan/atas/kiri', () => {
  assert.deepEqual(seatSides(0), []); assert.deepEqual(seatSides(1), ['top'])
  assert.deepEqual(seatSides(2), ['right', 'left']); assert.deepEqual(seatSides(3), ['right', 'top', 'left'])
})
t('urutan duduk: lawan yang bermain setelah saya didahulukan (seat pertama), lalu berikutnya, lalu yang terakhir', () => {
  const opp = [{ id: 'a' }, { id: 'c' }, { id: 'd' }]                // urutan asli tanpa saya
  assert.deepEqual(orderOpponents(opp, ['a', 'me', 'c', 'd'], 'me').map(o => o.id), ['c', 'd', 'a'])
  assert.deepEqual(orderOpponents(opp, ['me', 'a', 'c', 'd'], 'me').map(o => o.id), ['a', 'c', 'd'])
  assert.deepEqual(orderOpponents(opp, ['a', 'c', 'd', 'me'], 'me').map(o => o.id), ['a', 'c', 'd'])
})
t('urutan duduk: data anggota room tidak cocok / kosong → urutan asli (tidak mengacak, tidak menghilangkan lawan)', () => {
  const opp = [{ id: 'a' }, { id: 'c' }, { id: 'd' }]
  assert.deepEqual(orderOpponents(opp, [], 'me'), opp)
  assert.deepEqual(orderOpponents(opp, ['a', 'c', 'd'], 'me'), opp)             // saya tidak ada di daftar
  assert.deepEqual(orderOpponents(opp, ['a', 'me', 'x', 'd'], 'me'), opp)       // peserta tidak sama
})
// Where each player sits for `me`, given the Room's join order. Sides come from seatSides, order from orderOpponents.
const seatMap = (players, me) => {
  const opp = players.filter(id => id !== me).map(id => ({ id }))
  const ordered = orderOpponents(opp, players, me), sides = seatSides(ordered.length)
  return Object.fromEntries(ordered.map((o, i) => [sides[i], o.id]))
}
t('contoh Host: P1 bawah, P2 kanan, P3 atas, P4 kiri (berlawanan arah jarum jam)', () => {
  assert.deepEqual(seatMap(['P1', 'P2', 'P3', 'P4'], 'P1'), { right: 'P2', top: 'P3', left: 'P4' })
})
t('setiap pemain selalu di bawah menurut sudut pandangnya sendiri; yang berikutnya di kanan, lalu atas, lalu kiri', () => {
  const players = ['P1', 'P2', 'P3', 'P4']
  assert.deepEqual(seatMap(players, 'P2'), { right: 'P3', top: 'P4', left: 'P1' })
  assert.deepEqual(seatMap(players, 'P3'), { right: 'P4', top: 'P1', left: 'P2' })
  assert.deepEqual(seatMap(players, 'P4'), { right: 'P1', top: 'P2', left: 'P3' })
})
t('posisi mengikuti URUTAN BERGABUNG, bukan isi/urutan abjad ID', () => {
  const ids = ['zzz9', 'mmm5', 'aaa1', 'kkk3']                       // urutan bergabung; ID sengaja tidak terurut
  assert.deepEqual(seatMap(ids, 'zzz9'), { right: 'mmm5', top: 'aaa1', left: 'kkk3' })
  assert.deepEqual(seatMap(ids, 'aaa1'), { right: 'kkk3', top: 'zzz9', left: 'mmm5' })
  assert.deepEqual(seatMap([...ids].reverse(), 'zzz9'), { right: 'kkk3', top: 'aaa1', left: 'mmm5' })   // urutan bergabung berbeda → posisi berbeda
})
t('urutan giliran/ID tidak diubah oleh tata letak: orderOpponents hanya memutar, tidak mengacak', () => {
  const opp = [{ id: 'P2' }, { id: 'P3' }, { id: 'P4' }]
  const out = orderOpponents(opp, ['P1', 'P2', 'P3', 'P4'], 'P1')
  assert.deepEqual(out.map(o => o.id), ['P2', 'P3', 'P4']); assert.deepEqual(opp.map(o => o.id), ['P2', 'P3', 'P4'])
})
t('cincin timer: 30 dtk = 100%, 15 dtk = 50%, 0 = 0%, tidak keluar rentang', () => {
  assert.equal(turnRingPct(30), 100); assert.equal(turnRingPct(15), 50); assert.equal(turnRingPct(0), 0)
  assert.equal(turnRingPct(45), 100); assert.equal(turnRingPct(-3), 0); assert.equal(turnRingPct(null), 100)
})

// ── Profil & taruhan ──
t('profil dummy stabil per id, memakai username akun bila ada, id singkat untuk lawan', () => {
  assert.deepEqual(getProfile('abc12345xyz'), getProfile('abc12345xyz'))
  assert.equal(getProfile('abc12345xyz').name, 'abc12345')
  assert.equal(getProfile('abc12345xyz', { username: 'Syamil' }).name, 'Syamil')
  const p = getProfile('u1'); assert.ok(p.level >= 1 && p.level <= 40 && p.coins > 0 && p.tint)
  assert.notDeepEqual(getProfile('u1'), getProfile('u2'))
})
t('format koin: K/M, koma desimal Indonesia', () => {
  assert.equal(formatCoins(260000), '260K'); assert.equal(formatCoins(6500000), '6,50M')
  assert.equal(formatCoins(133000), '133K'); assert.equal(formatCoins(999), '999'); assert.equal(formatCoins(1500), '1,50K')
  assert.equal(formatCoins(undefined), '—'); assert.equal(formatCoins(NaN), '—')
})
t('taruhan: tidak di-hardcode; berasal dari data Room; kosong bila belum ada; tidak tercampur saldo koin pemain', () => {
  assert.equal(betLabel(null), null); assert.equal(betLabel({}), null); assert.equal(betLabel({ bet: undefined }), null)
  assert.equal(betLabel({ bet: 5000 }), '5K'); assert.equal(betLabel({ bet: 10000 }), '10K'); assert.equal(betLabel({ bet: '25K' }), '25K')
  assert.equal(betLabel({ bet: 5000, coins: 999999 }), '5K')                    // field koin/saldo tidak memengaruhi taruhan
  assert.notEqual(betLabel({ bet: 5000 }), formatCoins(getProfile('u1').coins))
})

console.log(`\n${pass}/${pass + fail} lulus`); process.exit(fail ? 1 : 0)
