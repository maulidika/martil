import assert from 'node:assert/strict'
import fs from 'node:fs'
// ── lingkungan browser palsu ──
const ss = new Map([['martil_token', JSON.stringify('tok')], ['martil_user', JSON.stringify({ id: 'u1' })]])
globalThis.sessionStorage = { getItem: k => ss.get(k) ?? null, setItem: (k, v) => ss.set(k, v), removeItem: k => ss.delete(k) }
globalThis.window = { location: { pathname: '/game' } }
// ── jam palsu ──
let now = 0, q = [], idc = 0
globalThis.setTimeout = (fn, ms) => { const id = ++idc; q.push({ id, at: now + ms, fn }); return id }
globalThis.clearTimeout = (id) => { q = q.filter(t => t.id !== id) }
const tick = (ms) => { const end = now + ms; for (;;) { q.sort((a, b) => a.at - b.at); const n = q[0]; if (!n || n.at > end) break; q.shift(); now = n.at; n.fn() } now = end }
console.info = () => {}

const { sockets } = await import('./stubs/sio.mjs')
const { navCalls } = await import('./stubs/router.mjs')
const { reactState } = await import('./stubs/react.mjs')
const { useGameStore: store } = await import('./store/gameStore.mjs')
const { useSocket, requestResume, retryConnection } = await import('./hooks/useSocket.mjs')

let pass = 0, fail = 0
const t = (name, fn) => { try { fn(); pass++; console.log('  PASS ', name) } catch (e) { fail++; console.log('  FAIL ', name, '\n        ', e.message) } }
const st = () => store.getState()
const restoredPayload = { code: 'ABC123', status: 'playing', hostId: 'u1', players: [], game: { currentTurn: 'u2', myHand: [{ id: '3D' }], timeLeft: 21000 }, setResult: null }

// S1: boot dengan token (refresh)
useSocket()
const s1 = sockets[0]
t('boot dengan token: status awal "connecting" dan opsi socket aman', () => {
  assert.equal(st().sync, 'connecting')
  assert.equal(s1.opts.forceNew, true); assert.equal(s1.opts.reconnectionAttempts, Infinity)
})
t('connect → "resuming" dan resume_session dikirim sekali', () => {
  s1.open()
  assert.equal(st().sync, 'resuming'); assert.equal(st().connected, true)
  assert.deepEqual(s1.sent.filter(([e]) => e === 'resume_session').length, 1)
})
t('session_restored → state diganti penuh, sync ok, navigasi ke /game', () => {
  st().toggleCard('X')                                  // sisa pilihan lama
  s1.fire('session_restored', restoredPayload)
  assert.equal(st().sync, 'ok'); assert.equal(st().roomCode, 'ABC123')
  assert.equal(st().currentTurn, 'u2'); assert.deepEqual(st().selectedIds, [])
  assert.equal(st().gameState.timeLeft, 21000)
  assert.deepEqual(navCalls.at(-1), ['/game', { replace: true }])
})
t('listener tidak ganda: tiap event penting terdaftar tepat sekali', () => {
  for (const ev of ['connect', 'disconnect', 'session_restored', 'session_none', 'session_replaced', 'game_state', 'turn_changed'])
    assert.equal(s1.listeners[ev].length, 1, ev)
})

