import assert from 'node:assert/strict'
import { canShowKick, kickConfirmText, backToRoomDecision, RESTRICTED_MODAL, messageForKickError } from './utils/kick.mjs'

let pass = 0, fail = 0
const t = (name, fn) => { try { fn(); pass++; console.log('  PASS ', name) } catch (e) { fail++; console.log('  FAIL ', name, '\n        ', e.message) } }

const players = ['host', 'a', 'b', 'c'].map(id => ({ id }))
const base = { myId: 'host', hostId: 'host', players, status: 'waiting' }

t('tombol Kick: hanya Host, hanya ke pemain lain yang masih ada di room', () => {
  assert.equal(canShowKick({ ...base, targetId: 'a' }), true)
  assert.equal(canShowKick({ ...base, targetId: 'host' }), false)                       // tidak ke diri sendiri
  assert.equal(canShowKick({ ...base, targetId: 'ghost' }), false)                      // sudah tidak di room
  assert.equal(canShowKick({ ...base, myId: 'a', targetId: 'b' }), false)               // bukan Host
  assert.equal(canShowKick({ ...base, myId: undefined, targetId: 'a' }), false)
})
t('tombol Kick tersedia di Room dan Result, tidak saat game berlangsung', () => {
  assert.equal(canShowKick({ ...base, status: 'done', targetId: 'a' }), true)
  assert.equal(canShowKick({ ...base, status: 'waiting', targetId: 'a' }), true)
  assert.equal(canShowKick({ ...base, status: 'playing', targetId: 'a' }), false)
})
t('Back to Room: pemain yang di-Kick → modal (tanpa emit), walau offline atau tanpa kode room', () => {
  const ok = { busy: null, restricted: false, code: 'ABC123', connected: true }
  assert.equal(backToRoomDecision(ok), 'emit')
  assert.equal(backToRoomDecision({ ...ok, restricted: true }), 'restricted')
  assert.equal(backToRoomDecision({ ...ok, restricted: true, connected: false }), 'restricted')
  assert.equal(backToRoomDecision({ ...ok, restricted: true, code: null }), 'restricted')
  assert.equal(backToRoomDecision({ ...ok, connected: false }), 'offline')
  assert.equal(backToRoomDecision({ ...ok, code: null }), 'no_code')
  assert.equal(backToRoomDecision({ ...ok, busy: 'menu' }), 'busy')
  assert.equal(backToRoomDecision({ ...ok, busy: 'menu', restricted: true }), 'busy')
})
t('modal pembatasan memakai teks persis sesuai spesifikasi', () => {
  assert.equal(RESTRICTED_MODAL.title, 'Akses Room Dibatasi')
  assert.equal(RESTRICTED_MODAL.message, 'Kamu telah dikeluarkan dari Room oleh Host. Untuk bergabung kembali, silakan kembali ke Homepage terlebih dahulu.')
  assert.equal(RESTRICTED_MODAL.ok, 'OK')
})
t('teks konfirmasi Kick membedakan pemain di Room vs di Result; pesan error ramah', () => {
  assert.match(kickConfirmText('abc12345', false), /bisa bergabung kembali/)
  assert.match(kickConfirmText('abc12345', true), /tidak bisa kembali ke Room sebelum kembali ke Homepage/)
  assert.match(messageForKickError('NOT_HOST'), /Hanya Host/)
  assert.match(messageForKickError('XYZ'), /XYZ/)
})
console.log(`\n${pass}/${pass + fail} lulus`); process.exit(fail ? 1 : 0)
