import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useGameStore } from '../store/gameStore'
import { emitSocket } from '../hooks/useSocket'
import Modal from '../components/Modal'
import HomeView from '../components/HomeView'
import RoomView from '../components/RoomView'
import { C, s } from '../components/lobbyStyles'
import { kickConfirmText } from '../utils/kick'
import { playerName } from '../utils/profile'

// Games per set offered when creating a Room. Must stay in sync with ALLOWED_MAX_GAMES in backend/src/rooms/roomManager.js.
const MAX_GAMES_OPTIONS = [3, 4, 5]

export default function LobbyPage() {
  const navigate  = useNavigate()
  const { user, roomCode, roomInfo, logout, events, setResult, restricted, error, clearError } = useGameStore()
  const [kickTarget, setKickTarget] = useState(null)   // id pemain yang menunggu konfirmasi Kick
  const [joinInput, setJoinInput] = useState('')
  const [maxGames, setMaxGames]   = useState(4)
  const [localErr, setLocalErr]   = useState('')
  const [exiting, setExiting]   = useState(false)

  // Auto-navigate when game starts
  useEffect(() => {
    if (roomInfo?.game) navigate('/game')
  }, [roomInfo?.game])

  const myRoom = roomInfo && roomInfo.code === roomCode ? roomInfo : null
  const isHost = myRoom?.hostId === user?.id
  const players = myRoom?.players || []
  const nameOf = (id) => playerName(id, { profiles: myRoom?.profiles, account: id === user?.id ? user : undefined })
  // Setelah set selesai, semua pemain harus kembali ke Room (Back to Room) sebelum host bisa memulai.
  const allBack = players.every(p => p.inRoom !== false)
  const ready = players.length === 4 && allBack

  // Pengaman: pemain yang belum menekan Back to Room (inRoom=false) dan masih punya hasil set
  // seharusnya berada di Scoreboard, bukan di Room. Berlaku untuk jalur apa pun yang membawanya ke sini
  // (mis. refresh): dipulangkan ke /result dengan hasil dari server.
  const me = players.find(p => p.id === user?.id)
  const mustBeOnScoreboard = !!(myRoom && me && me.inRoom === false && (setResult || myRoom.setResult))
    || !!(restricted && setResult)   // di-Kick dari Result: tempatnya di Result sampai kembali ke Homepage
  useEffect(() => {
    if (!mustBeOnScoreboard) return
    const result = setResult || myRoom?.setResult
    console.info(`[MARTIL ${new Date().toISOString()}] NOT_RETURNED_REDIRECT_TO_RESULT`, { roomCode: myRoom?.code })
    if (!setResult) useGameStore.getState().setSetResult(result)
    navigate('/result', { replace: true })
  }, [mustBeOnScoreboard])

  // Server errors (wrong code, full room, cannot start...) disappear on their own after a few seconds.
  useEffect(() => {
    if (!error) return
    const timer = setTimeout(clearError, 4000)
    return () => clearTimeout(timer)
  }, [error])

  // Exit Room gagal → aktifkan kembali tombol dan tampilkan pesan.
  useEffect(() => {
    const ev = events[0]
    if (ev?.type === 'leave_room_error') {
      setExiting(false)
      setLocalErr(`Gagal keluar dari room: ${ev.code}`)
    }
  }, [events[0]?._id])

  // Setelah keluar (room_left) state room dibersihkan → reset tombol.
  useEffect(() => { if (!myRoom) setExiting(false) }, [!!myRoom])

  function doCreate() {
    setLocalErr('')
    emitSocket('create_room', { maxGames })
  }

  function doJoin() {
    const code = joinInput.trim().toUpperCase()
    if (code.length < 4) return setLocalErr('Masukkan kode room yang valid.')
    emitSocket('join_room', { roomCode: code })
    setLocalErr('')
  }

  function doStart() {
    if (players.length !== 4) return setLocalErr('Butuh 4 pemain untuk mulai.')
    if (!allBack) return setLocalErr('Tunggu semua pemain kembali ke Room.')
    emitSocket('start_game', { roomCode })
  }

  // Exit Room: keluar dengan sengaja (bukan disconnect) saat game belum dimulai.
  function doExit() {
    if (exiting) return
    setLocalErr('')
    console.info(`[MARTIL ${new Date().toISOString()}] EXIT_ROOM_CLICKED`, { roomCode })
    setExiting(true)
    if (!emitSocket('leave_room', { roomCode })) {
      setExiting(false)
      setLocalErr('Koneksi ke server terputus. Tunggu tersambung sebelum keluar dari room.')
    }
  }

  function doLogout() {
    logout()
    navigate('/login')
  }

  // Jangan menggambar Room sama sekali selama pemain sedang dipulangkan ke Scoreboard (tanpa kedipan).
  if (mustBeOnScoreboard) return null

  return (
    <div style={s.wrap}>
      {/* Header */}
      <div style={s.header}>
        <div style={s.logo}>🃏 MARTIL</div>
        <div>
          <span style={s.user}>@{user?.username}</span>
          <span style={s.logout} onClick={doLogout}>Keluar</span>
        </div>
      </div>

      {(localErr || error) && <div role="alert" style={s.err}>{localErr || error}</div>}

      {/* No room yet */}
      {!myRoom && (
        <HomeView
          maxGamesOptions={MAX_GAMES_OPTIONS}
          maxGames={maxGames}
          onMaxGamesChange={setMaxGames}
          joinInput={joinInput}
          onJoinInputChange={setJoinInput}
          onCreate={doCreate}
          onJoin={doJoin}
        />
      )}

      {/* Inside a room */}
      {myRoom && (
        <RoomView
          room={myRoom}
          user={user}
          players={players}
          isHost={isHost}
          ready={ready}
          exiting={exiting}
          nameOf={nameOf}
          onStart={doStart}
          onExit={doExit}
          onKick={setKickTarget}
        />
      )}

      {kickTarget && (
        <Modal
          testId="kick-confirm"
          title="Kick pemain?"
          onEscape={() => setKickTarget(null)}
          actions={[
            { label: 'Batal', onClick: () => setKickTarget(null) },
            { label: 'Kick', primary: true, onClick: () => {
                const target = kickTarget
                setKickTarget(null)
                if (!emitSocket('kick_player', { roomCode, targetId: target })) setLocalErr('Koneksi ke server terputus. Tunggu tersambung sebelum mengeluarkan pemain.')
              } },
          ]}
        >
          {kickConfirmText(nameOf(kickTarget), players.find(p => p.id === kickTarget)?.inRoom === false)}
        </Modal>
      )}

      {/* Rules quick reference */}
      <div style={{ ...s.card, marginTop:'auto' }}>
        <div style={{ fontSize:13, color:C.muted, lineHeight:1.8 }}>
          <strong style={{ color:C.text }}>Aturan singkat:</strong><br />
          Rank: 3 &lt; 4 … A &lt; 2 &nbsp;|&nbsp; Suit: ♠ &gt; ♥ &gt; ♣ &gt; ♦<br />
          Kombinasi: Single · Pair · Tris · Paketan (5 kartu)<br />
          3 skip = meja bersih · Habiskan kartu lebih dulu untuk menang
        </div>
      </div>
    </div>
  )
}
