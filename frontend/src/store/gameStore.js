import { create } from 'zustand'

// Auth harus disimpan per-tab. localStorage dibagi oleh semua tab pada
// origin yang sama, sehingga login akun A di tab lain bisa menimpa akun ini.
// sessionStorage terisolasi per tab dan tetap bertahan saat tab di-refresh.
try {
  localStorage.removeItem('martil_user')
  localStorage.removeItem('martil_token')
} catch {}

const stored = (key, fallback = null) => {
  try { return JSON.parse(sessionStorage.getItem(key)) ?? fallback }
  catch { return fallback }
}

export const useGameStore = create((set, get) => ({
  // ── Auth ────────────────────────────────────────────────────────
  user:  stored('martil_user'),
  token: stored('martil_token'),

  setAuth(user, token) {
    sessionStorage.setItem('martil_user',  JSON.stringify(user))
    sessionStorage.setItem('martil_token', JSON.stringify(token))
    set({ user, token, sync: 'ok', syncMessage: null })
  },
  logout() {
    sessionStorage.removeItem('martil_user')
    sessionStorage.removeItem('martil_token')
    set({
      user: null, token: null, roomCode: null, roomInfo: null, gameState: null,
      currentTurn: null, selectedIds: [], setResult: null, events: [],
      connected: false, sync: 'ok', syncMessage: null, notice: null,
    })
  },

  // ── Connection ──────────────────────────────────────────────────
  connected: false,
  setConnected: (v) => set({ connected: v }),

  // Status sinkronisasi dengan server (dipakai ConnectionOverlay):
  //   'ok' | 'connecting' | 'reconnecting' | 'resuming' | 'failed' | 'auth_failed' | 'replaced'
  // Saat halaman dimuat dengan token tersimpan (refresh), mulai dari 'connecting'
  // supaya pemain langsung melihat "Menghubungkan kembali..." sampai sesi dipulihkan.
  sync: stored('martil_token') ? 'connecting' : 'ok',
  syncMessage: null,
  setSync: (sync, syncMessage = null) => set({ sync, syncMessage }),

  // Pesan singkat (mis. "dikeluarkan dari room") yang ditampilkan ConnectionOverlay.
  notice: null,
  setNotice: (notice) => set({ notice }),

  // ── Room ────────────────────────────────────────────────────────
  roomCode: null,
  roomInfo: null,
  setRoomCode: (code) => set({ roomCode: code }),
  setRoomInfo:  (info) => set({ roomInfo: info }),
  // Terapkan snapshot lengkap dari server (session_restored): menimpa seluruh state
  // room/game sekaligus, jadi tidak ada sisa state lama (kartu terpilih, giliran lama, dll).
  applyRestoredSession: (state) => set({
    roomCode: state.code,
    roomInfo: state,
    gameState: state.game ?? null,
    currentTurn: state.game?.currentTurn ?? null,
    selectedIds: [],
    setResult: state.status === 'done' ? (state.setResult ?? null) : null,
    error: null,
  }),
  clearRoomState: () => set({
    roomCode: null,
    roomInfo: null,
    gameState: null,
    currentTurn: null,
    selectedIds: [],
    setResult: null,
    events: [],
    error: null,
  }),

  // ── Game ────────────────────────────────────────────────────────
  gameState:    null,
  currentTurn:  null,
  setGameState: (g) => set({ gameState: g, currentTurn: g?.currentTurn ?? null }),
  setCurrentTurn: (id) => set({ currentTurn: id }),

  // ── Card selection ──────────────────────────────────────────────
  selectedIds: [],
  toggleCard(id) {
    const cur = get().selectedIds
    set({ selectedIds: cur.includes(id) ? cur.filter(x => x !== id) : [...cur, id] })
  },
  clearSelection: () => set({ selectedIds: [] }),

  // ── Events (toasts / animations) ────────────────────────────────
  events: [],
  pushEvent(ev) {
    set({ events: [{ ...ev, _id: Date.now() + Math.random() }, ...get().events].slice(0, 30) })
  },

  // ── Set result ──────────────────────────────────────────────────
  setResult: null,
  setSetResult: (r) => set({ setResult: r }),

  // ── Error ────────────────────────────────────────────────────────
  error: null,
  setError:   (e) => set({ error: e }),
  clearError: ()  => set({ error: null }),
}))
