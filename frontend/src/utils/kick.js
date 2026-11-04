// Logika murni untuk fitur Host Kick di klien. Server adalah sumber kebenaran: semua aturan di sini hanya
// menentukan apa yang DITAMPILKAN; kick_player/return_to_room tetap divalidasi ulang di backend.

/** Tombol Kick hanya untuk Host, terhadap pemain lain yang masih menjadi anggota room, dan bukan saat game berlangsung. */
export function canShowKick({ myId, hostId, targetId, players = [], status }) {
  if (!myId || hostId !== myId) return false
  if (targetId === myId) return false
  if (status === 'playing') return false
  return players.some(p => p.id === targetId)
}

/** Teks konfirmasi Kick. Pemain yang masih di Result tetap melihat hasil tetapi tidak bisa kembali ke Room. */
export function kickConfirmText(name, targetOnResult) {
  return targetOnResult
    ? `Keluarkan ${name} dari room? Ia tetap bisa melihat hasil pertandingan, tetapi tidak bisa kembali ke Room sebelum kembali ke Homepage.`
    : `Keluarkan ${name} dari room? Ia masih bisa bergabung kembali ke room ini.`
}

/**
 * Keputusan saat tombol Back to Room ditekan.
 *   'busy'       → ada permintaan lain yang sedang berjalan, abaikan
 *   'restricted' → pemain di-Kick: tampilkan modal "Akses Room Dibatasi" (tanpa mengirim apa pun ke server)
 *   'no_code' / 'offline' → tampilkan pesan error biasa
 *   'emit'       → kirim return_to_room
 */
export function backToRoomDecision({ busy, restricted, code, connected }) {
  if (busy) return 'busy'
  if (restricted) return 'restricted'
  if (!code) return 'no_code'
  if (!connected) return 'offline'
  return 'emit'
}

export const RESTRICTED_MODAL = {
  title: 'Akses Room Dibatasi',
  message: 'Kamu telah dikeluarkan dari Room oleh Host. Untuk bergabung kembali, silakan kembali ke Homepage terlebih dahulu.',
  ok: 'OK',
}

export function messageForKickError(code) {
  switch (code) {
    case 'NOT_HOST':           return 'Hanya Host yang bisa mengeluarkan pemain.'
    case 'GAME_IN_PROGRESS':   return 'Pemain tidak bisa dikeluarkan saat pertandingan berlangsung.'
    case 'TARGET_NOT_IN_ROOM': return 'Pemain itu sudah tidak ada di room.'
    case 'CANNOT_KICK_SELF':   return 'Kamu tidak bisa mengeluarkan dirimu sendiri.'
    case 'NOT_IN_ROOM':        return 'Kamu tidak berada di room ini.'
    default:                   return `Gagal mengeluarkan pemain: ${code}`
  }
}
