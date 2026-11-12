// Data profil pemain untuk UI. SEMENTARA: level dan koin adalah DATA DUMMY yang stabil (diturunkan dari id)
// karena belum ada sistem akun/level/wallet. Saat sistem itu ada, cukup ganti isi getProfile() — komponen UI
// (components/game/ui.jsx) hanya membaca bentuk { name, level, coins, tint } dan tidak perlu diubah.
// Koin kelak menjadi saldo Rupiah; formatCoins() adalah satu-satunya tempat format tampilannya.

const hash = (s) => { let h = 2166136261; for (const ch of String(s)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619) } return h >>> 0 }

const TINTS = ['#6aa7e8', '#7bd88f', '#f2a65a', '#c58af0', '#ef7b7b', '#5ad1d1']

/** Every place that must show a player whose name is unknown uses this same short id. */
export const SHORT_ID_LENGTH = 8
export const shortId = (id) => String(id ?? '').slice(0, SHORT_ID_LENGTH)

/**
 * Real name of a player, from the most trustworthy source available:
 *   1. the server's public profile (`profiles[id].username`, sent with every Room state and frozen into the set result)
 *   2. the logged-in account (only known for yourself)
 *   3. the short id (player not in any profile map)
 * @param {string} id
 * @param {{profiles?: Object<string, {username?: string}>, account?: {username?: string}}} [sources]
 */
export function playerName(id, { profiles, account } = {}) {
  const fromServer = profiles?.[id]?.username
  if (typeof fromServer === 'string' && fromServer) return fromServer
  if (typeof account?.username === 'string' && account.username) return account.username
  return shortId(id)
}

/**
 * @param {string} id
 * @param {{username?:string}} [account]  akun login (hanya diketahui untuk pemain utama)
 * @param {Object<string, {username?: string}>} [profiles]  profil publik dari server (roomInfo.profiles / setResult.profiles)
 */
export function getProfile(id, account, profiles) {
  const h = hash(id)
  return {
    id,
    name: playerName(id, { profiles, account }),
    level: 1 + (h % 40),                                  // placeholder
    coins: 20_000 + (h % 9_000) * 1_000,                  // placeholder (bukan saldo nyata)
    tint: TINTS[h % TINTS.length],
  }
}

/** 260000 → "260K", 6_500_000 → "6,50M". Format Indonesia (koma desimal). */
export function formatCoins(n) {
  if (n == null || Number.isNaN(Number(n))) return '—'
  const v = Number(n)
  const f = (x, d) => x.toFixed(d).replace('.', ',')
  if (v >= 1e9) return `${f(v / 1e9, 2)}B`
  if (v >= 1e6) return `${f(v / 1e6, 2)}M`
  if (v >= 1e3) return `${f(v / 1e3, v % 1e3 === 0 ? 0 : 2)}K`
  return String(v)
}

/**
 * Taruhan permainan dari data Room (BUKAN saldo pemain). Sistem taruhan belum ada di server, jadi
 * roomInfo.bet belum terisi → null (UI menampilkan placeholder). Bentuk yang didukung kelak:
 * angka (5000 → "5K") atau teks siap tampil ("5K").
 */
export function betLabel(roomInfo) {
  const bet = roomInfo?.bet
  if (bet == null) return null
  return typeof bet === 'number' ? formatCoins(bet) : String(bet)
}
