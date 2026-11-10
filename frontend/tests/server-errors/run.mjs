import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { messageForServerError, SERVER_ERROR_CODES } from '../../src/utils/serverErrors.js'

const BACKEND = process.env.BACKEND_SRC
let pass = 0, fail = 0
const t = (name, fn) => { try { fn(); pass++; console.log('  PASS ', name) } catch (e) { fail++; console.log('  FAIL ', name, '\n        ', e.message) } }

// Error codes the backend can put on the socket `error` channel: every place that produces one.
const FILES = ['rooms/roomManager.js', 'game/engine.js', 'game/cardIds.js', 'socket/socketHandler.js', 'socket/payload.js']
const PATTERNS = [/error: '([A-Z][A-Z_0-9]+)'/g, /err\('([A-Z][A-Z_0-9]+)'\)/g, /return '([A-Z][A-Z_0-9]+)'/g, /emitRejection\([^)]*'([A-Z][A-Z_0-9]+)'\)/g]
const backendCodes = new Set()
for (const f of FILES) {
  const src = fs.readFileSync(path.join(BACKEND, f), 'utf8')
  for (const re of PATTERNS) for (const m of src.matchAll(re)) backendCodes.add(m[1])
}
// Not `error` events: these are `session_none` reasons (shown as a notice, not through this map).
const SESSION_REASONS = new Set(['NO_ROOM', 'EXPIRED', 'KICKED', 'ROOM_CLOSED'])
const userFacing = [...backendCodes].filter(c => !SESSION_REASONS.has(c)).sort()

t('pemindaian backend menemukan kode error (bukan daftar kosong)', () => {
  assert.ok(userFacing.length >= 20, `hanya ${userFacing.length} kode ditemukan: pemindaian rusak?`)
  for (const known of ['NOT_YOUR_TURN', 'ROOM_NOT_FOUND', 'INVALID_PAYLOAD', 'GAME_STARTING', 'INVALID_MAX_GAMES']) assert.ok(backendCodes.has(known), known)
})

t('setiap kode error yang bisa dikirim backend punya pesan Indonesia', () => {
  const missing = userFacing.filter(c => !SERVER_ERROR_CODES.includes(c))
  assert.deepEqual(missing, [], `kode tanpa pesan: ${missing.join(', ')}`)
})

t('tidak ada pesan untuk kode yang sudah tidak ada di backend (peta tidak basi)', () => {
  const stale = SERVER_ERROR_CODES.filter(c => !backendCodes.has(c))
  assert.deepEqual(stale, [], `kode basi: ${stale.join(', ')}`)
})

t('setiap pesan: string tidak kosong, diakhiri titik, dan tidak membocorkan kode mentah', () => {
  for (const code of SERVER_ERROR_CODES) {
    const msg = messageForServerError(code)
    assert.equal(typeof msg, 'string'); assert.ok(msg.length >= 8, code)
    assert.ok(msg.endsWith('.'), `${code}: pesan harus diakhiri titik`)
    assert.ok(!msg.includes(code), `${code}: pesan tidak boleh memuat kode mentah`)
  }
})

t('pesan berbeda untuk kode berbeda (tidak ada salin-tempel)', () => {
  const msgs = SERVER_ERROR_CODES.map(messageForServerError)
  assert.equal(new Set(msgs).size, msgs.length)
})

t('kode tidak dikenal: pesan cadangan memuat kodenya; kosong/bukan string: pesan umum', () => {
  assert.equal(messageForServerError('SOMETHING_NEW'), 'Terjadi kesalahan (SOMETHING_NEW).')
  for (const v of [undefined, null, '', 0]) assert.equal(messageForServerError(v), 'Terjadi kesalahan.')
})

t('nama properti bawaan Object tidak dianggap kode (toString, constructor, __proto__)', () => {
  for (const k of ['toString', 'constructor', '__proto__', 'hasOwnProperty']) assert.equal(messageForServerError(k), `Terjadi kesalahan (${k}).`, k)
})

t('pesan INVALID_MAX_GAMES menyebut persis nilai yang diizinkan server', () => {
  const rm = fs.readFileSync(path.join(BACKEND, 'rooms/roomManager.js'), 'utf8')
  const allowed = rm.match(/ALLOWED_MAX_GAMES = Object\.freeze\(\[([^\]]+)\]\)/)[1].split(',').map(s => s.trim())
  const msg = messageForServerError('INVALID_MAX_GAMES')
  for (const n of allowed) assert.ok(msg.includes(n), `pesan tidak menyebut ${n}`)
  assert.ok(!/\b6\b/.test(msg))
})

console.log(`\n${pass}/${pass + fail} lulus`); process.exit(fail ? 1 : 0)
