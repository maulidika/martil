// Ukuran dan posisi elemen halaman Game sebagai fungsi murni dari ukuran viewport (diuji tanpa browser).
// Tujuan: nyaman pada zoom 100% tanpa zoom-out manual; kartu tidak terpotong; UI tidak dikecilkan berlebihan.

export const CARD_RATIO = 1.4          // tinggi = 1.4 × lebar
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v))

/**
 * @returns {{compact:boolean, card:number, cardH:number, step:number, lift:number, avatar:number, seatFont:number, seatH:number,
 *            side:number, table:number, play:number, bottomH:number, detectorMaxH:number}}
 *  - compact: layar sempit (<720px): kontrol pindah ke baris di atas/bawah dek, tidak ada kolom samping
 *  - card/cardH: lebar/tinggi kartu di tangan; step: fraksi lebar kartu yang terlihat (sisanya tertutup kartu berikutnya)
 *  - lift: tinggi kartu terpilih terangkat; side: lebar kolom kontrol kiri/kanan (0 saat compact)
 *  - table: lebar kartu yang sedang di meja, diperkecil bila tinggi layar tidak cukup (agar tidak menimpa kursi)
 *  - bottomH: perkiraan tinggi zona tangan; detectorMaxH: tinggi maksimum daftar Combo Detector (scroll bila lebih)
 */
export function computeLayout(w, h) {
  const compact = w < 720
  const side = compact ? 0 : clamp(Math.round(w * 0.12), 108, 176)
  const step = compact ? 0.62 : 0.74
  // lebar yang tersedia untuk deretan kartu = layar − kolom samping − jarak antar kolom − padding dalam deretan
  const avail = Math.max(240, w - side * 2 - (compact ? 12 : 40) - 20)
  const byWidth = avail / (1 + 12 * step)                      // 13 kartu muat tanpa scroll horizontal
  const byHeight = (h * (compact ? 0.17 : 0.2)) / CARD_RATIO   // tangan tidak boleh memakan terlalu banyak tinggi layar
  const card = Math.floor(clamp(Math.min(byWidth, byHeight), compact ? 38 : 44, 110))
  const lift = Math.round(card * 0.2)
  const avatar = Math.round(clamp(h * (compact ? 0.075 : 0.105), 40, 88))
  const seatFont = Math.round(clamp(h * 0.019, 11, 15))
  const me = Math.round(compact ? 38 : avatar * 0.62)
  const cardH = Math.round(card * CARD_RATIO)
  const seatH = Math.round(avatar * 1.3 + seatFont * 4.2)
  // zona tangan: kartu + ruang tombol GROUP di atasnya + profil pemain utama (+ baris kontrol di layar sempit)
  const bottomH = cardH + lift + 46 + me + 14 + (compact ? 130 : 0)
  const tableTop = (compact ? 64 : 10) + seatH
  const tableAvail = h - bottomH - tableTop - seatFont * 3.4 - seatFont * 2.4   // label kombinasi + baris umpan balik seleksi
  const table = Math.round(clamp(Math.floor(tableAvail / CARD_RATIO), 30, card * (compact ? 1.2 : 0.95)))
  return {
    compact, side, step, card, cardH, lift, avatar, seatFont, seatH, table, bottomH,
    play: Math.round(clamp(side * 0.78, 64, 120)),              // diameter tombol PLAY
    // daftar detektor boleh tumbuh ke atas sampai tepat di bawah kursi kiri; CLEAR dan taruhan memakai ~110px
    detectorMaxH: Math.max(70, h - (seatFont * 5 + 12 + seatH + 12) - 110),
  }
}

/**
 * Posisi kursi lawan mengelilingi meja (pemain utama selalu di bawah), proporsional untuk 1–3 lawan.
 * Urutan `opponents` = urutan giliran setelah pemain utama: searah jarum jam → kiri, atas, kanan.
 */
export function seatSides(n) {
  if (n <= 0) return []
  if (n === 1) return ['top']
  if (n === 2) return ['left', 'right']
  return ['left', 'top', 'right', ...Array(Math.max(0, n - 3)).fill('top')]
}

/** Urutkan lawan sesuai urutan duduk relatif terhadap pemain utama (yang bermain setelah saya di kiri). */
export function orderOpponents(opponents, seatOrderIds, myId) {
  if (!seatOrderIds?.length || !seatOrderIds.includes(myId)) return opponents
  const byId = Object.fromEntries(opponents.map(o => [o.id, o]))
  const i = seatOrderIds.indexOf(myId)
  const rotated = [...seatOrderIds.slice(i + 1), ...seatOrderIds.slice(0, i)].filter(id => byId[id])
  // bila daftar anggota room tidak cocok dengan peserta game (mis. ada yang keluar), jangan mengacak: pakai urutan asli
  return rotated.length === opponents.length ? rotated.map(id => byId[id]) : opponents
}

/** Persentase sisa waktu giliran (0–100) untuk cincin timer di sekitar avatar. */
export function turnRingPct(timeLeft, total = 30) {
  if (timeLeft == null) return 100
  return clamp(Math.round((timeLeft / total) * 100), 0, 100)
}