// S2: koneksi putus lalu pulih
t('disconnect (transport close) → "reconnecting"; reconnect → resume lagi (tanpa listener baru)', () => {
  s1.drop('transport close')
  assert.equal(st().sync, 'reconnecting'); assert.equal(st().connected, false)
  s1.open()
  assert.equal(st().sync, 'resuming')
  assert.equal(s1.sent.filter(([e]) => e === 'resume_session').length, 2)
  assert.equal(s1.listeners['session_restored'].length, 1)
  s1.fire('session_restored', { ...restoredPayload, game: { ...restoredPayload.game, currentTurn: 'u3' } })
  assert.equal(st().sync, 'ok'); assert.equal(st().currentTurn, 'u3')
})
t('putus > 20 dtk → "failed" dengan pesan jelas; tersambung lagi → pulih otomatis', () => {
  s1.drop('ping timeout'); tick(19_000); assert.equal(st().sync, 'reconnecting')
  tick(2_000); assert.equal(st().sync, 'failed'); assert.match(st().syncMessage, /Tidak bisa terhubung/)
  s1.open(); assert.equal(st().sync, 'resuming')
  s1.fire('session_restored', restoredPayload); assert.equal(st().sync, 'ok')
})
t('server tidak menjawab resume > 8 dtk → "failed"; requestResume() mencoba lagi', () => {
  s1.drop('transport close'); s1.open(); tick(9_000)
  assert.equal(st().sync, 'failed'); assert.match(st().syncMessage, /tidak merespons/)
  const before = s1.sent.length
  assert.equal(requestResume(), true); assert.equal(st().sync, 'resuming'); assert.equal(s1.sent.length, before + 1)
  s1.fire('session_restored', restoredPayload); assert.equal(st().sync, 'ok')
})
t('retryConnection saat terputus memanggil socket.connect()', () => {
  s1.drop('transport close'); const c = s1.connectCalls; retryConnection()
  assert.equal(s1.connectCalls, c + 1)
  s1.open(); s1.fire('session_restored', restoredPayload)
})
t('disconnect oleh server ("io server disconnect") → connect() manual', () => {
  const c = s1.connectCalls; s1.drop('io server disconnect'); assert.equal(s1.connectCalls, c + 1)
  s1.open(); s1.fire('session_restored', restoredPayload)
})

// S3: sesi tidak bisa dipulihkan
t('session_none EXPIRED saat di /game → room dibersihkan, notice, kembali ke /lobby', () => {
  s1.drop('transport close'); s1.open()
  s1.fire('session_none', { reason: 'EXPIRED' })
  assert.equal(st().roomCode, null); assert.equal(st().gameState, null)
  assert.match(st().notice, /dikeluarkan/); assert.equal(st().sync, 'ok')
  assert.deepEqual(navCalls.at(-1), ['/lobby', { replace: true }])
})
t('session_none NO_ROOM saat login normal (tanpa room) → diam, tanpa notice', () => {
  st().setNotice(null); navCalls.length = 0; window.location.pathname = '/lobby'
  s1.fire('session_none', { reason: 'NO_ROOM' })
  assert.equal(st().notice, null); assert.equal(navCalls.length, 0); assert.equal(st().sync, 'ok')
})

// S4: akun dipakai tab lain & token invalid
t('session_replaced → "replaced"; requestResume mengambil alih', () => {
  s1.fire('session_replaced'); assert.equal(st().sync, 'replaced')
  requestResume(); assert.equal(st().sync, 'resuming'); s1.fire('session_restored', restoredPayload); assert.equal(st().sync, 'ok')
})
t('connect_error INVALID_TOKEN → "auth_failed" (tidak mencoba terus)', () => {
  s1.fire('connect_error', new Error('INVALID_TOKEN')); assert.equal(st().sync, 'auth_failed')
  clearAfter()
})
function clearAfter() { s1.open(); s1.fire('session_restored', restoredPayload) }
t('connect_error transport saat "ok" → "reconnecting" (overlay muncul)', () => {
  s1.fire('connect_error', new Error('xhr poll error')); assert.equal(st().sync, 'reconnecting'); clearAfter()
})

// S5: cleanup & login ulang tidak menumpuk listener
let s2
t('cleanup melepas listener & socket; hook dijalankan lagi → socket baru, listener tepat satu', () => {
  reactState.cleanup()
  assert.equal(s1.disconnected, true); assert.equal(Object.keys(s1.listeners).length, 0); assert.equal(st().connected, false)
  st().logout(); assert.equal(st().sync, 'ok')
  st().setAuth({ id: 'u9' }, 'tok2')
  useSocket(); s2 = sockets.at(-1)
  assert.notEqual(s2, s1)
  for (const ev of ['connect', 'session_restored', 'turn_changed']) assert.equal(s2.listeners[ev].length, 1)
  // login baru: diam-diam (tanpa overlay), resume tetap dikirim
  s2.open(); assert.equal(st().sync, 'ok'); assert.equal(s2.sent.filter(([e]) => e === 'resume_session').length, 1)
})

