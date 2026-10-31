import { useEffect, useCallback } from 'react'
import { io } from 'socket.io-client'
import { useNavigate } from 'react-router-dom'
import { useGameStore } from '../store/gameStore'
import {
  SYNC_FAIL_AFTER_MS, RESUME_TIMEOUT_MS,
  routeForRestoredState, messageForSessionNone,
} from '../utils/session'

const SERVER = import.meta.env.VITE_SERVER_URL || 'http://localhost:3001'

let socketSingleton = null

function debugLog(action, details = {}) {
  console.info(`[MARTIL ${new Date().toISOString()}] ${action}`, details)
}

// ── Status sinkronisasi + watchdog ─────────────────────────────────────────
// Watchdog memastikan pemain tidak menunggu tanpa batas: jika "menghubungkan"
// atau "memulihkan" tidak selesai tepat waktu, status berubah menjadi 'failed'
// dan overlay menampilkan pesan serta tombol coba lagi.
let watchdog = null

function clearWatchdog() {
  if (watchdog) { clearTimeout(watchdog); watchdog = null }
}

function armWatchdog(ms, message) {
  clearWatchdog()
  watchdog = setTimeout(() => {
    watchdog = null
    const { sync, setSync } = useGameStore.getState()
    if (sync === 'connecting' || sync === 'reconnecting' || sync === 'resuming') {
      debugLog('SYNC_FAILED', { was: sync })
      setSync('failed', message)
    }
  }, ms)
}

const MSG_NO_SERVER = 'Tidak bisa terhubung ke server. Periksa koneksi internetmu; sistem terus mencoba di latar belakang.'
const MSG_NO_RESUME = 'Server tidak merespons saat memulihkan sesi.'

function setSyncStatus(sync, message = null) {
  useGameStore.getState().setSync(sync, message)
  if (sync === 'connecting' || sync === 'reconnecting') armWatchdog(SYNC_FAIL_AFTER_MS, MSG_NO_SERVER)
  else if (sync === 'resuming') armWatchdog(RESUME_TIMEOUT_MS, MSG_NO_RESUME)
  else clearWatchdog()
}

// ── API untuk halaman ──────────────────────────────────────────────────────

// Emit from pages without creating additional socket lifecycle owners.
export function emitSocket(event, data) {
  if (!socketSingleton?.connected) return false
  socketSingleton.emit(event, data)
  return true
}

/** Minta server memulihkan sesi (dipakai tombol "Coba lagi" dan layar tunggu game). */
export function requestResume() {
  if (!socketSingleton?.connected) return false
  debugLog('RESUME_REQUESTED')
  setSyncStatus('resuming')
  socketSingleton.emit('resume_session')
  return true
}

/** Paksa percobaan sambung ulang sekarang (tidak menunggu jeda backoff). */
export function retryConnection() {
  const s = socketSingleton
  if (!s) return false
  debugLog('RECONNECT_RETRY_CLICKED')
  if (s.connected) return requestResume()
  setSyncStatus('reconnecting')
  s.connect()
  return true
}

