import React from 'react'
import { C, s } from './lobbyStyles'

// Homepage ("Menu Utama"): create a Room or join one. Presentational only: the selected values, the validation and the
// socket calls stay in LobbyPage, which passes them in as props (so the choices survive a visit to a Room, as before).
export default function HomeView({ maxGamesOptions, maxGames, onMaxGamesChange, joinInput, onJoinInputChange, onCreate, onJoin }) {
  return (
    <>
      <div style={s.card}>
        <div style={s.title}>Buat Room Baru</div>
        <label style={{ ...s.tag, display:'block', marginBottom:6 }}>Jumlah game per set</label>
        <div style={s.row}>
          {maxGamesOptions.map(n => (
            <button
              key={n}
              onClick={() => onMaxGamesChange(n)}
              style={{
                flex:1, padding:'8px 0', borderRadius:8, fontSize:14, fontWeight:600,
                border: maxGames===n ? `2px solid ${C.accent}` : `1px solid ${C.border}`,
                background: maxGames===n ? 'rgba(233,69,96,0.15)' : '#0f3460',
                color: maxGames===n ? C.accent : C.text, cursor:'pointer',
              }}
            >{n}</button>
          ))}
        </div>
        <button style={{ ...s.btn, background:C.accent, color:'#fff', marginTop:4 }} onClick={onCreate}>
          Buat Room
        </button>
      </div>

      <div style={s.card}>
        <div style={s.title}>Gabung Room</div>
        <input
          style={s.input}
          placeholder="Masukkan kode room (contoh: AB3X9Z)"
          value={joinInput}
          onChange={e => onJoinInputChange(e.target.value.toUpperCase())}
          maxLength={6}
        />
        <button style={{ ...s.btn, background:'#0f3460', color:C.text, border:`1px solid ${C.border}` }} onClick={onJoin}>
          Gabung
        </button>
      </div>
    </>
  )
}
