import React, { useEffect, useRef, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useGameStore } from '../store/gameStore'
import { useSocket } from '../hooks/useSocket'
import { detectCombo, sortHand, comboLabel, cardLabel, SUIT_SYM, IS_RED } from '../utils/comboDetector'

/* ── palette ─────────────────────────────────────────────── */
const C = {
  bg:'#1a1a2e', surface:'#16213e', deep:'#0f3460',
  accent:'#e94560', green:'#2ecc71', yellow:'#f1c40f',
  muted:'#888', border:'#1a4a7a', text:'#eee',
}

export default function GamePage() {
  const navigate = useNavigate()
  const { user, roomCode, gameState, currentTurn, selectedIds,
          toggleCard, clearSelection, events, roomInfo, connected, setError } = useGameStore()
  const { playCards, skipTurn } = useSocket()

  const currentRoomCode = roomCode || roomInfo?.code
  const myTurn   = currentTurn === user?.id
  const myHand   = gameState?.myHand ? sortHand(gameState.myHand) : []
  const selected = myHand.filter(c => selectedIds.includes(c.id))
  const combo    = detectCombo(selected)
  const tableTop = gameState?.table?.at(-1)

  /* ── timer ──────────────────────────────────────────────── */
  const [timeLeft, setTimeLeft] = useState(30)
  useEffect(() => {
    if (gameState?.timeLeft == null) return
    const startMs = Date.now()
    const initial = Math.round(gameState.timeLeft / 1000)
    setTimeLeft(initial)
    const iv = setInterval(() => {
      setTimeLeft(Math.max(0, initial - Math.round((Date.now() - startMs) / 1000)))
    }, 500)
    return () => clearInterval(iv)
  }, [gameState?.timeLeft, currentTurn])

  /* ── toast ──────────────────────────────────────────────── */
  const [toast, setToast] = useState(null)
  const toastRef = useRef(null)
  useEffect(() => {
    const latest = events[0]
    if (!latest) return
    const msg = toastMsg(latest, user?.id)
    if (!msg) return
    setToast(msg)
    clearTimeout(toastRef.current)
    toastRef.current = setTimeout(() => setToast(null), 2800)
  }, [events[0]?._id])

  /* ── actions ─────────────────────────────────────────────── */
  const handlePlay = useCallback(() => {
    if (!currentRoomCode) return setError('Room code tidak tersedia')
    if (!myTurn) return setError('Bukan giliranmu')
    if (!combo) return setError('Kombinasi tidak valid')
    if (!connected) return setError('Belum terkoneksi ke server')

    playCards(currentRoomCode, selectedIds)
    clearSelection()
  }, [combo, connected, currentRoomCode, myTurn, selectedIds, setError])

  const handleSkip = useCallback(() => {
    if (!currentRoomCode) return setError('Room code tidak tersedia')
    if (!myTurn) return setError('Bukan giliranmu')
    if (!connected) return setError('Belum terkoneksi ke server')

    skipTurn(currentRoomCode)
    clearSelection()
  }, [connected, currentRoomCode, myTurn, setError])

  if (!gameState) return (
    <div style={{ ...flex('center'), height:'100dvh', background:C.bg, flexDirection:'column', gap:12 }}>
      <div style={{ fontSize:32 }}>🃏</div>
      <div style={{ color:C.muted }}>Menunggu data game…</div>
    </div>
  )

  const opponents  = gameState.opponents || []
  const setScores  = roomInfo?.setScores || {}
  const gameNumber = gameState.gameNumber

  return (
    <div style={{ height:'100dvh', background:C.bg, display:'flex', flexDirection:'column', userSelect:'none', overflow:'hidden' }}>

      {/* Toast */}
      {toast && (
        <div style={{
          position:'fixed', top:12, left:'50%', transform:'translateX(-50%)',
          background:'rgba(0,0,0,0.85)', color:'#fff', fontSize:13, fontWeight:500,
          padding:'8px 18px', borderRadius:24, zIndex:999, whiteSpace:'nowrap',
          pointerEvents:'none', border:`1px solid rgba(255,255,255,0.1)`,
        }}>{toast}</div>
      )}

      {/* Top bar: game info + scores */}
      <div style={{ background:C.surface, padding:'8px 14px', display:'flex', justifyContent:'space-between', alignItems:'center', borderBottom:`1px solid ${C.border}`, flexShrink:0 }}>
        <div style={{ fontSize:12, color:C.muted }}>Game <b style={{ color:C.text }}>{gameNumber}</b> / {roomInfo?.maxGames || '?'}</div>
        <div style={{ display:'flex', gap:10 }}>
          {Object.entries(setScores).map(([id, sc]) => (
            <div key={id} style={{ fontSize:11, color: id === user?.id ? C.yellow : C.muted }}>
              {id === user?.id ? 'Kamu' : id.slice(0,4)}: <b>{sc}</b>
            </div>
          ))}
        </div>
        <div style={{ fontSize:12, color: myTurn ? C.green : C.muted, fontWeight: myTurn ? 600 : 400 }}>
          {myTurn ? '⚡ Giliran kamu' : '⏳ Tunggu…'}
        </div>
      </div>

      {/* Opponents (3 cards face-down) */}
      <div style={{ display:'flex', justifyContent:'space-around', padding:'10px 8px 0', gap:6, flexShrink:0 }}>
        {opponents.map(op => (
          <OpponentBox key={op.id} opponent={op} isActive={currentTurn === op.id} setScores={setScores} userId={user?.id} />
        ))}
      </div>

      {/* Table area */}
      <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', flexDirection:'column', gap:8, padding:'0 16px' }}>
        {tableTop ? (
          <>
            <div style={{ fontSize:11, color:C.muted, marginBottom:4 }}>
              Dimainkan oleh {tableTop.playerId === user?.id ? 'kamu' : tableTop.playerId.slice(0,6)}
            </div>
            <div style={{ display:'flex', gap:6, justifyContent:'center', flexWrap:'wrap' }}>
              {tableTop.combo.cards.map(c => <CardTile key={c.id} card={c} size="md" />)}
            </div>
            <div style={{ fontSize:12, color:C.accent, fontWeight:600, marginTop:2 }}>
              {comboLabel(tableTop.combo)}
            </div>
          </>
        ) : (
          <div style={{ color:C.muted, fontSize:14 }}>
            {myTurn ? '✨ Meja kosong — main bebas' : '⏳ Meja kosong'}
          </div>
        )}
      </div>

      {/* Timer + combo hint */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'4px 16px', flexShrink:0 }}>
        <div style={{ fontSize:13, fontWeight:700, color: timeLeft <= 10 ? C.accent : C.muted }}>
          ⏱ {timeLeft}s
        </div>
        {combo && (
          <div style={{ fontSize:12, color:C.green, fontWeight:600 }}>✓ {combo.label}</div>
        )}
        {selected.length > 0 && !combo && (
          <div style={{ fontSize:12, color:C.accent }}>Kombinasi tidak valid</div>
        )}
      </div>

      {/* Hand */}
      <div style={{ flexShrink:0, padding:'4px 0 6px', overflowX:'auto' }}>
        <div style={{ display:'flex', justifyContent:'center', paddingInline:12, minHeight:72 }}>
          {myHand.map((card, i) => (
            <CardTile
              key={card.id}
              card={card}
              size="lg"
              selected={selectedIds.includes(card.id)}
              onTap={myTurn ? () => toggleCard(card.id) : undefined}
              overlap={i > 0}
            />
          ))}
        </div>
      </div>

      {/* Action buttons */}
      <div style={{ display:'flex', gap:10, padding:'8px 16px 20px', flexShrink:0 }}>
        <button
          onClick={handleSkip}
          disabled={!connected || !myTurn}
          style={{ ...actionBtn, flex:1, background:C.deep, color: (connected && myTurn) ? C.text : C.muted, border:`1px solid ${C.border}` }}
        >
          Skip
        </button>
        <button
          onClick={handlePlay}
          disabled={!connected || !combo || !myTurn}
          style={{ ...actionBtn, flex:2, background: (connected && combo && myTurn) ? C.accent : '#333', color: (connected && combo && myTurn) ? '#fff' : C.muted }}
        >
          {selected.length > 0 ? `Main (${selected.length} kartu)` : 'Pilih kartu'}
        </button>
      </div>
    </div>
  )
}