export function useSocket() {
  const navigate = useNavigate()
  const {
    token, setConnected, setRoomCode, setRoomInfo,
    setGameState, setCurrentTurn, pushEvent, setSetResult, setError,
  } = useGameStore()

  useEffect(() => {
    if (!token) return
    if (socketSingleton?.connected) return

    socketSingleton = io(SERVER, {
      auth: { token },
      forceNew: true,               // manager baru per socket → listener tidak pernah menumpuk
      reconnection: true,
      reconnectionAttempts: Infinity, // tidak menyerah diam-diam; watchdog yang menampilkan kegagalan
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 10000,
    })

    const s = socketSingleton

    // Mulai dari "menghubungkan" hanya bila halaman dimuat ulang dengan token tersimpan
    // (store sudah memulai dari 'connecting'); setelah login baru tidak ada overlay.
    if (useGameStore.getState().sync === 'connecting') setSyncStatus('connecting')

    // ── Connection lifecycle ───────────────────────────────────────
    s.on('connect', () => {
      setConnected(true)
      debugLog('SOCKET_CONNECTED', { socketId: s.id })
      // Setiap (re)connect: minta server memulihkan sesi. Listener ini hanya
      // didaftarkan sekali per socket, jadi tidak ada duplikasi saat reconnect.
      if (useGameStore.getState().sync === 'ok') {
        s.emit('resume_session') // login baru: diam-diam, tanpa overlay
      } else {
        setSyncStatus('resuming')
        s.emit('resume_session')
      }
    })

    s.on('disconnect', (reason) => {
      setConnected(false)
      debugLog('SOCKET_DISCONNECTED', { reason })
      if (reason === 'io client disconnect') return // disengaja (logout / cleanup)
      setSyncStatus('reconnecting')
      // Server memutus secara sengaja → Socket.IO tidak mencoba lagi otomatis.
      if (reason === 'io server disconnect') s.connect()
    })

    s.on('connect_error', (e) => {
      debugLog('SOCKET_CONNECT_ERROR', { message: e.message, willRetry: s.active })
      if (e.message === 'INVALID_TOKEN' || e.message === 'AUTH_REQUIRED') {
        setSyncStatus('auth_failed', 'Sesi login tidak valid atau sudah berakhir. Silakan login ulang.')
        return
      }
      const { sync } = useGameStore.getState()
      if (sync === 'ok' || sync === 'resuming') setSyncStatus('reconnecting')
    })

    s.on('error', ({ code }) => {
      setError(code)
      setTimeout(() => useGameStore.getState().clearError(), 3000)
    })

    // ── Pemulihan sesi (reconnect / refresh) ───────────────────────
    s.on('session_restored', (state) => {
      debugLog('SESSION_RESTORED', { roomCode: state?.code, status: state?.status, turn: state?.game?.currentTurn })
      useGameStore.getState().applyRestoredSession(state)
      setSyncStatus('ok')
      navigate(routeForRestoredState(state), { replace: true })
    })

    s.on('session_none', ({ reason } = {}) => {
      const st = useGameStore.getState()
      const hadRoom = !!(st.roomCode || st.roomInfo)
      debugLog('SESSION_NONE', { reason, hadRoom })
      if (hadRoom) st.clearRoomState()
      if (hadRoom || reason === 'EXPIRED' || reason === 'ROOM_CLOSED') {
        st.setNotice(messageForSessionNone(reason))
      }
      // Jangan biarkan pemain tertinggal di halaman yang butuh room.
      const path = window.location.pathname
      if (path === '/game' || path === '/result') navigate('/lobby', { replace: true })
      setSyncStatus('ok')
    })

    s.on('session_replaced', () => {
      debugLog('SESSION_REPLACED')
      setSyncStatus('replaced', 'Akun ini sedang dipakai di tab atau perangkat lain.')
    })

    // ── Room events ────────────────────────────────────────────────
    s.on('room_created', ({ code }) => {
      setRoomCode(code)
    })

    s.on('room_updated', (state) => {
      debugLog('ROOM_UPDATED', { roomCode: state?.code, status: state?.status, playerCount: state?.players?.length })
      setRoomInfo(state)
      setRoomCode(state.code)
      if (state.game) setGameState(state.game)
    })

    // ── Game events ────────────────────────────────────────────────
    s.on('game_state', (state) => {
      setRoomInfo(state)
      if (state.game) setGameState(state.game)
    })

    s.on('game_started', (data) => {
      pushEvent({ type: 'game_started', ...data })
      setCurrentTurn(data.currentTurn)
      navigate('/game')
    })

    s.on('turn_changed', ({ currentTurn }) => {
      setCurrentTurn(currentTurn)
    })

    s.on('cards_played',         (d) => pushEvent({ type: 'cards_played', ...d }))
    s.on('player_skipped',       (d) => pushEvent({ type: 'player_skipped', ...d }))
    s.on('auto_skipped',         (d) => pushEvent({ type: 'auto_skipped', ...d }))
    s.on('rally_ended',          (d) => pushEvent({ type: 'rally_ended', ...d }))
    s.on('player_joined',        (d) => pushEvent({ type: 'player_joined', ...d }))
    s.on('player_disconnected',  (d) => pushEvent({ type: 'player_disconnected', ...d }))
    s.on('player_reconnected',   (d) => pushEvent({ type: 'player_reconnected', ...d }))

    s.on('game_over', (data) => {
      pushEvent({ type: 'game_over', ...data })
      // game_state will follow with updated hands
    })

    s.on('set_over', (data) => {
      debugLog('SET_OVER_RECEIVED', { rankingsCount: data?.rankings?.length })
      setSetResult(data)
      pushEvent({ type: 'set_over', ...data })
      setTimeout(() => {
        // Jangan menimpa navigasi jika pemain sudah berhasil meninggalkan room.
        if (useGameStore.getState().setResult === data) navigate('/result')
      }, 2000)
    })

    s.on('room_left', (data) => {
      debugLog('ROOM_LEFT_CONFIRMED', data)
      useGameStore.getState().clearRoomState()
      navigate('/lobby')
    })

    s.on('leave_room_error', ({ code }) => {
      debugLog('LEAVE_ROOM_FAILED', { code })
      setError(`Gagal keluar dari room: ${code}`)
      // ResultPage akan kembali mengaktifkan tombol melalui store event.
      useGameStore.getState().pushEvent({ type: 'leave_room_error', code })
    })

    return () => {
      debugLog('SOCKET_OWNER_CLEANUP', { socketId: s.id })
      clearWatchdog()
      if (typeof s.removeAllListeners === 'function') s.removeAllListeners()
      else s.off()
      s.disconnect()
      if (socketSingleton === s) socketSingleton = null
      useGameStore.getState().setConnected(false)
    }
  }, [token])

  const emit = useCallback((event, data) => emitSocket(event, data), [])

  return {
    createRoom: (maxGames = 4)           => emit('create_room', { maxGames }),
    joinRoom:   (roomCode)               => emit('join_room',   { roomCode }),
    startGame:  (roomCode)               => emit('start_game',  { roomCode }),
    playCards:  (roomCode, cardIds)      => emit('play_cards',  { roomCode, cardIds }),
    skipTurn:   (roomCode)               => emit('skip_turn',   { roomCode }),
  }
}
