// Player names in the UI. Runs standalone with plain Node (no bash, no env vars):
//   node tests/player-names/run.mjs        or        npm run test:names     (from the frontend folder)
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { playerName, shortId, SHORT_ID_LENGTH, getProfile } from '../../src/utils/profile.js'
import { toastMsg } from '../../src/utils/gameToast.js'

const SRC = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../src')
let pass = 0, fail = 0
const t = (name, fn) => { try { fn(); pass++; console.log('  PASS ', name) } catch (e) { fail++; console.log('  FAIL ', name, '\n        ', e.message) } }

const ID = 'a1b2c3d4-0000-4000-8000-123456789abc'
const profiles = { [ID]: { username: 'Sari_Dewi' }, other: { username: 'Budi' } }

t('shortId: satu panjang untuk seluruh UI (8), id pendek tetap utuh, null/undefined aman', () => {
  assert.equal(SHORT_ID_LENGTH, 8)
  assert.equal(shortId(ID), 'a1b2c3d4'); assert.equal(shortId('ab'), 'ab')
  assert.equal(shortId(undefined), ''); assert.equal(shortId(null), '')
})

t('playerName: nama dari profil server menang atas akun dan atas id', () => {
  assert.equal(playerName(ID, { profiles }), 'Sari_Dewi')
  assert.equal(playerName(ID, { profiles, account: { username: 'Lain' } }), 'Sari_Dewi')
})

t('playerName: tanpa profil dipakai username akun, lalu id singkat', () => {
  assert.equal(playerName(ID, { account: { username: 'Syamil' } }), 'Syamil')
  assert.equal(playerName(ID), 'a1b2c3d4')
  assert.equal(playerName(ID, { profiles: {} }), 'a1b2c3d4')
  assert.equal(playerName(ID, {}), 'a1b2c3d4')
})

t('playerName: username kosong / bukan string diabaikan, jatuh ke sumber berikutnya', () => {
  for (const bad of ['', null, undefined, 42, {}, []]) {
    assert.equal(playerName(ID, { profiles: { [ID]: { username: bad } }, account: { username: 'Akun' } }), 'Akun', JSON.stringify(bad))
    assert.equal(playerName(ID, { profiles: { [ID]: { username: bad } } }), 'a1b2c3d4', JSON.stringify(bad))
  }
  assert.equal(playerName(ID, { profiles: { [ID]: null } }), 'a1b2c3d4')
})

t('playerName: id yang menyerupai properti bawaan Object tidak mengacaukan hasil', () => {
  for (const id of ['__proto__', 'constructor', 'toString', 'hasOwnProperty']) assert.equal(playerName(id, { profiles: {} }), shortId(id))
})

t('playerName: nama dicari menurut ID, bukan menurut nama (dua pemain bernama sama tetap berbeda ID)', () => {
  const twins = { id1: { username: 'Kembar' }, id2: { username: 'Kembar' } }
  assert.equal(playerName('id1', { profiles: twins }), 'Kembar'); assert.equal(playerName('id2', { profiles: twins }), 'Kembar')
  assert.equal(playerName('Kembar', { profiles: twins }), 'Kembar'.slice(0, 8))   // "Kembar" sebagai id tidak ditemukan → id singkat
})

t('getProfile: nama mengikuti playerName; perilaku 2 argumen lama tetap; level/koin/warna tidak bergantung pada nama', () => {
  assert.equal(getProfile('abc12345xyz').name, 'abc12345')
  assert.equal(getProfile('abc12345xyz', { username: 'Syamil' }).name, 'Syamil')
  assert.equal(getProfile(ID, undefined, profiles).name, 'Sari_Dewi')
  const a = getProfile(ID, undefined, profiles), b = getProfile(ID)
  assert.deepEqual({ ...a, name: '' }, { ...b, name: '' })
})

t('toastMsg: memakai nama pemain, bukan potongan id; "kamu" tetap untuk diri sendiri', () => {
  const nameOf = (id) => playerName(id, { profiles })
  assert.equal(toastMsg({ type: 'game_over', winnerId: ID }, 'me', nameOf), '🏆 Sari_Dewi menang')
  assert.equal(toastMsg({ type: 'game_over', winnerId: 'me' }, 'me', nameOf), '🎉 Kamu menang game ini!')
  assert.equal(toastMsg({ type: 'auto_skipped', playerId: ID }, 'me', nameOf), '⏰ Auto skip (Sari_Dewi)')
  assert.equal(toastMsg({ type: 'auto_skipped', playerId: 'me' }, 'me', nameOf), '⏰ Waktu habis — auto skip')
  assert.equal(toastMsg({ type: 'player_disconnected', playerId: ID }, 'me', nameOf), '📡 Sari_Dewi terputus')
  assert.equal(toastMsg({ type: 'player_reconnected', playerId: ID }, 'me', nameOf), '✅ Sari_Dewi kembali')
})

t('toastMsg: pemain tanpa profil → id singkat 8 karakter (bukan 6)', () => {
  const nameOf = (id) => playerName(id, {})
  assert.equal(toastMsg({ type: 'player_disconnected', playerId: ID }, 'me', nameOf), '📡 a1b2c3d4 terputus')
  assert.equal(toastMsg({ type: 'game_over', winnerId: ID }, 'me', nameOf), '🏆 a1b2c3d4 menang')
})

t('toastMsg: rally_ended punya pesan; event lain tidak punya toast', () => {
  assert.match(toastMsg({ type: 'rally_ended' }, 'me', () => ''), /Rally selesai/)
  for (const type of ['cards_played', 'player_skipped', 'turn_changed', 'set_over', 'xyz']) assert.equal(toastMsg({ type }, 'me', () => ''), null, type)
})

// Guard against regressions: nobody may cut an id by hand again; every page must go through playerName.
const readSrc = (rel) => fs.readFileSync(path.join(SRC, rel), 'utf8')
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)])

t('tidak ada pemotongan id manual di src (hanya profile.js yang boleh memotong id)', () => {
  const offenders = []
  for (const f of walk(SRC).filter(f => /\.(jsx?|mjs)$/.test(f))) {
    if (f.endsWith(path.join('utils', 'profile.js'))) continue
    const code = stripComments(fs.readFileSync(f, 'utf8'))
    if (/\b\w*[iI]d\??\.slice\(\s*0\s*,\s*\d+\s*\)/.test(code) || /\)\.slice\(\s*0\s*,\s*\d+\s*\)/.test(code)) offenders.push(path.relative(SRC, f))
  }
  assert.deepEqual(offenders, [], `memotong id secara manual: ${offenders.join(', ')}`)
})

t('Lobby, Game, dan Result memakai playerName; GamePage tidak punya salinan toastMsg sendiri', () => {
  for (const f of ['pages/LobbyPage.jsx', 'pages/GamePage.jsx', 'pages/ResultPage.jsx']) assert.match(readSrc(f), /playerName\(/, `${f} tidak memakai playerName`)
  assert.doesNotMatch(readSrc('pages/GamePage.jsx'), /function toastMsg/)
  assert.match(readSrc('pages/GamePage.jsx'), /from '..\/utils\/gameToast'/)
})

console.log(`\n${pass}/${pass + fail} lulus`); process.exit(fail ? 1 : 0)
