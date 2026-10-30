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
    set({ user, token })
  },
  logout() {
    sessionStorage.removeItem('martil_user')
    sessionStorage.removeItem('martil_token')
    set({ user: null, token: null, roomCode: null, roomInfo: null, gameState: null })
  },

  // ── Connection ──────────────────────────────────────────────────
  connected: false,
  setConnected: (v) => set({ connected: v }),

  // ── Room ────────────────────────────────────────────────────────
  roomCode: null,
  roomInfo: null,
  setRoomCode: (code) => set({ roomCode: code }),
  setRoomInfo:  (info) => set({ roomInfo: info }),
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
