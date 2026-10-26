import React from 'react'
import { useNavigate } from 'react-router-dom'
import { useGameStore } from '../store/gameStore'

const C = { bg:'#1a1a2e', surface:'#16213e', accent:'#e94560', text:'#eee', muted:'#888', gold:'#f1c40f', silver:'#bdc3c7', bronze:'#e67e22', green:'#2ecc71', red:'#e74c3c' }
const MEDAL = ['🥇','🥈','🥉','💀']
const PRIZE = ['+5k','+3k','-3k','-5k']
const PRIZE_COLOR = [C.green, C.green, C.red, C.red]

export default function ResultPage() {
  const navigate = useNavigate()
  const { setResult, user, roomInfo, setSetResult } = useGameStore()

  const rankings = setResult?.rankings || []
  const setScores = setResult?.setScores || {}

  function goLobby() {
    setSetResult(null)
    navigate('/lobby')
  }

  return (
    <div style={{ minHeight:'100dvh', background:C.bg, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', padding:'1rem' }}>
      <div style={{ width:'100%', maxWidth:400 }}>

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
                    {isMe ? `${r.id.slice(0,8)} (Kamu)` : r.id.slice(0,8)}
                  </div>
                  <div style={{ fontSize:12, color:C.muted, marginTop:2 }}>Total skor: {r.totalScore} poin</div>
                </div>
                <div style={{ textAlign:'right' }}>
                  <div style={{ fontSize:16, fontWeight:700, color:PRIZE_COLOR[i] }}>{PRIZE[i]}</div>
                  <div style={{ fontSize:11, color:C.muted }}>Juara {i+1}</div>
                </div>
              </div>
            )
          })}
        </div>

        {/* Game-by-game history */}
        {roomInfo?.gameHistory?.length > 0 && (
          <div style={{ background:C.surface, borderRadius:12, padding:'1rem', marginBottom:16 }}>
            <div style={{ fontSize:13, fontWeight:600, color:C.text, marginBottom:10 }}>Riwayat Game</div>
            {roomInfo.gameHistory.map((g, i) => (
              <div key={i} style={{ display:'flex', justifyContent:'space-between', fontSize:12, color:C.muted, paddingBlock:4, borderBottom:i < roomInfo.gameHistory.length-1 ? `1px solid #1a4a7a` : 'none' }}>
                <span>Game {g.gameNumber}</span>
                <span>Menang: <b style={{ color:C.text }}>{g.winnerId?.slice(0,6)}</b></span>
                <span>{g.scores.find(s => s.id === user?.id)?.score ?? '?'} poin</span>
              </div>
            ))}
          </div>
        )}

        <button
          onClick={goLobby}
          style={{ width:'100%', padding:'13px', borderRadius:10, fontSize:15, fontWeight:600, background:C.accent, color:'#fff', border:'none', cursor:'pointer' }}
        >
          Kembali ke Lobby
        </button>
      </div>
    </div>
  )
}