// S6: navigasi Scoreboard / Room
const roomState = { code: 'ABC123', status: 'waiting', hostId: 'u9', players: [{ id: 'u9', connected: true, inRoom: true }], game: null, setScores: {}, gameHistory: [] }
t('set_over menyimpan riwayat beku di setResult', () => {
  const data = { rankings: [{ id: 'u9', totalScore: -5 }], setScores: { u9: -5 }, gameHistory: [{ gameNumber: 1 }, { gameNumber: 2 }, { gameNumber: 3 }, { gameNumber: 4 }] }
  s2.fire('set_over', data)
  assert.equal(st().setResult.gameHistory.length, 4)
})
t('room_returned: sisa state set/game dibuang, room dipertahankan, pindah ke /lobby; redirect 2 dtk ke /result dibatalkan', () => {
  st().setGameState({ currentTurn: 'u1', myHand: [] }); st().pushEvent({ type: 'game_over' })
  navCalls.length = 0
  s2.fire('room_returned', roomState)
  assert.equal(st().setResult, null); assert.equal(st().gameState, null); assert.equal(st().currentTurn, null)
  assert.deepEqual(st().events, []); assert.equal(st().roomCode, 'ABC123'); assert.equal(st().roomInfo.status, 'waiting')
  assert.deepEqual(navCalls.at(-1), ['/lobby', { replace: true }])
  tick(2_500)                                           // timer set_over lama jangan menyeret ke /result
  assert.equal(navCalls.filter(c => c[0] === '/result').length, 0)
})
t('session_restored view "result" saat room sudah waiting → Scoreboard dipulihkan; view "room" → Room', () => {
  const sr = { setResult: { rankings: [], setScores: {}, gameHistory: [{}] } }
  s2.fire('session_restored', { ...roomState, ...sr, view: 'result' })
  assert.deepEqual(navCalls.at(-1), ['/result', { replace: true }]); assert.equal(st().setResult.gameHistory.length, 1)
  s2.fire('session_restored', { ...roomState, ...sr, view: 'room' })
  assert.deepEqual(navCalls.at(-1), ['/lobby', { replace: true }]); assert.equal(st().setResult, null)
  s2.fire('session_restored', { ...roomState, status: 'playing', game: { currentTurn: 'u9' }, view: 'game' })
  assert.deepEqual(navCalls.at(-1), ['/game', { replace: true }])
})
t('room_left (Exit Room / Back to Menu Utama): state room dibersihkan dan kembali ke Menu Utama', () => {
  s2.fire('room_left', { roomCode: 'ABC123', roomDeleted: false })
  assert.equal(st().roomCode, null); assert.equal(st().roomInfo, null); assert.equal(st().gameState, null)
  assert.deepEqual(navCalls.at(-1), ['/lobby', undefined])
})
t('return_room_error / leave_room_error muncul sebagai event agar tombol aktif kembali', () => {
  s2.fire('return_room_error', { code: 'GAME_IN_PROGRESS' })
  assert.equal(st().events[0].type, 'return_room_error'); assert.equal(st().events[0].code, 'GAME_IN_PROGRESS')
  s2.fire('leave_room_error', { code: 'NOT_IN_ROOM' })
  assert.equal(st().events[0].type, 'leave_room_error')
})
const fixture = JSON.parse(fs.readFileSync(new URL('./fixture-restored-waiting.json', import.meta.url)))
t('fixture server asli: view result → /result, setResult terisi, bukan /lobby', () => {
  s2.fire('session_restored', fixture)
  assert.equal(fixture.status, 'waiting'); assert.equal(fixture.view, 'result')
  assert.deepEqual(navCalls.at(-1), ['/result', { replace: true }])
  assert.equal(st().setResult.gameHistory.length, 4)
  assert.equal(st().roomInfo.players.filter(p => p.inRoom === false).length, 3)
})

