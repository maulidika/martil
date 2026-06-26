import React, { useState } from 'react'
import { useGameStore } from '../store/gameStore'

const s = {
  wrap:   { minHeight:'100dvh', display:'flex', alignItems:'center', justifyContent:'center', padding:16, background:'#1a1a2e' },
  box:    { width:'100%', maxWidth:360, background:'#16213e', borderRadius:16, padding:'2rem 1.5rem', boxShadow:'0 8px 32px rgba(0,0,0,0.4)' },
  logo:   { textAlign:'center', fontSize:32, fontWeight:700, letterSpacing:2, color:'#e94560', marginBottom:8 },
  sub:    { textAlign:'center', fontSize:13, color:'#888', marginBottom:28 },
  label:  { fontSize:12, color:'#aaa', marginBottom:6, display:'block' },
  input:  { width:'100%', padding:'10px 14px', background:'#0f3460', border:'1px solid #1a4a7a', borderRadius:8, color:'#eee', fontSize:15, outline:'none', marginBottom:14 },
  btn:    { width:'100%', padding:'12px', borderRadius:8, fontSize:16, fontWeight:600, border:'none', cursor:'pointer', marginTop:4 },
  err:    { background:'rgba(233,69,96,0.15)', border:'1px solid #e94560', color:'#e94560', borderRadius:8, padding:'8px 12px', fontSize:13, marginBottom:14 },
  toggle: { textAlign:'center', marginTop:16, fontSize:13, color:'#888', cursor:'pointer' },
  span:   { color:'#e94560', fontWeight:500 },
}

export default function LoginPage() {
  const [mode, setMode]       = useState('login')   // 'login' | 'register'
  const [username, setUser]   = useState('')
  const [password, setPass]   = useState('')
  const [error, setError]     = useState('')
  const [loading, setLoading] = useState(false)
  const setAuth = useGameStore(s => s.setAuth)

  async function submit(e) {
    e.preventDefault()
    setError('')
    if (!username.trim() || !password) return setError('Isi username dan password.')
    setLoading(true)
    try {
      const res  = await fetch(`/api/auth/${mode}`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ username: username.trim(), password }),
      })
      const data = await res.json()
      if (!res.ok) {
        const msgs = {
          USERNAME_TAKEN: 'Username sudah dipakai.',
          INVALID_CREDENTIALS: 'Username atau password salah.',
          USERNAME_3_TO_30_CHARS: 'Username 3–30 karakter.',
          PASSWORD_MIN_6_CHARS: 'Password minimal 6 karakter.',
          USERNAME_ALPHANUMERIC_ONLY: 'Username hanya huruf, angka, dan underscore.',
        }
        setError(msgs[data.error] || data.error)
      } else {
        setAuth(data.user, data.token)
      }
    } catch {
      setError('Tidak bisa terhubung ke server.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={s.wrap}>
      <div style={s.box}>
        <div style={s.logo}>🃏 MARTIL</div>
        <div style={s.sub}>{mode === 'login' ? 'Masuk ke akun kamu' : 'Buat akun baru'}</div>

        {error && <div style={s.err}>{error}</div>}

        <form onSubmit={submit}>
          <label style={s.label}>Username</label>
          <input
            style={s.input}
            value={username}
            onChange={e => setUser(e.target.value)}
            placeholder="contoh: budi123"
            autoComplete="username"
            autoFocus
          />
          <label style={s.label}>Password</label>
          <input
            style={s.input}
            type="password"
            value={password}
            onChange={e => setPass(e.target.value)}
            placeholder="minimal 6 karakter"
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
          />
          <button
            type="submit"
            style={{ ...s.btn, background: loading ? '#555' : '#e94560', color:'#fff', opacity: loading ? 0.7 : 1 }}
            disabled={loading}
          >
            {loading ? 'Memproses…' : mode === 'login' ? 'Masuk' : 'Daftar'}
          </button>
        </form>

        <div style={s.toggle} onClick={() => { setMode(m => m === 'login' ? 'register' : 'login'); setError('') }}>
          {mode === 'login'
            ? <>Belum punya akun? <span style={s.span}>Daftar sekarang</span></>
            : <>Sudah punya akun? <span style={s.span}>Masuk</span></>
          }
        </div>
      </div>
    </div>
  )
}
