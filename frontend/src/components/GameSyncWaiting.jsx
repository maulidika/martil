import React, { useEffect, useState } from 'react'
import { useGameStore } from '../store/gameStore'
import { requestResume } from '../hooks/useSocket'

const C = { bg:'#1a1a2e', accent:'#e94560', muted:'#888', border:'#1a4a7a', text:'#eee' }

const RETRY_AFTER_MS = 6_000
const GIVE_UP_AFTER_MS = 15_000

/**
 * Pengganti layar "Menunggu data game…" yang dulu bisa menggantung tanpa batas.
 * Setelah 6 detik meminta ulang state ke server; setelah 15 detik menampilkan pesan
 * jelas beserta tombol Coba lagi / Muat ulang.
 */
export default function GameSyncWaiting() {
  const [stuck, setStuck] = useState(false)

  useEffect(() => {
    const t1 = setTimeout(() => {
      const { sync, connected } = useGameStore.getState()
      if (sync === 'ok' && connected) requestResume()
    }, RETRY_AFTER_MS)
    const t2 = setTimeout(() => setStuck(true), GIVE_UP_AFTER_MS)
    return () => { clearTimeout(t1); clearTimeout(t2) }
  }, [])

  return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100dvh', background:C.bg, flexDirection:'column', gap:12, padding:24, textAlign:'center' }}>
      <div style={{ fontSize:32 }}>🃏</div>
      {!stuck ? (
        <div style={{ color:C.muted }}>Menunggu data game…</div>
      ) : (
        <>
          <div style={{ color:C.text, fontWeight:600 }}>Data game belum diterima dari server</div>
          <div style={{ color:C.muted, fontSize:13, maxWidth:300 }}>
            Koneksi mungkin terganggu atau game sudah tidak tersedia.
          </div>
          <div style={{ display:'flex', gap:10, marginTop:6 }}>
            <button
              onClick={() => { setStuck(false); requestResume() }}
              style={{ padding:'10px 16px', borderRadius:8, border:'none', background:C.accent, color:'#fff', fontWeight:600, cursor:'pointer' }}
            >Coba lagi</button>
            <button
              onClick={() => window.location.reload()}
              style={{ padding:'10px 16px', borderRadius:8, border:`1px solid ${C.border}`, background:'#0f3460', color:C.text, fontWeight:600, cursor:'pointer' }}
            >Muat ulang</button>
          </div>
        </>
      )}
    </div>
  )
}
