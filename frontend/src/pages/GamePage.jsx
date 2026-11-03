import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useGameStore } from '../store/gameStore'
import { emitSocket } from '../hooks/useSocket'
import GameSyncWaiting from '../components/GameSyncWaiting'
import { detectCombo, canBeat, sortHand, comboLabel, cardLabel, displayOrder, SUIT_SYM, IS_RED } from '../utils/comboDetector'
import { COMBO_TYPES, listAvailableCombos, activePickOf } from '../utils/comboPicker'
import { mainDeckIds, isGroupSelected, anchorAbove, canGroupSelection } from '../utils/groupChain'
import { INITIAL_UI, syncUi, reduceHandUi } from '../utils/handUi'

/* ── palette ─────────────────────────────────────────────── */
const C = {
  bg:'#1a1a2e', surface:'#16213e', deep:'#0f3460',
  accent:'#e94560', green:'#2ecc71', yellow:'#f1c40f',
  muted:'#888', border:'#1a4a7a', text:'#eee',
}

export default function GamePage() {
  const navigate = useNavigate()
  const { user, roomCode, gameState, currentTurn, selectedIds,
          setSelection, clearSelection, events, roomInfo, connected, setError } = useGameStore()

  const currentRoomCode = roomCode || roomInfo?.code
  const myTurn   = currentTurn === user?.id
  const myHand   = gameState?.myHand ? sortHand(gameState.myHand) : []
  const handIds  = myHand.map(c => c.id)
  const handKey  = handIds.join(',')
  const selIds   = handIds.filter(id => selectedIds.includes(id))
  const selected = myHand.filter(c => selIds.includes(c.id))
  const combo    = detectCombo(selected)
  const tableTop = gameState?.table?.at(-1)
  // Legalitas di sisi klien = aturan engine: kombinasi valid dan (bila meja terisi) mengalahkan kartu teratas.
  // Server tetap memvalidasi ulang.
  const tableCombo = tableTop ? detectCombo(tableTop.combo?.cards) : null
  const beatsTable = !!combo && (!tableTop || (!!tableCombo && canBeat(combo, tableCombo)))
  const canPlay    = connected && myTurn && beatsTable

  /* ── layout responsif ─────────────────────────────────── */
  const compact = useCompact(720)

  /* ── interaksi tangan: seleksi, Combo Detector, Group Chain (logika murni di utils/handUi.js) ── */
  const groupKey = `${currentRoomCode}:${gameState?.gameNumber}`
  const [rawUi, setRawUi] = useState(INITIAL_UI)
  const ui = useMemo(() => syncUi(rawUi, groupKey, handIds), [rawUi, groupKey, handKey])   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (ui !== rawUi) setRawUi(ui) }, [ui, rawUi])
  const act = (action) => {
    const r = reduceHandUi(ui, selIds, handIds, action)
    setRawUi(r.ui); setSelection(r.selIds)
  }
  const resetSel = () => act({ type: 'clear' })

  const available = useMemo(() => listAvailableCombos(myHand), [handKey])   // eslint-disable-line react-hooks/exhaustive-deps
  const activePick = activePickOf(ui.lastPick, available, selIds)
  const groups = ui.groups
  const deckIds   = mainDeckIds(handIds, groups)
  const cardById  = Object.fromEntries(myHand.map(c => [c.id, c]))
  const canGroup  = canGroupSelection(selIds, groups)   // GROUP hanya untuk ≥2 kartu dek utama

  /* ── posisi tombol GROUP / UNGROUP (diukur dari DOM) ─────── */
  const wrapRef = useRef(null)
  const cardEls = useRef(new Map())
  const setCardEl = (id) => (el) => { if (el) cardEls.current.set(id, el); else cardEls.current.delete(id) }
  const [anchors, setAnchors] = useState({ group: null, ungroup: [] })
  const selKey = selIds.join(','), groupsKey = groups.map(g => g.join('.')).join('|')
  useLayoutEffect(() => {
    const wrap = wrapRef.current
    const rectOf = (id) => {
      const el = cardEls.current.get(id)
      return el && wrap ? { ...offsetWithin(el, wrap), width: el.offsetWidth } : null
    }
    const group = wrap && canGroup ? anchorAbove(selIds.map(rectOf).filter(Boolean)) : null
    const ungroup = wrap ? groups.map((g, index) => {
      if (!isGroupSelected(g, selIds)) return null
      const a = anchorAbove(g.map(rectOf).filter(Boolean))
      return a && { index, ...a }
    }).filter(Boolean) : []
    const next = { group, ungroup }
    setAnchors(prev => JSON.stringify(prev) === JSON.stringify(next) ? prev : next)
  }, [selKey, groupsKey, handKey, compact])   // eslint-disable-line react-hooks/exhaustive-deps

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
  // Fungsi biasa (bukan useCallback): selalu memakai ui/seleksi terbaru dari render ini.
  const handlePlay = () => {
    if (!currentRoomCode) return setError('Room code tidak tersedia')
    if (!myTurn) return setError('Bukan giliranmu')
    if (!combo) return setError('Kombinasi tidak valid')
    if (!beatsTable) return setError('Kombinasi tidak bisa mengalahkan meja')
    if (!connected) return setError('Belum terkoneksi ke server')

    emitSocket('play_cards', { roomCode: currentRoomCode, cardIds: selIds })
    resetSel()   // grup yang kartunya dimainkan bubar otomatis saat tangan diperbarui server (syncUi)
  }

  const handleSkip = () => {
    if (!currentRoomCode) return setError('Room code tidak tersedia')
    if (!myTurn) return setError('Bukan giliranmu')
    if (!connected) return setError('Belum terkoneksi ke server')

    emitSocket('skip_turn', { roomCode: currentRoomCode })
    resetSel()
  }

  if (!gameState) return <GameSyncWaiting />

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
              {displayOrder(tableTop.combo).map(c => <CardTile key={c.id} card={c} size="md" />)}
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
          <div style={{ fontSize:12, color: beatsTable ? C.green : C.muted, fontWeight:600 }}>{beatsTable ? '✓ ' : ''}{combo.label}</div>
        )}
        {combo && tableTop && !beatsTable && (
          <div style={{ fontSize:12, color:C.yellow }}>Tidak bisa mengalahkan meja</div>
        )}
        {selected.length > 0 && !combo && (
          <div style={{ fontSize:12, color:C.accent }}>Kombinasi tidak valid</div>
        )}
      </div>

      {/* Hand zone: [Combo Detector + CLEAR] [dek utama | grup] [AUTO SKIP PLAY HINT] */}
      <div style={{ flexShrink:0, padding:'2px 8px 16px' }}>
        {compact && <DetectorPanel available={available} activePick={activePick} onPick={(kind) => act({ type: 'detector', available, kind })} compact />}

        <div style={{ display:'flex', alignItems:'stretch', gap:8 }}>
          {!compact && (
            <div style={{ width:152, flexShrink:0, display:'flex', flexDirection:'column', justifyContent:'space-between', gap:8 }}>
              <DetectorPanel available={available} activePick={activePick} onPick={(kind) => act({ type: 'detector', available, kind })} />
              <ClearButton onClick={resetSel} disabled={selIds.length === 0} />
            </div>
          )}

          <div style={{ flex:1, minWidth:0, overflowX:'auto', display:'flex' }}>
            <div ref={wrapRef} style={{ position:'relative', display:'flex', alignItems:'flex-end', gap:14, margin:'0 auto', padding:'52px 12px 4px' }}>
              {/* Dek utama */}
              <div style={{ display:'flex', minHeight:60 }}>
                {deckIds.map((id, i) => (
                  <CardTile
                    key={id} card={cardById[id]} size="lg" overlap={i > 0}
                    innerRef={setCardEl(id)}
                    selected={selIds.includes(id)}
                    onTap={() => act({ type: 'tapCard', id })}
                  />
                ))}
              </div>

              {/* Group Chain (kanan dek utama, kartu lebih kecil dan abu-abu) */}
              {groups.length > 0 && (
                <div style={{ display:'flex', alignItems:'flex-end', gap:8, paddingLeft:10, borderLeft:'1px dashed #35507a' }}>
                  {groups.map((g, gi) => (
                    <div key={g.join('.')} style={{
                      display:'flex', padding:'3px 4px', borderRadius:8,
                      border:`1px solid ${isGroupSelected(g, selIds) ? C.accent : '#4a5a78'}`,
                      background:'rgba(255,255,255,0.06)',
                    }}>
                      {g.map((id, i) => (
                        <CardTile
                          key={id} card={cardById[id]} size="sm" grouped overlap={i > 0}
                          innerRef={setCardEl(id)}
                          selected={selIds.includes(id)}
                          onTap={() => act({ type: 'tapGroup', index: gi })}
                        />
                      ))}
                    </div>
                  ))}
                </div>
              )}

              {/* Tombol GROUP / UNGROUP di atas kartu terkait */}
              {(() => {
                const overlap = anchors.group && anchors.ungroup.some(u => Math.abs(u.x - anchors.group.x) < 84)
                return (
                  <>
                    {anchors.group && (
                      <FloatBtn x={anchors.group.x + (overlap ? -44 : 0)} y={anchors.group.y} onClick={() => act({ type: 'group' })} bg={C.accent}>GROUP</FloatBtn>
                    )}
                    {anchors.ungroup.map(u => (
                      <FloatBtn key={u.index} x={u.x + (overlap ? 44 : 0)} y={u.y} onClick={() => act({ type: 'ungroup', index: u.index })} bg={C.deep}>UNGROUP</FloatBtn>
                    ))}
                  </>
                )
              })()}
            </div>
          </div>

          {!compact && (
            <Controls onSkip={handleSkip} onPlay={handlePlay}
              skipDisabled={!connected || !myTurn} playDisabled={!canPlay} count={selIds.length} />
          )}
        </div>

        {compact && (
          <div style={{ display:'flex', alignItems:'center', gap:6, marginTop:6 }}>
            <ClearButton onClick={resetSel} disabled={selIds.length === 0} />
            <div style={{ flex:1 }} />
            <Controls row onSkip={handleSkip} onPlay={handlePlay}
              skipDisabled={!connected || !myTurn} playDisabled={!canPlay} count={selIds.length} />
          </div>
        )}
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

