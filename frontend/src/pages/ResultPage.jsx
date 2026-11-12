import React from 'react'
import { useGameStore } from '../store/gameStore'
import { emitSocket } from '../hooks/useSocket'
import Modal from '../components/Modal'
import { canShowKick, kickConfirmText, backToRoomDecision, RESTRICTED_MODAL } from '../utils/kick'
import { playerName } from '../utils/profile'

const C = { bg:'#1a1a2e', surface:'#16213e', accent:'#e94560', text:'#eee', muted:'#888', gold:'#f1c40f', silver:'#bdc3c7', bronze:'#e67e22', green:'#2ecc71', red:'#e74c3c' }
const MEDAL = ['🥇','🥈','🥉','💀']
const PRIZE = ['+5k','+3k','-3k','-5k']
const PRIZE_COLOR = [C.green, C.green, C.red, C.red]

export default function ResultPage() {
  const { setResult, user, roomInfo, roomCode, connected, setError, events, error, restricted, restrictedModalOpen, openRestrictedModal, closeRestrictedModal } = useGameStore()
  const [kickTarget, setKickTarget] = React.useState(null)   // id pemain yang menunggu konfirmasi Kick
  // 'room' = menunggu jawaban Back to Room, 'menu' = menunggu jawaban Back to Menu Utama
  const [busy, setBusy] = React.useState(null)

  React.useEffect(() => {
    const t = events[0]?.type
    if (t === 'leave_room_error' || t === 'return_room_error') setBusy(null)
  }, [events[0]?._id])

  const rankings = setResult?.rankings || []
  const setScores = setResult?.setScores || {}
  // Riwayat dibekukan di setResult (tidak ikut berubah saat room di-reset pemain lain).
  const history = setResult?.gameHistory ?? roomInfo?.gameHistory ?? []
  // Names: the ones frozen with the result first (still right after someone left or was kicked), then the live Room state.
  const profiles = { ...roomInfo?.profiles, ...setResult?.profiles }
  const nameOf = (id) => playerName(id, { profiles, account: id === user?.id ? user : undefined })

  // Dua aksi berbeda: Back to Room → return_to_room (tetap anggota, room direset),
  // Back to Menu Utama → leave_room (keluar dari room sepenuhnya).
  function sendRoomAction(kind, event, logName, failMsg) {
    const code = roomCode || roomInfo?.code
    // Back to Room oleh pemain yang di-Kick: modal "Akses Room Dibatasi" (tanpa menghubungi server);
    // tiap tekanan menampilkannya lagi, dan tidak pernah muncul otomatis.
    const decision = kind === 'room'
      ? backToRoomDecision({ busy, restricted, code, connected })
      : backToRoomDecision({ busy, restricted: false, code, connected })
    if (decision === 'busy') return
    if (decision === 'restricted') { openRestrictedModal(); return }
    if (decision === 'no_code') {
      setError('Kode room tidak ditemukan. Coba refresh halaman.')
      return
    }
    if (decision === 'offline') {
      setError('Koneksi ke server terputus. Tunggu tersambung sebelum melanjutkan.')
      return
    }
    console.info(`[MARTIL ${new Date().toISOString()}] ${logName}`, { roomCode: code })
    setBusy(kind)
    if (!emitSocket(event, { roomCode: code })) {
      setBusy(null)
      setError(failMsg)
    }
  }
  const goRoom = () => sendRoomAction('room', 'return_to_room', 'RETURN_TO_ROOM_CLICKED', 'Gagal mengirim permintaan kembali ke room. Periksa koneksi server.')
  const goMenu = () => sendRoomAction('menu', 'leave_room', 'LEAVE_ROOM_CLICKED', 'Gagal mengirim permintaan keluar room. Periksa koneksi server.')

  // Host Kick: konfirmasi dulu, lalu server memvalidasi (hanya Host, bukan saat game berlangsung).
  const players = roomInfo?.players || []
  const showKick = (id) => canShowKick({ myId: user?.id, hostId: roomInfo?.hostId, targetId: id, players, status: roomInfo?.status })
  const kickPlayerInfo = kickTarget ? players.find(p => p.id === kickTarget) : null
  function confirmKick() {
    const code = roomCode || roomInfo?.code
    const target = kickTarget
    setKickTarget(null)
    if (!target || !code) return
    if (!emitSocket('kick_player', { roomCode: code, targetId: target })) setError('Koneksi ke server terputus. Tunggu tersambung sebelum mengeluarkan pemain.')
  }

  return (
    // Halaman dibagi dua: konten Result yang bisa di-scroll vertikal, dan area tombol navigasi yang selalu terlihat (sticky di bawah).
    <div style={{ height:'100dvh', background:C.bg, display:'flex', flexDirection:'column' }}>
      <div data-testid="result-scroll" style={{ flex:1, minHeight:0, overflowY:'auto', WebkitOverflowScrolling:'touch', display:'flex', flexDirection:'column', padding:'1rem' }}>
      <div style={{ width:'100%', maxWidth:400, margin:'auto' }}>

        {error && (
          <div role="alert" style={{ background:'rgba(233,69,96,0.12)', border:`1px solid ${C.accent}`, color:C.accent, borderRadius:8, padding:'9px 12px', fontSize:13, marginBottom:14 }}>
            {error}
          </div>
        )}

        <div style={{ textAlign:'center', marginBottom:24 }}>
          <div style={{ fontSize:40, marginBottom:8 }}>🏆</div>
          <div style={{ fontSize:22, fontWeight:700, color:C.text }}>Set Selesai!</div>
          <div style={{ fontSize:13, color:C.muted, marginTop:4 }}>Hasil akhir satu set</div>
        </div>

        <div style={{ background:C.surface, borderRadius:16, overflow:'hidden', marginBottom:16 }}>
          {rankings.map((r, i) => {
            const isMe = r.id === user?.id
            return (
              <div key={r.id} style={{
                display:'flex', alignItems:'center', padding:'14px 16px',
                background: isMe ? 'rgba(241,196,15,0.08)' : 'transparent',
                borderBottom: i < rankings.length-1 ? `1px solid #1a4a7a` : 'none',
              }}>
                <div style={{ fontSize:24, width:40, textAlign:'center' }}>{MEDAL[i]}</div>
                <div style={{ flex:1, marginLeft:10 }}>
                  <div style={{ fontSize:15, fontWeight:600, color: isMe ? C.gold : C.text }}>
                    {isMe ? `${nameOf(r.id)} (Kamu)` : nameOf(r.id)}
                  </div>
                  <div style={{ fontSize:12, color:C.muted, marginTop:2 }}>Total skor: {r.totalScore} poin</div>
                </div>
                <div style={{ textAlign:'right' }}>
                  <div style={{ fontSize:16, fontWeight:700, color:PRIZE_COLOR[i] }}>{PRIZE[i]}</div>
                  <div style={{ fontSize:11, color:C.muted }}>Juara {i+1}</div>
                  {showKick(r.id) && (
                    <button
                      onClick={() => setKickTarget(r.id)}
                      style={{ marginTop:4, padding:'2px 8px', fontSize:11, fontWeight:600, borderRadius:6, background:'transparent', color:C.accent, border:`1px solid ${C.accent}`, cursor:'pointer' }}
                    >Kick</button>
                  )}
                </div>
              </div>
            )
          })}
        </div>

        {/* Game-by-game history */}
        {history.length > 0 && (
          <div style={{ background:C.surface, borderRadius:12, padding:'1rem', marginBottom:16 }}>
            <div style={{ fontSize:13, fontWeight:600, color:C.text, marginBottom:10 }}>Riwayat Game</div>
            {history.map((g, i) => (
              <div key={i} style={{ display:'flex', justifyContent:'space-between', fontSize:12, color:C.muted, paddingBlock:4, borderBottom:i < history.length-1 ? `1px solid #1a4a7a` : 'none' }}>
                <span>Game {g.gameNumber}</span>
                <span>Menang: <b style={{ color:C.text }}>{nameOf(g.winnerId)}</b></span>
                <span>{g.scores.find(s => s.id === user?.id)?.score ?? '?'} poin</span>
              </div>
            ))}
          </div>
        )}

      </div>
      </div>

      {/* Area tombol navigasi: tetap terlihat, tidak ikut ter-scroll */}
      <div data-testid="result-nav" style={{ flexShrink:0, background:C.bg, borderTop:'1px solid #1a4a7a', padding:'0.75rem 1rem calc(0.75rem + env(safe-area-inset-bottom, 0px))' }}>
        <div style={{ width:'100%', maxWidth:400, margin:'0 auto' }}>
          <button
            onClick={goRoom}
            disabled={!!busy}
            style={{ width:'100%', padding:'13px', borderRadius:10, fontSize:15, fontWeight:600, background:C.accent, color:'#fff', border:'none', cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.6 : 1, marginBottom:10 }}
          >
            {busy === 'room' ? 'Kembali ke room…' : 'Back to Room'}
          </button>
          <button
            onClick={goMenu}
            disabled={!!busy}
            style={{ width:'100%', padding:'13px', borderRadius:10, fontSize:15, fontWeight:600, background:'#0f3460', color:C.text, border:'1px solid #1a4a7a', cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.6 : 1 }}
          >
            {busy === 'menu' ? 'Keluar dari room…' : 'Back to Menu Utama'}
          </button>
          <div style={{ fontSize:11, color:C.muted, textAlign:'center', marginTop:10, lineHeight:1.5 }}>
            Back to Room: tetap di room ini dan menunggu pemain lain.<br />
            Back to Menu Utama: keluar dari room.
          </div>
        </div>
      </div>

      {kickTarget && (
        <Modal
          testId="kick-confirm"
          title="Kick pemain?"
          onEscape={() => setKickTarget(null)}
          actions={[
            { label: 'Batal', onClick: () => setKickTarget(null) },
            { label: 'Kick', onClick: confirmKick, primary: true },
          ]}
        >
          {kickConfirmText(nameOf(kickTarget || ''), kickPlayerInfo ? kickPlayerInfo.inRoom === false : true)}
        </Modal>
      )}

      {restrictedModalOpen && (
        <Modal
          testId="restricted-modal"
          title={RESTRICTED_MODAL.title}
          actions={[{ label: RESTRICTED_MODAL.ok, onClick: closeRestrictedModal, primary: true, autoFocus: true }]}
        >
          {RESTRICTED_MODAL.message}
        </Modal>
      )}
    </div>
  )
}
