import React from 'react'
import { canShowKick } from '../utils/kick'
import { C, s } from './lobbyStyles'

// Inside a Room (status waiting): code, 4 seats, Start / Exit, and the Kick buttons. Presentational only: LobbyPage owns the
// state (exiting, kick target), the socket calls and the confirmation Modal, and passes them in as props and callbacks.
export default function RoomView({ room, user, players, isHost, ready, exiting, nameOf, onStart, onExit, onKick }) {
  return (
    <div style={s.card}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12 }}>
        <div style={s.title}>Room</div>
        <span style={s.pill}>{players.length}/4 pemain</span>
      </div>

      <div style={s.code}>{room.code}</div>
      <div style={s.hint}>Bagikan kode ini ke teman-temanmu</div>

      <div style={{ marginTop:16, marginBottom:16 }}>
        {Array.from({ length: 4 }).map((_, i) => {
          const p = players[i]
          return (
            <div key={i} style={s.seat}>
              <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                <div style={s.dot(p?.connected)} />
                <span style={{ fontSize:14, color: p ? C.text : C.muted }}>
                  {p ? (p.id === user?.id ? `${nameOf(p.id)} (kamu)` : nameOf(p.id)) : 'Menunggu…'}
                </span>
              </div>
              <span style={{ display:'flex', gap:8, alignItems:'center' }}>
                {p && p.inRoom === false && <span style={{ fontSize:11, color:C.muted }}>belum kembali</span>}
                {p?.id === room.hostId && <span style={{ fontSize:11, color:C.yellow }}>Host</span>}
                {p && canShowKick({ myId: user?.id, hostId: room.hostId, targetId: p.id, players, status: room.status }) && (
                  <button
                    onClick={() => onKick(p.id)}
                    style={{ padding:'2px 8px', fontSize:11, fontWeight:600, borderRadius:6, background:'transparent', color:C.accent, border:`1px solid ${C.accent}`, cursor:'pointer' }}
                  >Kick</button>
                )}
              </span>
            </div>
          )
        })}
      </div>

      <div style={{ fontSize:12, color:C.muted, marginBottom:12 }}>
        {room.maxGames} game per set
      </div>

      {isHost ? (
        <button
          style={{ ...s.btn, background: ready ? C.accent : '#333', color: ready ? '#fff' : C.muted, cursor: ready ? 'pointer' : 'not-allowed', marginBottom:0 }}
          onClick={onStart}
        >
          {ready ? 'Mulai Game'
            : players.length < 4 ? `Menunggu pemain (${players.length}/4)`
            : 'Menunggu semua pemain kembali'}
        </button>
      ) : (
        <div style={{ ...s.hint, padding:'10px 0' }}>Menunggu host memulai game…</div>
      )}

      <button
        style={{ ...s.btn, background:'transparent', color:C.accent, border:`1px solid ${C.accent}`, marginTop:12, marginBottom:0, opacity: exiting ? 0.6 : 1, cursor: exiting ? 'default' : 'pointer' }}
        onClick={onExit}
        disabled={exiting}
      >
        {exiting ? 'Keluar dari room…' : 'Exit Room'}
      </button>
    </div>
  )
}