/* ── Sub-components ───────────────────────────────────────── */

function OpponentBox({ opponent, isActive, setScores, userId }) {
  const score = setScores?.[opponent.id]
  return (
    <div style={{
      flex:1, background:C.surface, borderRadius:10, padding:'6px 8px',
      border:`1.5px solid ${isActive ? C.accent : C.border}`,
      display:'flex', flexDirection:'column', alignItems:'center', gap:3,
    }}>
      <div style={{ fontSize:10, color:C.muted, overflow:'hidden', textOverflow:'ellipsis', maxWidth:60, whiteSpace:'nowrap' }}>
        {opponent.id.slice(0,8)}
      </div>
      <div style={{ fontSize:15 }}>🃏</div>
      <div style={{ fontSize:12, fontWeight:600, color:C.text }}>{opponent.cardCount}</div>
      {score != null && <div style={{ fontSize:10, color:C.muted }}>{score}pt</div>}
      {isActive && <div style={{ width:6, height:6, borderRadius:3, background:C.accent }} />}
    </div>
  )
}

function CardTile({ card, selected, onTap, size = 'lg', overlap }) {
  const red = IS_RED[card.suit]
  const dim = size === 'lg' ? { w:42, h:60, fs:14, fss:12 } : { w:34, h:48, fs:12, fss:10 }

  return (
    <div
      onClick={onTap}
      style={{
        width: dim.w, height: dim.h, flexShrink:0,
        background: selected ? '#1e3a5f' : '#fff',
        border: `1.5px solid ${selected ? C.accent : '#ccc'}`,
        borderRadius: 6,
        display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center',
        gap:1,
        color: red ? '#c0392b' : '#1a1a2e',
        cursor: onTap ? 'pointer' : 'default',
        transform: selected ? 'translateY(-14px)' : 'translateY(0)',
        transition: 'transform 0.12s, border-color 0.12s',
        marginLeft: overlap ? -16 : 0,
        boxShadow: selected ? `0 4px 12px rgba(233,69,96,0.4)` : '0 1px 4px rgba(0,0,0,0.2)',
        zIndex: selected ? 10 : 1,
        position:'relative',
      }}
    >
      <span style={{ fontSize:dim.fs, fontWeight:700, lineHeight:1 }}>{card.rank}</span>
      <span style={{ fontSize:dim.fss, lineHeight:1 }}>{SUIT_SYM[card.suit]}</span>
    </div>
  )
}

/* ── Helpers ──────────────────────────────────────────────── */

function flex(j) { return { display:'flex', alignItems:'center', justifyContent:j } }

const actionBtn = {
  padding:'13px 0', borderRadius:10, fontSize:15, fontWeight:600,
  border:'none', cursor:'pointer', transition:'background 0.15s, opacity 0.15s',
}

function toastMsg(ev, myId) {
  switch (ev.type) {
    case 'rally_ended':       return '🧹 Rally selesai — meja bersih'
    case 'game_over':         return ev.winnerId === myId ? '🎉 Kamu menang game ini!' : `🏆 ${ev.winnerId?.slice(0,6)} menang`
    case 'auto_skipped':      return ev.playerId === myId ? '⏰ Waktu habis — auto skip' : `⏰ Auto skip (${ev.playerId?.slice(0,6)})`
    case 'player_disconnected': return `📡 ${ev.playerId?.slice(0,6)} terputus`
    case 'player_reconnected':  return `✅ ${ev.playerId?.slice(0,6)} kembali`
    default: return null
  }
}
