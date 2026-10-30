import { useEffect, useRef, useCallback } from 'react'
import { io } from 'socket.io-client'
import { useNavigate } from 'react-router-dom'
import { useGameStore } from '../store/gameStore'

const SERVER = import.meta.env.VITE_SERVER_URL || 'http://localhost:3001'

let socketSingleton = null

function debugLog(action, details = {}) {
  console.info(`[MARTIL ${new Date().toISOString()}] ${action}`, details)
}

// Emit from pages without creating additional socket lifecycle owners.
export function emitSocket(event, data) {
  if (!socketSingleton?.connected) return false
  socketSingleton.emit(event, data)
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
      reconnection: true,
      reconnectionDelay: 1500,
      reconnectionAttempts: 10,
    })

    const s = socketSingleton

    s.on('connect',    () => { setConnected(true); debugLog('SOCKET_CONNECTED', { socketId: s.id }) })
    s.on('disconnect', (reason) => { setConnected(false); debugLog('SOCKET_DISCONNECTED', { reason }) })
    s.on('connect_error', (e) => setError(e.message))

    s.on('error', ({ code }) => {
      setError(code)
      setTimeout(() => useGameStore.getState().clearError(), 3000)
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

    s.on('reconnected', (state) => {
      setRoomInfo(state)
      setRoomCode(state.code)
      if (state.game) setGameState(state.game)
      navigate('/game')
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
      s.disconnect()
      socketSingleton = null
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
