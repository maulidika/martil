/**
 * Human-readable (Indonesian) messages for the error codes the server sends on the Socket.IO `error`
 * channel. Pure data + one function, so it is easy to test against the backend's list of codes.
 *
 * Host Kick errors (`kick_error`) keep their own wording in utils/kick.js (messageForKickError).
 */
const MESSAGES = {
  // General
  INVALID_PAYLOAD:       'Permintaan tidak valid. Coba lagi.',
  INTERNAL_ERROR:        'Terjadi kesalahan di server. Coba lagi.',
  NOT_IN_ROOM:           'Kamu tidak berada di room ini.',
  ROOM_NOT_FOUND:        'Kode room tidak ditemukan.',
  NOT_HOST:              'Hanya Host yang bisa melakukan ini.',

  // Room
  INVALID_MAX_GAMES:     'Jumlah game per set tidak valid. Pilih 3, 4, atau 5.',
  ROOM_FULL:             'Room sudah penuh (4 pemain).',
  GAME_ALREADY_STARTED:  'Game di room ini sudah dimulai.',
  ALREADY_IN_ROOM:       'Kamu sudah berada di room ini.',
  ALREADY_IN_OTHER_ROOM: 'Kamu masih berada di room lain. Keluar dulu dari room itu.',
  ALREADY_STARTED:       'Set di room ini sudah dimulai.',
  NEED_4_PLAYERS:        'Butuh tepat 4 pemain untuk memulai game.',
  PLAYERS_NOT_READY:     'Semua pemain harus sudah berada di room sebelum game dimulai.',
  GAME_IN_PROGRESS:      'Tidak bisa dilakukan saat pertandingan berlangsung.',
  KICKED_FROM_ROOM:      'Kamu dikeluarkan dari room oleh Host. Kembali ke Homepage dulu untuk bergabung lagi.',

  // Host Kick (also reachable on the generic channel)
  CANNOT_KICK_SELF:      'Kamu tidak bisa mengeluarkan dirimu sendiri.',
  TARGET_NOT_IN_ROOM:    'Pemain itu sudah tidak ada di room.',

  // Game
  NO_ACTIVE_GAME:        'Belum ada game yang berjalan.',
  GAME_NOT_ACTIVE:       'Game ini sudah tidak aktif.',
  GAME_STARTING:         'Game berikutnya belum dimulai. Tunggu sebentar.',
  NOT_YOUR_TURN:         'Bukan giliranmu.',
  NO_CARDS_SELECTED:     'Pilih kartu dulu.',
  INVALID_CARD_IDS:      'Kartu yang dipilih tidak valid.',
  CARD_NOT_IN_HAND:      'Kartu itu tidak ada di tanganmu.',
  INVALID_COMBO:         'Kombinasi kartu tidak valid.',
  CANNOT_BEAT_TABLE:     'Kombinasi tidak bisa mengalahkan kartu di meja.',
}

/** Every code this file knows a message for (used by tests to compare against the backend). */
export const SERVER_ERROR_CODES = Object.keys(MESSAGES)

/** Message to show the player for a server error code; never exposes a bare code for known errors. */
export function messageForServerError(code) {
  if (typeof code === 'string' && Object.hasOwn(MESSAGES, code)) return MESSAGES[code]
  return code ? `Terjadi kesalahan (${code}).` : 'Terjadi kesalahan.'
}