function CardTile({ card, selected, onTap, size = 'lg', overlap, grouped, innerRef }) {
  const red = IS_RED[card.suit]
  const dim = size === 'lg' ? { w:42, h:60, fs:14, fss:12, ov:16 }
            : size === 'sm' ? { w:30, h:42, fs:11, fss:9,  ov:12 }
            :                 { w:34, h:48, fs:12, fss:10, ov:16 }
  // Kartu dalam grup: lebih kecil dan agak abu-abu; saat terpilih tampil menonjol seperti kartu dek utama.
  const gray = grouped && !selected

  return (
    <div
      ref={innerRef}
      onClick={onTap}
      style={{
        width: dim.w, height: dim.h, flexShrink:0,
        background: selected ? '#1e3a5f' : gray ? '#c9cdd6' : '#fff',
        border: `1.5px solid ${selected ? C.accent : gray ? '#9097a3' : '#ccc'}`,
        borderRadius: 6,
        display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center',
        gap:1,
        color: gray ? (red ? '#9b5a55' : '#3d4350') : (red ? '#c0392b' : '#1a1a2e'),
        cursor: onTap ? 'pointer' : 'default',
        transform: selected ? 'translateY(-14px)' : 'translateY(0)',
        transition: 'transform 0.12s, border-color 0.12s',
        marginLeft: overlap ? -dim.ov : 0,
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

/** Combo Detector: jenis kombinasi yang bisa dibentuk dari tangan (dek utama + grup). */
function DetectorPanel({ available, activePick, onPick, compact }) {
  const types = COMBO_TYPES.filter(t => available[t.key]?.length)
  if (!types.length) return null
  return (
    <div style={compact
      ? { display:'flex', gap:6, overflowX:'auto', padding:'0 0 6px' }
      : { display:'grid', gridTemplateColumns:'1fr 1fr', gap:4 }}>
      {types.map(t => {
        const on = activePick?.type === t.key
        return (
          <button key={t.key} onClick={() => onPick(t.key)} title={`Pilih ${t.label} (klik lagi: berikutnya)`}
            style={{
              flexShrink:0, padding:'5px 6px', fontSize:11, fontWeight:600, borderRadius:7, cursor:'pointer',
              background: on ? C.accent : C.deep, color: on ? '#fff' : C.text,
              border:`1px solid ${on ? C.accent : C.border}`, whiteSpace:'nowrap',
            }}>
            {t.label}{on ? ` ${activePick.index + 1}/${available[t.key].length}` : ''}
          </button>
        )
      })}
    </div>
  )
}

function ClearButton({ onClick, disabled }) {
  return (
    <button onClick={onClick} disabled={disabled}
      style={{ ...smallBtn, background:'transparent', color: disabled ? C.muted : C.text, border:`1px solid ${C.border}`, opacity: disabled ? 0.5 : 1 }}>
      CLEAR
    </button>
  )
}

/** Kolom kanan: AUTO (placeholder), SKIP, PLAY, HINT (placeholder). */
function Controls({ row, onSkip, onPlay, skipDisabled, playDisabled, count }) {
  const placeholder = (label) => (
    <button disabled title="Segera hadir" style={{ ...smallBtn, background:'#222', color:'#666', border:'1px solid #2a2a3a' }}>{label}</button>
  )
  return (
    <div style={row
      ? { display:'flex', gap:6, alignItems:'center' }
      : { width:88, flexShrink:0, display:'flex', flexDirection:'column', justifyContent:'space-between', gap:6 }}>
      {placeholder('AUTO')}
      <button onClick={onSkip} disabled={skipDisabled}
        style={{ ...smallBtn, background:C.deep, color: skipDisabled ? C.muted : C.text, border:`1px solid ${C.border}` }}>SKIP</button>
      <button onClick={onPlay} disabled={playDisabled}
        style={{ ...smallBtn, fontSize:13, padding: row ? '8px 14px' : '12px 0', background: playDisabled ? '#333' : C.accent, color: playDisabled ? C.muted : '#fff' }}>
        PLAY{count > 0 ? ` (${count})` : ''}
      </button>
      {placeholder('HINT')}
    </div>
  )
}

// Tombol melayang di atas kartu (GROUP / UNGROUP). Kartu terpilih terangkat 14px, tombol setinggi 26px + jarak 4px.
function FloatBtn({ x, y, onClick, bg, children }) {
  return (
    <button onClick={onClick}
      style={{
        position:'absolute', left:Math.max(x, 40), top:y - 44, transform:'translateX(-50%)', zIndex:30,
        height:26, padding:'0 10px', fontSize:11, fontWeight:700, borderRadius:7, border:`1px solid ${C.border}`,
        background:bg, color:'#fff', cursor:'pointer', whiteSpace:'nowrap', boxShadow:'0 2px 8px rgba(0,0,0,0.4)',
      }}>{children}</button>
  )
}

/* ── Helpers ──────────────────────────────────────────────── */

function flex(j) { return { display:'flex', alignItems:'center', justifyContent:j } }

const smallBtn = {
  padding:'8px 10px', borderRadius:8, fontSize:11, fontWeight:700,
  border:'none', cursor:'pointer', transition:'background 0.15s, opacity 0.15s',
}

// Posisi elemen relatif terhadap wadah (offsetLeft/Top mengabaikan transform, jadi tidak terganggu animasi angkat kartu).
function offsetWithin(el, wrap) {
  let left = 0, top = 0, n = el
  while (n && n !== wrap) { left += n.offsetLeft; top += n.offsetTop; n = n.offsetParent }
  return { left, top }
}

// Layar sempit (HP): Combo Detector pindah ke baris di atas dek, kontrol ke baris di bawah.
function useCompact(breakpoint) {
  const get = () => typeof window !== 'undefined' && window.innerWidth < breakpoint
  const [compact, setCompact] = useState(get)
  useEffect(() => {
    const on = () => setCompact(get())
    window.addEventListener('resize', on)
    return () => window.removeEventListener('resize', on)
  }, [breakpoint])   // eslint-disable-line react-hooks/exhaustive-deps
  return compact
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
