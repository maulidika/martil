// Konstanta dan helper murni untuk pemulihan sesi (reconnect).
// Backend adalah sumber kebenaran: klien hanya menampilkan apa yang dikirim server.

/** Berapa lama "Menghubungkan kembali..." boleh berjalan sebelum ditampilkan sebagai gagal. */
export const SYNC_FAIL_AFTER_MS = 20_000
/** Berapa lama menunggu jawaban server setelah resume_session sebelum dianggap gagal. */
export const RESUME_TIMEOUT_MS = 8_000

/** Halaman tujuan setelah server mengirim session_restored. */
export function routeForRestoredState(state) {
  if (!state) return '/lobby'
  if (state.status === 'playing' && state.game) return '/game'
  if (state.status === 'done' && state.setResult) return '/result'
  return '/lobby'
}

/** Pesan untuk pemain ketika sesi tidak bisa dipulihkan. */
export function messageForSessionNone(reason) {
  switch (reason) {
    case 'EXPIRED':     return 'Kamu terputus terlalu lama sehingga dikeluarkan dari room.'
    case 'ROOM_CLOSED': return 'Room sudah ditutup karena semua pemain terputus terlalu lama.'
    case 'NO_ROOM':
    case 'NOT_IN_ROOM': return 'Room tidak ditemukan atau sudah tidak tersedia.'
    default:            return 'Sesi sebelumnya tidak bisa dipulihkan.'
  }
}
