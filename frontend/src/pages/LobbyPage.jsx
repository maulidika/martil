import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useGameStore } from '../store/gameStore'
import { useSocket } from '../hooks/useSocket'

const C = { bg:'#1a1a2e', card:'#16213e', accent:'#e94560', muted:'#888', border:'#1a4a7a', text:'#eee', green:'#2ecc71', yellow:'#f39c12' }

const s = {
  wrap:   { minHeight:'100dvh', background:C.bg, padding:'1rem', display:'flex', flexDirection:'column' },
  header: { display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20 },
  logo:   { fontSize:22, fontWeight:700, color:C.accent, letterSpacing:1 },
  user:   { fontSize:13, color:C.muted },
  logout: { fontSize:12, color:C.muted, cursor:'pointer', textDecoration:'underline', marginLeft:8 },
  card:   { background:C.card, borderRadius:14, padding:'1.25rem', marginBottom:12 },
  title:  { fontSize:16, fontWeight:600, color:C.text, marginBottom:12 },
  input:  { width:'100%', padding:'10px 14px', background:'#0f3460', border:`1px solid ${C.border}`, borderRadius:8, color:C.text, fontSize:15, outline:'none', marginBottom:10 },
  btn:    { width:'100%', padding:'11px', borderRadius:8, fontSize:15, fontWeight:600, border:'none', cursor:'pointer', marginBottom:8 },
  row:    { display:'flex', gap:8, marginBottom:8 },
  pill:   { fontSize:12, padding:'4px 10px', borderRadius:20, background:'rgba(46,204,113,0.15)', color:C.green, border:'1px solid rgba(46,204,113,0.3)' },
  seat:   { display:'flex', alignItems:'center', justifyContent:'space-between', padding:'8px 0', borderBottom:`1px solid #1a4a7a` },
  dot:    (on) => ({ width:8, height:8, borderRadius:4, background: on ? C.green : C.muted, flexShrink:0 }),
  err:    { background:'rgba(233,69,96,0.12)', border:`1px solid ${C.accent}`, color:C.accent, borderRadius:8, padding:'8px 12px', fontSize:13, marginBottom:10 },
  code:   { fontFamily:'monospace', fontSize:20, letterSpacing:4, color:C.accent, fontWeight:700, textAlign:'center', marginBottom:4 },
  hint:   { fontSize:12, color:C.muted, textAlign:'center' },
  tag:    { fontSize:11, color:C.muted },
}

export default function LobbyPage() {
  const navigate  = useNavigate()
  const { user, token, roomCode, roomInfo, logout } = useGameStore()
  const { createRoom, joinRoom, startGame } = useSocket()
  const [joinInput, setJoinInput] = useState('')
  const [maxGames, setMaxGames]   = useState(4)
  const [localErr, setLocalErr]   = useState('')

  // Auto-navigate when game starts
  useEffect(() => {
    if (roomInfo?.game) navigate('/game')
  }, [roomInfo?.game])

  const myRoom = roomInfo && roomInfo.code === roomCode ? roomInfo : null
  const isHost = myRoom?.hostId === user?.id
  const players = myRoom?.players || []
  const ready = players.length === 4

  function doCreate() {
    setLocalErr('')
    createRoom(maxGames)
  }

  function doJoin() {
    const code = joinInput.trim().toUpperCase()
    if (code.length < 4) return setLocalErr('Masukkan kode room yang valid.')
    joinRoom(code)
    setLocalErr('')
  }

  function doStart() {
    if (!ready) return setLocalErr('Butuh 4 pemain untuk mulai.')
    startGame(roomCode)
  }

  function doLogout() {
    logout()
    navigate('/login')
  }

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

      {localErr && <div style={s.err}>{localErr}</div>}

      {/* No room yet */}
      {!myRoom && (
        <>
          <div style={s.card}>
            <div style={s.title}>Buat Room Baru</div>
            <label style={{ ...s.tag, display:'block', marginBottom:6 }}>Jumlah game per set</label>
            <div style={s.row}>
              {[3,4,5,6].map(n => (
                <button
                  key={n}
                  onClick={() => setMaxGames(n)}
                  style={{
                    flex:1, padding:'8px 0', borderRadius:8, fontSize:14, fontWeight:600,
                    border: maxGames===n ? `2px solid ${C.accent}` : `1px solid ${C.border}`,
                    background: maxGames===n ? 'rgba(233,69,96,0.15)' : '#0f3460',
                    color: maxGames===n ? C.accent : C.text, cursor:'pointer',
                  }}
                >{n}</button>
              ))}
            </div>
            <button style={{ ...s.btn, background:C.accent, color:'#fff', marginTop:4 }} onClick={doCreate}>
              Buat Room
            </button>
          </div>

          <div style={s.card}>
            <div style={s.title}>Gabung Room</div>
            <input
              style={s.input}
              placeholder="Masukkan kode room (contoh: AB3X9Z)"
              value={joinInput}
              onChange={e => setJoinInput(e.target.value.toUpperCase())}
              maxLength={6}
            />
            <button style={{ ...s.btn, background:'#0f3460', color:C.text, border:`1px solid ${C.border}` }} onClick={doJoin}>
              Gabung
            </button>
          </div>
        </>
      )}

      {/* Inside a room */}
      {myRoom && (
        <div style={s.card}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12 }}>
            <div style={s.title}>Room</div>
            <span style={s.pill}>{players.length}/4 pemain</span>
          </div>

          <div style={s.code}>{myRoom.code}</div>
          <div style={s.hint}>Bagikan kode ini ke teman-temanmu</div>

          <div style={{ marginTop:16, marginBottom:16 }}>
            {Array.from({ length: 4 }).map((_, i) => {
              const p = players[i]
              return (
                <div key={i} style={s.seat}>
                  <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                    <div style={s.dot(p?.connected)} />
                    <span style={{ fontSize:14, color: p ? C.text : C.muted }}>
                      {p ? (p.id === user?.id ? `${p.id.slice(0,8)} (kamu)` : p.id.slice(0,8)) : 'Menunggu…'}
                    </span>
                  </div>
                  {p?.id === myRoom.hostId && <span style={{ fontSize:11, color:C.yellow }}>Host</span>}
                </div>
              )
            })}
          </div>

          <div style={{ fontSize:12, color:C.muted, marginBottom:12 }}>
            {myRoom.maxGames} game per set
          </div>

          {isHost ? (
            <button
              style={{ ...s.btn, background: ready ? C.accent : '#333', color: ready ? '#fff' : C.muted, cursor: ready ? 'pointer' : 'not-allowed', marginBottom:0 }}
              onClick={doStart}
            >
              {ready ? 'Mulai Game' : `Menunggu pemain (${players.length}/4)`}
            </button>
          ) : (
            <div style={{ ...s.hint, padding:'10px 0' }}>Menunggu host memulai game…</div>
          )}
        </div>
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
