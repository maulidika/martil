import { create } from 'zustand'

const stored = (key, fallback = null) => {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback }
  catch { return fallback }
}

export const useGameStore = create((set, get) => ({
  // ── Auth ────────────────────────────────────────────────────────
  user:  stored('martil_user'),
  token: stored('martil_token'),

  setAuth(user, token) {
    localStorage.setItem('martil_user',  JSON.stringify(user))
    localStorage.setItem('martil_token', JSON.stringify(token))
    set({ user, token })
  },
  logout() {
    localStorage.removeItem('martil_user')
    localStorage.removeItem('martil_token')
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