// ── Host Kick (klien): event server → state/navigasi ────────────────────────────
const resultState = { code: 'ABC123', status: 'done', hostId: 'u2', players: [{ id: 'u1', connected: true, inRoom: false }, { id: 'u2', connected: true, inRoom: false }], game: null, view: 'result', setResult: { rankings: [{ id: 'u1', totalScore: 1 }], setScores: {}, gameHistory: [{ gameNumber: 1, scores: [] }] } }
t('Kick di Room: event "kicked" membersihkan state room, menampilkan pesan, kembali ke Menu Utama; tidak membatasi', () => {
  s2.fire('session_restored', { ...resultState, status: 'waiting', view: 'room', setResult: null })
  s2.fire('kicked', { roomCode: 'ABC123' })
  assert.equal(st().roomCode, null); assert.equal(st().roomInfo, null); assert.equal(st().restricted, false)
  assert.match(st().notice, /dikeluarkan dari room oleh Host/)
  assert.deepEqual(navCalls.at(-1), ['/lobby', { replace: true }])
  st().setNotice(null)
})
t('Kick di Result: hanya menandai pembatasan; tetap di Result, hasil tetap ada, TANPA notifikasi/modal/error/navigasi otomatis', () => {
  s2.fire('session_restored', resultState)
  const navBefore = navCalls.length
  s2.fire('kicked_from_result', { roomCode: 'ABC123' })
  assert.equal(st().restricted, true)
  assert.equal(st().restrictedModalOpen, false); assert.equal(st().notice, null); assert.equal(st().error, null)
  assert.equal(navCalls.length, navBefore, 'tidak boleh ada navigasi')
  assert.equal(st().setResult.gameHistory.length, 1); assert.equal(st().roomCode, 'ABC123')
})
t('Back to Room ditolak server (KICKED_FROM_ROOM) → modal terbuka, bukan pesan error; menekan lagi membukanya lagi', () => {
  st().closeRestrictedModal()
  s2.fire('return_room_error', { code: 'KICKED_FROM_ROOM' })
  assert.equal(st().restrictedModalOpen, true); assert.equal(st().error, null); assert.equal(st().restricted, true)
  assert.equal(st().events[0].code, 'KICKED_FROM_ROOM')
  st().closeRestrictedModal(); assert.equal(st().restrictedModalOpen, false)
  s2.fire('return_room_error', { code: 'KICKED_FROM_ROOM' }); assert.equal(st().restrictedModalOpen, true)
  st().closeRestrictedModal()
})
t('error return_to_room lain tetap pesan biasa dan tidak membuka modal', () => {
  s2.fire('return_room_error', { code: 'GAME_IN_PROGRESS' })
  assert.equal(st().restrictedModalOpen, false); assert.match(st().error, /Gagal kembali ke room/)
  st().clearError()
})
t('refresh/reconnect saat dibatasi: session_restored(restricted) → /result, pembatasan tetap, modal TIDAK terbuka otomatis', () => {
  st().openRestrictedModal()
  s2.fire('session_restored', { code: 'ABC123', view: 'result', restricted: true, status: 'done', hostId: null, players: [], game: null, setResult: resultState.setResult })
  assert.deepEqual(navCalls.at(-1), ['/result', { replace: true }])
  assert.equal(st().restricted, true); assert.equal(st().restrictedModalOpen, false)
  assert.equal(st().setResult.gameHistory.length, 1)
})
t('session_restored biasa (tidak dibatasi) mereset pembatasan', () => {
  s2.fire('session_restored', resultState)
  assert.equal(st().restricted, false)
})
t('kembali ke Homepage (room_left) mengakhiri pembatasan dan menutup modal', () => {
  s2.fire('kicked_from_result', {}); st().openRestrictedModal()
  s2.fire('room_left', { roomCode: 'ABC123', roomDeleted: false })
  assert.equal(st().restricted, false); assert.equal(st().restrictedModalOpen, false); assert.equal(st().roomInfo, null)
  assert.deepEqual(navCalls.at(-1), ['/lobby', undefined])
})
t('timeout disconnect: session_none (EXPIRED) mengakhiri pembatasan dan memulangkan ke Menu Utama', () => {
  s2.fire('session_restored', resultState); s2.fire('kicked_from_result', {})
  assert.equal(st().restricted, true)
  window.location.pathname = '/result'                       // pemain sedang di halaman Result
  s2.fire('session_none', { reason: 'EXPIRED' })
  assert.equal(st().restricted, false); assert.equal(st().roomInfo, null); assert.match(st().notice, /terputus terlalu lama/)
  assert.deepEqual(navCalls.at(-1), ['/lobby', { replace: true }])
  window.location.pathname = '/lobby'; st().setNotice(null)
})
t('session_none (KICKED) setelah di-Kick saat offline menampilkan pesan yang jelas', () => {
  s2.fire('session_none', { reason: 'KICKED' })
  assert.match(st().notice, /dikeluarkan dari room oleh Host/)
  st().setNotice(null)
})
t('kick_error → pesan error yang ramah (bukan kode mentah)', () => {
  s2.fire('kick_error', { code: 'NOT_HOST' }); assert.match(st().error, /Hanya Host/)
  s2.fire('kick_error', { code: 'GAME_IN_PROGRESS' }); assert.match(st().error, /pertandingan berlangsung/)
  st().clearError()
})
t('error dari server → pesan Indonesia di store (bukan kode mentah)', () => {
  for (const [code, re] of [['NOT_YOUR_TURN', /^Bukan giliranmu\.$/], ['ROOM_NOT_FOUND', /Kode room tidak ditemukan/], ['ROOM_FULL', /sudah penuh/], ['NEED_4_PLAYERS', /tepat 4 pemain/], ['GAME_STARTING', /belum dimulai/], ['ALREADY_IN_OTHER_ROOM', /room lain/]]) {
    s2.fire('error', { code })
    assert.match(st().error, re, code); assert.ok(!st().error.includes(code), `${code} bocor ke pesan`)
    st().clearError()
  }
})
t('error dengan kode baru/tidak dikenal tetap tampil (pesan cadangan memuat kodenya)', () => {
  s2.fire('error', { code: 'BRAND_NEW_CODE' }); assert.equal(st().error, 'Terjadi kesalahan (BRAND_NEW_CODE).')
  st().clearError()
})
t('error server menghilang sendiri setelah 3 detik (perilaku lama tetap)', () => {
  s2.fire('error', { code: 'NOT_YOUR_TURN' }); assert.ok(st().error)
  tick(3100); assert.equal(st().error, null)
})
t('leave_room_error dan return_room_error: prefix lama + alasan yang ramah', () => {
  s2.fire('leave_room_error', { code: 'GAME_IN_PROGRESS' })
  assert.equal(st().error, 'Gagal keluar dari room: Tidak bisa dilakukan saat pertandingan berlangsung.')
  s2.fire('return_room_error', { code: 'NOT_IN_ROOM' })
  assert.equal(st().error, 'Gagal kembali ke room: Kamu tidak berada di room ini.')
  st().clearError()
})
t('logout membersihkan pembatasan; listener Kick tidak ganda', () => {
  st().setRestricted(true); st().openRestrictedModal(); st().logout()
  assert.equal(st().restricted, false); assert.equal(st().restrictedModalOpen, false)
  for (const ev of ['kicked', 'kicked_from_result', 'kick_error', 'return_room_error']) assert.equal(s2.listeners[ev].length, 1, ev)
})
console.log(`\n${pass}/${pass + fail} lulus`); process.exit(fail ? 1 : 0)
