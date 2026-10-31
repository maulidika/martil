import React, { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useGameStore } from '../store/gameStore'
import { requestResume, retryConnection } from '../hooks/useSocket'

const C = { bg:'#1a1a2e', surface:'#16213e', accent:'#e94560', muted:'#888', border:'#1a4a7a', text:'#eee', yellow:'#f1c40f' }

const btn = {
  padding:'11px 18px', borderRadius:8, fontSize:14, fontWeight:600,
  border:'none', cursor:'pointer',
}

/**
 * Overlay penuh layar untuk status koneksi + banner pesan singkat.
 * Tampil hanya bila pemain sudah login (token ada) dan status sinkronisasi bukan 'ok'.
 */
export default function ConnectionOverlay() {
  const navigate = useNavigate()
  const token      = useGameStore(s => s.token)
  const sync       = useGameStore(s => s.sync)
  const syncMessage = useGameStore(s => s.syncMessage)
  const notice     = useGameStore(s => s.notice)
  const setNotice  = useGameStore(s => s.setNotice)
  const logout     = useGameStore(s => s.logout)

  // Pesan singkat hilang sendiri setelah beberapa detik.
  useEffect(() => {
    if (!notice) return
    const t = setTimeout(() => setNotice(null), 8000)
    return () => clearTimeout(t)
  }, [notice, setNotice])

  const showOverlay = !!token && sync !== 'ok'

  function doLogout() {
    logout()
    navigate('/login', { replace: true })
  }

  let title = 'Menghubungkan kembali...'
  let body = 'Mencoba tersambung ke server. Jangan tutup halaman ini.'
  let actions = null
  let spinning = true

  if (sync === 'resuming') {
    title = 'Memulihkan permainan...'
    body = 'Terhubung. Mengambil kondisi terakhir dari server.'
  } else if (sync === 'failed') {
    spinning = false
    title = 'Gagal terhubung'
    body = syncMessage || 'Tidak bisa terhubung ke server.'
    actions = (
      <>
        <button style={{ ...btn, background:C.accent, color:'#fff' }} onClick={retryConnection}>Coba lagi</button>
        <button style={{ ...btn, background:'#0f3460', color:C.text, border:`1px solid ${C.border}` }} onClick={() => window.location.reload()}>Muat ulang halaman</button>
      </>
    )
  } else if (sync === 'auth_failed') {
    spinning = false
    title = 'Sesi login berakhir'
    body = syncMessage || 'Silakan login ulang.'
    actions = <button style={{ ...btn, background:C.accent, color:'#fff' }} onClick={doLogout}>Login ulang</button>
  } else if (sync === 'replaced') {
    spinning = false
    title = 'Dipakai di tab lain'
    body = syncMessage || 'Akun ini sedang dipakai di tab atau perangkat lain.'
    actions = <button style={{ ...btn, background:C.accent, color:'#fff' }} onClick={requestResume}>Pakai di tab ini</button>
  }

  return (
    <>
      {notice && (
        <div role="status" style={{
          position:'fixed', top:12, left:'50%', transform:'translateX(-50%)', zIndex:3000,
          maxWidth:'92vw', background:C.surface, color:C.text, fontSize:13,
          padding:'10px 14px', borderRadius:10, border:`1px solid ${C.yellow}`,
          display:'flex', gap:12, alignItems:'center',
        }}>
          <span>{notice}</span>
          <span style={{ cursor:'pointer', color:C.muted }} onClick={() => setNotice(null)}>✕</span>
        </div>
      )}

      {showOverlay && (
        <div role="alertdialog" aria-live="assertive" style={{
          position:'fixed', inset:0, zIndex:2000, background:'rgba(10,10,25,0.94)',
          display:'flex', alignItems:'center', justifyContent:'center', padding:24,
        }}>
          <style>{'@keyframes martil-spin { to { transform: rotate(360deg) } }'}</style>
          <div style={{ maxWidth:340, textAlign:'center', color:C.text }}>
            {spinning ? (
              <div style={{
                width:36, height:36, margin:'0 auto 18px', borderRadius:'50%',
                border:`3px solid ${C.border}`, borderTopColor:C.accent,
                animation:'martil-spin 0.9s linear infinite',
              }} />
            ) : (
              <div style={{ fontSize:32, marginBottom:12 }}>🃏</div>
            )}
            <div style={{ fontSize:18, fontWeight:700, marginBottom:8 }}>{title}</div>
            <div style={{ fontSize:13, color:C.muted, lineHeight:1.5, marginBottom: actions ? 18 : 0 }}>{body}</div>
            {actions && <div style={{ display:'flex', gap:10, justifyContent:'center', flexWrap:'wrap' }}>{actions}</div>}
          </div>
        </div>
      )}
    </>
  )
}
