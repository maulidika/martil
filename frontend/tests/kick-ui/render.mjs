// Render statis ResultPage.jsx dan LobbyPage.jsx ASLI (react-dom/server). Dilewati bila react/typescript tidak ada.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import { pathToFileURL, fileURLToPath } from 'node:url'
import { execSync } from 'node:child_process'

const here = path.dirname(fileURLToPath(import.meta.url))
const SRC = path.join(here, '../../src')
const roots = [...(process.env.NODE_PATH || '').split(path.delimiter).filter(Boolean)]
try { roots.push(execSync('npm root -g', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim()) } catch {}
const req = createRequire(import.meta.url)
const find = (name) => { try { return req.resolve(name, { paths: [path.join(here, '../..'), ...roots] }) } catch { return null } }
const reactPath = find('react'), serverPath = find('react-dom/server'), tsPath = find('typescript')
if (!reactPath || !serverPath || !tsPath) { console.log('  SKIP   render Result/Lobby: react / react-dom / typescript tidak ditemukan di mesin ini'); process.exit(0) }
const ts = req(tsPath), { renderToString } = req(serverPath), React = req(reactPath)

const ss = new Map(); const fake = { getItem: k => ss.get(k) ?? null, setItem: (k, v) => ss.set(k, v), removeItem: k => ss.delete(k) }
globalThis.sessionStorage = fake; globalThis.localStorage = fake
globalThis.window = { innerWidth: 1000, addEventListener() {}, removeEventListener() {}, location: { pathname: '/result' } }
globalThis.document = { activeElement: null }
const origErr = console.error; console.error = (...a) => { if (!/useLayoutEffect does nothing/.test(String(a[0]))) origErr(...a) }

const OUT = fs.mkdtempSync(path.join(os.tmpdir(), 'martil-kick-'))
for (const d of ['pages', 'utils', 'store', 'stubs', 'components']) fs.mkdirSync(path.join(OUT, d))
fs.writeFileSync(path.join(OUT, 'stubs/zustand.mjs'), `
export function create(init) {
  let state; const set = (p) => { state = { ...state, ...(typeof p === 'function' ? p(state) : p) } }; const get = () => state
  state = init(set, get); const useStore = () => state; useStore.getState = get; useStore.setState = set; return useStore
}`)
fs.writeFileSync(path.join(OUT, 'stubs/router.mjs'), `export const useNavigate = () => () => {}`)
fs.writeFileSync(path.join(OUT, 'stubs/socket.mjs'), `export const emitSocket = () => true`)
const map = (prefix) => (spec) => ({
  react: pathToFileURL(reactPath).href, 'react-router-dom': `${prefix}stubs/router.mjs`, zustand: `${prefix}stubs/zustand.mjs`,
  '../hooks/useSocket': `${prefix}stubs/socket.mjs`,
}[spec] ?? ((spec.startsWith('../utils/') || spec.startsWith('../components/') || spec.startsWith('../store/')) ? spec + '.mjs' : spec))
const build = (rel, dest) => {
  let code = ts.transpileModule(fs.readFileSync(path.join(SRC, rel), 'utf8'), { compilerOptions: { jsx: ts.JsxEmit.React, module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText
  code = code.replace(/from '([^']+)'/g, (m, spec) => `from '${map('../')(spec)}'`).replace(/import\.meta\.env\.\w+/g, 'undefined')
  fs.writeFileSync(path.join(OUT, dest), code)
}
for (const f of ['store/gameStore.js', 'utils/kick.js', 'components/Modal.jsx', 'pages/ResultPage.jsx', 'pages/LobbyPage.jsx']) build(f, f.replace(/\.jsx?$/, '.mjs'))
const url = (f) => pathToFileURL(path.join(OUT, f)).href
const { useGameStore: store } = await import(url('store/gameStore.mjs'))
const ResultPage = (await import(url('pages/ResultPage.mjs'))).default
const LobbyPage  = (await import(url('pages/LobbyPage.mjs'))).default

let pass = 0, fail = 0
const t = (name, fn) => { try { fn(); pass++; console.log('  PASS ', name) } catch (e) { fail++; console.log('  FAIL ', name, '\n        ', e.message) } }

const IDS = ['me00000000', 'p200000000', 'p300000000', 'p400000000']
const result = {
  rankings: IDS.map((id, i) => ({ id, totalScore: 10 - i })), setScores: {},
  gameHistory: [1, 2, 3, 4, 5, 6].map(n => ({ gameNumber: n, winnerId: IDS[n % 4], scores: IDS.map(id => ({ id, score: n })) })),
}
const state = ({ me = IDS[0], host = IDS[0], members = IDS, restricted = false, modal = false, status = 'done' } = {}) => store.setState({
  user: { id: me }, roomCode: 'ABC123', connected: true, error: null, events: [], restricted, restrictedModalOpen: modal, setResult: result,
  roomInfo: { code: 'ABC123', hostId: host, status, maxGames: 6, players: members.map(id => ({ id, connected: true, inRoom: false })), gameHistory: [] },
})
const renderResult = (o) => { state(o); return renderToString(React.createElement(ResultPage)).replace(/<!-- -->/g, '') }
const renderLobby  = (o) => { state({ status: 'waiting', ...o }); store.setState({ setResult: null, roomInfo: { ...store.getState().roomInfo, players: (o?.members || IDS).map(id => ({ id, connected: true, inRoom: true })) } }); return renderToString(React.createElement(LobbyPage)).replace(/<!-- -->/g, '') }
const count = (html, re) => (html.match(re) || []).length
// Rentang sebuah elemen <div ...> (dari indeks awal tag sampai penutup yang seimbang).
function divRange(html, startIdx) {
  let depth = 0
  for (const m of html.slice(startIdx).matchAll(/<div\b|<\/div>/g)) {
    depth += m[0] === '</div>' ? -1 : 1
    if (depth === 0) return [startIdx, startIdx + m.index + m[0].length]
  }
  throw new Error('div tidak seimbang')
}
const tag = (html, id) => { const i = html.indexOf(`data-testid="${id}"`); assert.ok(i > 0, `${id} tidak ada`); return html.lastIndexOf('<div', i) }

// ── 1. Result Page scrollable ──
t('Result: halaman dibagi area konten yang bisa di-scroll dan area navigasi sticky di luar area scroll', () => {
  const html = renderResult()
  const [s0, s1] = divRange(html, tag(html, 'result-scroll'))
  const nav = tag(html, 'result-nav')
  assert.ok(nav >= s1, 'area navigasi harus saudara (bukan anak) area scroll')
  const scrollStyle = html.slice(s0, html.indexOf('>', s0))
  assert.match(scrollStyle, /overflow-y:\s*auto/); assert.match(scrollStyle, /flex:\s*1/); assert.match(scrollStyle, /min-height:\s*0/)
  assert.match(html.slice(0, 400), /height:\s*100dvh/)                         // tinggi tetap = viewport, bukan min-height yang memanjang
  assert.doesNotMatch(html.slice(0, 400), /min-height:\s*100dvh/)
  const navStyle = html.slice(nav, html.indexOf('>', nav)); assert.match(navStyle, /flex-shrink:\s*0/)
})
t('Result: seluruh konten (4 peringkat + riwayat 6 game) ada di area scroll; kedua tombol navigasi ada di area sticky dan aktif', () => {
  const html = renderResult()
  const [s0, s1] = divRange(html, tag(html, 'result-scroll'))
  const scroll = html.slice(s0, s1)
  for (const id of IDS) assert.ok(scroll.includes(id.slice(0, 8)), `peringkat ${id} tidak ada di area scroll`)
  assert.ok(scroll.includes('Riwayat Game')); assert.equal(count(scroll, /Game \d/g), 6)
  assert.ok(!scroll.includes('Back to Room') && !scroll.includes('Back to Menu Utama'))
  const [n0, n1] = divRange(html, tag(html, 'result-nav')); const nav = html.slice(n0, n1)
  assert.equal(count(nav, /<button/g), 2); assert.ok(nav.includes('Back to Room') && nav.includes('Back to Menu Utama'))
  assert.equal(count(nav, /disabled=""/g), 0)
})
t('Result: ukuran/proporsi konten dipertahankan (maxWidth 400, ukuran tombol 13px/15px)', () => {
  const html = renderResult()
  assert.ok(count(html, /max-width:\s*400px/g) >= 2)
  assert.match(html, /padding:\s*13px[^>]*font-size:\s*15px|font-size:\s*15px[^>]*padding:\s*13px/)
})

// ── 2. Kick di Result ──
t('Result: Host melihat tombol Kick untuk 3 pemain lain (tidak untuk dirinya)', () => {
  const html = renderResult()
  assert.equal(count(html, />Kick</g), 3)
})
t('Result: non-Host tidak melihat tombol Kick', () => {
  assert.equal(count(renderResult({ me: IDS[1], host: IDS[0] }), />Kick</g), 0)
})
t('Result: pemain yang sudah tidak ada di room tidak punya tombol Kick; hasilnya tetap tampil', () => {
  const html = renderResult({ members: [IDS[0], IDS[1], IDS[2]] })
  assert.equal(count(html, />Kick</g), 2); assert.ok(html.includes(IDS[3].slice(0, 8)))
})
t('Result: tidak ada modal secara default maupun otomatis setelah di-Kick (restricted=true, modal tertutup)', () => {
  assert.ok(!renderResult().includes('Akses Room Dibatasi'))
  const html = renderResult({ me: IDS[1], restricted: true })
  assert.ok(!html.includes('Akses Room Dibatasi')); assert.ok(!html.includes('role="dialog"'))
})
t('Result (di-Kick): seluruh hasil tetap tampil dan kedua tombol navigasi tetap aktif', () => {
  const html = renderResult({ me: IDS[1], restricted: true })
  assert.equal(count(html, /Game \d/g), 6)
  const [n0, n1] = divRange(html, tag(html, 'result-nav')); assert.equal(count(html.slice(n0, n1), /disabled=""/g), 0)
})
t('Modal "Akses Room Dibatasi": judul, pesan, satu tombol OK, blocking (overlay fixed menutup layar, role=dialog aria-modal)', () => {
  const html = renderResult({ me: IDS[1], restricted: true, modal: true })
  const m0 = tag(html, 'restricted-modal'); const [a, b] = divRange(html, m0); const modal = html.slice(a, b)
  assert.ok(modal.includes('Akses Room Dibatasi'))
  assert.ok(modal.includes('Kamu telah dikeluarkan dari Room oleh Host. Untuk bergabung kembali, silakan kembali ke Homepage terlebih dahulu.'))
  assert.equal(count(modal, /<button/g), 1); assert.match(modal, /<button[^>]*>OK<\/button>/)
  assert.match(modal, /role="dialog"/); assert.match(modal, /aria-modal="true"/)
  const overlay = modal.slice(0, modal.indexOf('>')); assert.match(overlay, /position:\s*fixed/); assert.match(overlay, /inset:\s*0/)
})
t('Kick TIDAK tampil sebagai modal konfirmasi sebelum host menekan Kick', () => {
  assert.ok(!renderResult().includes('kick-confirm'))
})

// ── 3. Lobby (Room) ──
t('Room: Host melihat Kick untuk 3 pemain lain; non-Host tidak', () => {
  assert.equal(count(renderLobby(), />Kick</g), 3)
  assert.equal(count(renderLobby({ me: IDS[2], host: IDS[0] }), />Kick</g), 0)
})
t('Room: layout non-Host tidak berubah (tanpa Kick, tombol Exit Room dan daftar kursi tetap)', () => {
  const html = renderLobby({ me: IDS[2], host: IDS[0] })
  assert.ok(html.includes('Exit Room') && html.includes('Menunggu host memulai game') && html.includes('4/4 pemain'))
})
t('Lobby: pemain di-Kick dari Result yang tersasar ke Lobby tidak menggambar Room (dipulangkan ke Result)', () => {
  state({ me: IDS[1], host: IDS[0], restricted: true, status: 'waiting' })
  store.setState({ roomInfo: { ...store.getState().roomInfo, players: [IDS[0], IDS[2], IDS[3]].map(id => ({ id, connected: true, inRoom: true })) } })
  const html = renderToString(React.createElement(LobbyPage))
  assert.equal(html, '')
})
console.log(`\n${pass}/${pass + fail} lulus (render)`); process.exit(fail ? 1 : 0)
