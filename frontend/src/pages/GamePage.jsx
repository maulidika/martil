import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useGameStore } from '../store/gameStore'
import { emitSocket } from '../hooks/useSocket'
import GameSyncWaiting from '../components/GameSyncWaiting'
import { detectCombo, canBeat, sortHand, comboLabel, displayOrder } from '../utils/comboDetector'
import { COMBO_TYPES, listAvailableCombos, activePickOf } from '../utils/comboPicker'
import { mainDeckIds, isGroupSelected, anchorAbove, canGroupSelection } from '../utils/groupChain'
import { INITIAL_UI, syncUi, reduceHandUi } from '../utils/handUi'
import { computeLayout, seatSides, orderOpponents, turnRingPct } from '../utils/gameLayout'
import { getProfile, betLabel } from '../utils/profile'
import {
  T, TableSurface, PlayerSeat, MyBadge, PlayingCard, DetectorPills, ClearButton, PlayButton, RoundButton, BetBadge, InfoPanel,
} from '../components/game/ui'

/* ── palette (hanya untuk tombol GROUP/UNGROUP; tema meja ada di components/game/ui.jsx) ── */
const C = { deep:'#0f3460', accent:'#e94560', border:'#1a4a7a' }

export default function GamePage() {
  const navigate = useNavigate()
  const { user, roomCode, gameState, currentTurn, selectedIds,
          setSelection, clearSelection, events, roomInfo, connected, setError, error, clearError } = useGameStore()

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
  const vp = useViewport()
  const L = computeLayout(vp.w, vp.h)
  const compact = L.compact

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
  }, [selKey, groupsKey, handKey, compact, L.card])   // eslint-disable-line react-hooks/exhaustive-deps

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

  // Errors disappear on their own after a few seconds (a new error restarts the timer).
  useEffect(() => {
    if (!error) return
    const timer = setTimeout(clearError, 4000)
    return () => clearTimeout(timer)
  }, [error])

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

  const setScores  = roomInfo?.setScores || {}
  const gameNumber = gameState.gameNumber
  const connectedOf = Object.fromEntries((roomInfo?.players || []).map(p => [p.id, p.connected !== false]))

  // Susunan kursi: lawan diurutkan menurut urutan giliran setelah pemain utama (kiri → atas → kanan).
  const opponents = orderOpponents(gameState.opponents || [], (roomInfo?.players || []).map(p => p.id), user?.id)
  const sides     = seatSides(opponents.length)
  const ringPct   = turnRingPct(timeLeft)
  const me        = getProfile(user?.id, user)
  const font      = L.seatFont
  const bet       = betLabel(roomInfo)
  const nameOf    = (id) => id === user?.id ? 'kamu' : getProfile(id).name
  const detectorTypes = COMBO_TYPES.filter(t => available[t.key]?.length)
  const onPick    = (kind) => act({ type: 'detector', available, kind })
  const topSeatH  = L.seatH                                    // tinggi kursi atas; area meja berada di bawahnya
  const status    = myTurn ? 'Giliran kamu' : currentTurn ? `Menunggu ${nameOf(currentTurn)}` : 'Menunggu…'
  const seatPos   = (side) => side === 'left'  ? { left: '3%', top: font * 5 + 12 }
                           : side === 'right' ? { right: '3%', top: font * 5 + 12 }
                           :                    { left: '50%', transform: 'translateX(-50%)', top: 10 }
  // Layar sempit: tiga kursi berjajar rata di bawah baris info (tidak saling bertumpuk)
  const seatCol   = (side) => ({ left: 1, top: 2, right: 3 }[side] || 2)
  const compactTop = Math.round(font * 3.4)

  // Umpan balik seleksi (sebelumnya di bawah meja): kombinasi terbaca, tidak valid, atau tidak bisa mengalahkan meja
  const hints = []
  if (combo) hints.push({ text: `${beatsTable ? '✓ ' : ''}${combo.label}`, color: beatsTable ? T.green : T.muted })
  if (combo && tableTop && !beatsTable) hints.push({ text: 'Tidak bisa mengalahkan meja', color: T.gold })
  if (selected.length > 0 && !combo) hints.push({ text: 'Kombinasi tidak valid', color: T.accent })

  const detector = <DetectorPills types={detectorTypes} activePick={activePick} available={available} onPick={onPick} compact={compact} font={font + 1} maxHeight={compact ? undefined : L.detectorMaxH} />
  const clear    = <ClearButton onClick={resetSel} disabled={selIds.length === 0} font={font + 1} />
  const skipBtn  = <RoundButton label="SKIP" onClick={handleSkip} disabled={!connected || !myTurn} width={compact ? 64 : Math.min(L.play, 104)} height={compact ? 40 : 44} font={font + 1} />
  const playBtn  = <PlayButton onClick={handlePlay} disabled={!canPlay} size={compact ? 76 : L.play} count={selIds.length} />
  const hintBtn  = <RoundButton label="HINT" disabled placeholder width={compact ? 56 : Math.min(L.play, 88)} height={compact ? 34 : 38} font={font} />
  const autoBtn  = <RoundButton label="AUTO" disabled placeholder width={64} height={34} font={font} />

  return (
    <div style={{ position:'relative', height:'100dvh', background:'#0b2f5c', display:'flex', flexDirection:'column', userSelect:'none', overflow:'hidden', fontFamily:T.font }}>
      <TableSurface logoSize={Math.round(Math.min(vp.w * 0.3, vp.h * 0.36))} />

      {/* Toast */}
      {toast && (
        <div style={{
          position:'fixed', top:12, left:'50%', transform:'translateX(-50%)',
          background:'rgba(4,16,36,0.9)', color:'#fff', fontSize:13, fontWeight:600,
          padding:'8px 18px', borderRadius:24, zIndex:999, whiteSpace:'nowrap',
          pointerEvents:'none', border:`1px solid ${T.glassBorder}`,
        }}>{toast}</div>
      )}

      {/* Error from the server or from a rejected local action (e.g. "Bukan giliranmu") */}
      {error && (
        <div role="alert" data-testid="game-error" style={{
          position:'fixed', top:(toast ? 52 : 12), left:'50%', transform:'translateX(-50%)',
          background:'rgba(120,20,40,0.94)', color:'#fff', fontSize:13, fontWeight:600,
          padding:'8px 18px', borderRadius:24, zIndex:998, maxWidth:'92vw', textAlign:'center',
          pointerEvents:'none', border:'1px solid rgba(255,120,140,0.6)',
        }}>{error}</div>
      )}

      {/* Area meja: info, AUTO, kursi lawan, kartu di meja */}
      <div style={{ position:'relative', flex:1, minHeight:0 }}>
        <div style={{ position:'absolute', left:12, top:10 }}>
          <InfoPanel gameNumber={gameNumber} maxGames={roomInfo?.maxGames} status={status} myTurn={myTurn} font={font} compact={compact} />
        </div>
        <div style={{ position:'absolute', right:12, top:10 }}>{autoBtn}</div>

        {opponents.map((op, i) => {
          const profile = getProfile(op.id)
          const side = sides[i]
          return (
            <div key={op.id} style={compact
              ? { position:'absolute', zIndex:2, top:compactTop + 6, left:`${(seatCol(side) - 1) * 33.333}%`, width:'33.333%', display:'flex', justifyContent:'center' }
              : { position:'absolute', zIndex:2, ...seatPos(side) }}>
              <PlayerSeat
                side={side} profile={profile} cardCount={op.cardCount} score={setScores[op.id]}
                active={currentTurn === op.id} ringPct={ringPct} timeLeft={timeLeft}
                connected={connectedOf[op.id] !== false} size={compact ? Math.round(L.avatar * 0.9) : L.avatar} font={font} compact={compact}
              />
            </div>
          )
        })}

        {/* Umpan balik seleksi di dasar area meja, tepat di atas tangan */}
        {hints.length > 0 && (
          <div data-testid="hint" style={{ position:'absolute', left:0, right:0, bottom:4, display:'flex', justifyContent:'center', gap:8, zIndex:3 }}>
            {hints.map(h => <span key={h.text} style={{ fontSize:font, fontWeight:700, color:h.color, background:T.glass, border:`1px solid ${T.glassBorder}`, borderRadius:999, padding:'2px 12px' }}>{h.text}</span>)}
          </div>
        )}

        {/* Kartu yang sedang di meja */}
        <div data-testid="table" style={{
          position:'absolute', left: compact ? 4 : '20%', right: compact ? 4 : '20%', bottom:Math.round(font * 2.4), top: (compact ? compactTop + 6 : sides.includes('top') ? 10 : 24) + (compact || sides.includes('top') ? topSeatH : 0),
          display:'flex', alignItems:'center', justifyContent:'center', flexDirection:'column', gap:Math.round(font * 0.6),
        }}>
          {tableTop ? (
            <>
              <div style={{ display:'flex', justifyContent:'center', paddingRight:Math.round(L.table * 0.26) }}>
                {displayOrder(tableTop.combo).map((c, i) => <PlayingCard key={c.id} card={c} w={L.table} step={0.74} overlap={i > 0} />)}
              </div>
              <div style={{ display:'flex', gap:8, alignItems:'center', fontSize:font, color:T.text, background:T.glass, border:`1px solid ${T.glassBorder}`, borderRadius:999, padding:'3px 14px' }}>
                <b style={{ color:T.gold }}>{comboLabel(tableTop.combo)}</b>
                <span style={{ color:T.muted }}>oleh {nameOf(tableTop.playerId)}</span>
              </div>
            </>
          ) : (
            <div style={{ color:'rgba(210,232,255,0.8)', fontSize:Math.round(font * 1.2), fontWeight:600, textShadow:'0 1px 6px rgba(0,0,0,0.5)' }}>
              {myTurn ? 'Meja kosong — main bebas' : 'Meja kosong'}
            </div>
          )}
        </div>
      </div>

      {/* Zona tangan: [Combo Detector + CLEAR + taruhan] [dek utama | grup] [SKIP, PLAY, HINT] + profil pemain utama */}
      <div style={{ position:'relative', flexShrink:0, padding: compact ? '0 6px 8px' : '0 12px 10px' }}>
        {compact && <div>{detector}</div>}

        <div style={{ display:'flex', alignItems:'flex-end', gap:8 }}>
          {!compact && (
            // Kolom kiri menempel di dasar dan boleh tumbuh ke atas tanpa mendorong tinggi zona tangan.
            <div style={{ width:L.side, flexShrink:0, alignSelf:'stretch', position:'relative' }}>
              <div style={{ position:'absolute', left:0, right:0, bottom:4, display:'flex', flexDirection:'column', gap:10 }}>
                {detector}
                <div>{clear}</div>
                <BetBadge label={bet} font={font} />
              </div>
            </div>
          )}

          <div style={{ flex:1, minWidth:0, overflowX:'auto', display:'flex' }}>
            <div ref={wrapRef} data-testid="hand" style={{ position:'relative', display:'flex', alignItems:'flex-end', gap:Math.round(L.card * 0.3), margin:'0 auto', padding:`${L.lift + 40}px 10px 6px` }}>
              {/* Dek utama */}
              <div style={{ display:'flex', minHeight:L.cardH }}>
                {deckIds.map((id, i) => (
                  <PlayingCard
                    key={id} card={cardById[id]} w={L.card} step={L.step} lift={L.lift} overlap={i > 0}
                    innerRef={setCardEl(id)}
                    selected={selIds.includes(id)}
                    onTap={() => act({ type: 'tapCard', id })}
                  />
                ))}
              </div>

              {/* Group Chain (kanan dek utama, kartu lebih kecil dan agak abu-abu) */}
              {groups.length > 0 && (
                <div style={{ display:'flex', alignItems:'flex-end', gap:8, paddingLeft:Math.round(L.card * 0.2), borderLeft:'1px dashed rgba(160,205,255,0.4)' }}>
                  {groups.map((g, gi) => (
                    <div key={g.join('.')} data-group={gi} style={{
                      display:'flex', padding:'3px 5px', borderRadius:10,
                      border:`1px solid ${isGroupSelected(g, selIds) ? '#ffc933' : 'rgba(160,205,255,0.35)'}`,
                      background:'rgba(255,255,255,0.08)',
                    }}>
                      {g.map((id, i) => (
                        <PlayingCard
                          key={id} card={cardById[id]} w={Math.round(L.card * 0.7)} step={0.74} lift={Math.round(L.lift * 0.8)} grouped overlap={i > 0}
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
                      <FloatBtn x={anchors.group.x + (overlap ? -44 : 0)} y={anchors.group.y} lift={L.lift} onClick={() => act({ type: 'group' })} bg={C.accent}>GROUP</FloatBtn>
                    )}
                    {anchors.ungroup.map(u => (
                      <FloatBtn key={u.index} x={u.x + (overlap ? 44 : 0)} y={u.y} lift={Math.round(L.lift * 0.8)} onClick={() => act({ type: 'ungroup', index: u.index })} bg={C.deep}>UNGROUP</FloatBtn>
                    ))}
                  </>
                )
              })()}
            </div>
          </div>

          {!compact && (
            <div style={{ width:L.side, flexShrink:0, alignSelf:'stretch', position:'relative' }}>
              <div style={{ position:'absolute', left:0, right:0, bottom:4, display:'flex', flexDirection:'column', alignItems:'center', gap:10 }}>
                {skipBtn}{playBtn}{hintBtn}
              </div>
            </div>
          )}
        </div>

        {compact && (
          <div style={{ display:'flex', alignItems:'center', gap:8, marginTop:4 }}>
            <div style={{ display:'flex', flexDirection:'column', gap:6, alignItems:'flex-start' }}>{clear}<BetBadge label={bet} font={font} /></div>
            <div style={{ flex:1 }} />
            <div style={{ display:'flex', gap:8, alignItems:'center' }}>{skipBtn}{playBtn}{hintBtn}</div>
          </div>
        )}

        <div style={{ display:'flex', justifyContent:'center', marginTop: compact ? 6 : 2 }}>
          <MyBadge profile={me} cardCount={myHand.length} score={setScores[user?.id]} active={myTurn} ringPct={ringPct} timeLeft={timeLeft} size={compact ? 38 : Math.round(L.avatar * 0.62)} font={font} />
        </div>
      </div>
    </div>
  )
}

/* ── Sub-components ───────────────────────────────────────── */

// Tombol melayang di atas kartu (GROUP / UNGROUP). Kartu terpilih terangkat `lift` px; tombol setinggi 26px + jarak 4px.
function FloatBtn({ x, y, lift, onClick, bg, children }) {
  return (
    <button onClick={onClick}
      style={{
        position:'absolute', left:Math.max(x, 40), top:y - (lift + 30), transform:'translateX(-50%)', zIndex:30,
        height:26, padding:'0 12px', fontSize:11, fontWeight:800, borderRadius:999, border:'1px solid rgba(255,255,255,0.45)',
        background:bg, color:'#fff', cursor:'pointer', whiteSpace:'nowrap', boxShadow:'0 2px 10px rgba(0,0,0,0.5)', fontFamily:T.font,
      }}>{children}</button>
  )
}

/* ── Helpers ──────────────────────────────────────────────── */

// Posisi elemen relatif terhadap wadah (offsetLeft/Top mengabaikan transform, jadi tidak terganggu animasi angkat kartu).
function offsetWithin(el, wrap) {
  let left = 0, top = 0, n = el
  while (n && n !== wrap) { left += n.offsetLeft; top += n.offsetTop; n = n.offsetParent }
  return { left, top }
}

// Ukuran viewport saat ini (memicu render ulang saat jendela diubah ukurannya).
function useViewport() {
  const get = () => ({ w: typeof window !== 'undefined' ? window.innerWidth : 1280, h: typeof window !== 'undefined' ? window.innerHeight : 720 })
  const [vp, setVp] = useState(get)
  useEffect(() => {
    const on = () => setVp(prev => { const n = get(); return n.w === prev.w && n.h === prev.h ? prev : n })
    window.addEventListener('resize', on)
    return () => window.removeEventListener('resize', on)
  }, [])   // eslint-disable-line react-hooks/exhaustive-deps
  return vp
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
