// Smoke test render GamePage.jsx ASLI dengan React + react-dom/server (render statis, tanpa DOM/efek).
// Membutuhkan paket react, react-dom, typescript yang bisa di-resolve; bila tidak ada, uji ini DILEWATI (SKIP).
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
if (!reactPath || !serverPath || !tsPath) { console.log('  SKIP   render GamePage: react / react-dom / typescript tidak ditemukan di mesin ini'); process.exit(0) }
const ts = req(tsPath), { renderToString } = req(serverPath), React = req(reactPath)

// ── lingkungan browser palsu ──
const ss = new Map(); const fakeStore = { getItem: k => ss.get(k) ?? null, setItem: (k, v) => ss.set(k, v), removeItem: k => ss.delete(k) }
globalThis.sessionStorage = fakeStore; globalThis.localStorage = fakeStore
const setWidth = (w) => { globalThis.window = { innerWidth: w, addEventListener() {}, removeEventListener() {}, location: { pathname: '/game' } } }
const origErr = console.error; console.error = (...a) => { if (!String(a[0]).includes('useLayoutEffect does nothing on the server')) origErr(...a) }

// ── bangun modul uji: transpile JSX → ESM, arahkan impor ke stub ──
const OUT = fs.mkdtempSync(path.join(os.tmpdir(), 'martil-render-'))
fs.mkdirSync(path.join(OUT, 'pages')); fs.mkdirSync(path.join(OUT, 'utils')); fs.mkdirSync(path.join(OUT, 'store')); fs.mkdirSync(path.join(OUT, 'stubs'))
fs.writeFileSync(path.join(OUT, 'stubs/zustand.mjs'), `
export function create(init) {
  let state; const set = (p) => { state = { ...state, ...(typeof p === 'function' ? p(state) : p) } }; const get = () => state
  state = init(set, get)
  const useStore = () => state; useStore.getState = get; useStore.setState = set; return useStore
}`)
fs.writeFileSync(path.join(OUT, 'stubs/router.mjs'), `export const useNavigate = () => () => {}`)
fs.writeFileSync(path.join(OUT, 'stubs/socket.mjs'), `export const emitSocket = () => {}`)
fs.writeFileSync(path.join(OUT, 'stubs/waiting.mjs'), `export default function GameSyncWaiting() { return 'WAITING' }`)
const map = { react: pathToFileURL(reactPath).href, zustand: './stubs/zustand.mjs' }
const build = (rel, dest, rewrite) => {
  let code = ts.transpileModule(fs.readFileSync(path.join(SRC, rel), 'utf8'), { compilerOptions: { jsx: ts.JsxEmit.React, module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText
  code = code.replace(/from '([^']+)'/g, (m, spec) => `from '${rewrite(spec)}'`).replace(/import\.meta\.env\.\w+/g, 'undefined')
  fs.writeFileSync(path.join(OUT, dest), code)
}
const fix = (prefix) => (spec) => ({
  react: map.react, 'react-router-dom': `${prefix}stubs/router.mjs`, zustand: `${prefix}stubs/zustand.mjs`,
  '../store/gameStore': '../store/gameStore.mjs', '../hooks/useSocket': `${prefix}stubs/socket.mjs`,
  '../components/GameSyncWaiting': `${prefix}stubs/waiting.mjs`,
}[spec] ?? (spec.startsWith('../utils/') ? spec + '.mjs' : spec.startsWith('./') ? spec + '.mjs' : spec))
build('store/gameStore.js', 'store/gameStore.mjs', fix('../'))
for (const f of ['comboDetector', 'comboPicker', 'groupChain', 'handUi', 'session']) build(`utils/${f}.js`, `utils/${f}.mjs`, fix('../'))
build('pages/GamePage.jsx', 'pages/GamePage.mjs', fix('../'))
const { useGameStore: store } = await import(pathToFileURL(path.join(OUT, 'store/gameStore.mjs')).href)
const GamePage = (await import(pathToFileURL(path.join(OUT, 'pages/GamePage.mjs')).href)).default

// ── helper ──
let pass = 0, fail = 0
const t = (name, fn) => { try { fn(); pass++; console.log('  PASS ', name) } catch (e) { fail++; console.log('  FAIL ', name, '\n        ', e.message) } }
const mk = (id) => ({ id, rank: id.slice(0, -1), suit: id.slice(-1) })
const HAND = ['3D','3C','4H','5D','6C','9S','JS','2D']
function render({ width = 1000, myTurn = true, selected = [], table = [], connected = true, hand = HAND } = {}) {
  setWidth(width)
  const me = 'me'
  store.setState({
    user: { id: me }, roomCode: 'ROOM', roomInfo: { code: 'ROOM', maxGames: 4, setScores: {} }, connected,
    selectedIds: selected, events: [], currentTurn: myTurn ? me : 'p2',
    gameState: { gameNumber: 1, myHand: hand.map(mk), opponents: [{ id: 'p2', cardCount: 13 }], currentTurn: myTurn ? me : 'p2', timeLeft: 30000, table },
  })
  const html = renderToString(React.createElement(GamePage)).replace(/<!-- -->/g, '')
  const buttons = [...html.matchAll(/<button([^>]*)>([^<]*)<\/button>/g)].map(m => ({ label: m[2].trim(), disabled: /disabled=""/.test(m[1]) }))
  const btn = (label) => buttons.find(b => b.label === label || b.label.startsWith(label + ' '))
  return { html, buttons, btn, raised: (html.match(/translateY\(-14px\)/g) || []).length }
}
const tableOf = (ids, pid = 'p2') => { const cards = ids.map(mk); return [{ playerId: pid, combo: { type: ids.length === 2 ? 'pair' : 'single', cards } }] }

t('layout lebar: Combo Detector, CLEAR, serta AUTO/SKIP/PLAY/HINT ada; AUTO & HINT placeholder nonaktif', () => {
  const r = render()
  for (const l of ['Single', 'Pair', 'CLEAR', 'AUTO', 'SKIP', 'PLAY', 'HINT']) assert.ok(r.btn(l), `tombol ${l} tidak ada`)
  assert.equal(r.btn('AUTO').disabled, true); assert.equal(r.btn('HINT').disabled, true)
  assert.equal(r.btn('Tris'), undefined)                                  // tidak ada tris di tangan → jenis tidak ditampilkan
  assert.ok(r.html.indexOf('>Single<') < r.html.indexOf('>3<'))          // detector di kiri (lebih dulu di DOM) dari dek
  assert.ok(r.html.indexOf('>PLAY') > r.html.indexOf('>3<'))             // kontrol di kanan dek
})
t('PLAY aktif hanya bila seleksi legal: pair sah di meja kosong → aktif; terpilih 2 kartu non-pair → nonaktif', () => {
  assert.equal(render({ selected: ['3D', '3C'] }).btn('PLAY').disabled, false)
  assert.equal(render({ selected: ['3D', '4H'] }).btn('PLAY').disabled, true)
  assert.equal(render({ selected: [] }).btn('PLAY').disabled, true)
})
t('PLAY nonaktif bila tidak bisa mengalahkan meja, aktif bila bisa; ada pesan penjelas', () => {
  const lose = render({ selected: ['3D', '3C'], table: tableOf(['4D', '4C']) })
  assert.equal(lose.btn('PLAY').disabled, true); assert.ok(lose.html.includes('Tidak bisa mengalahkan meja'))
  const win = render({ selected: ['9S', 'JS'], table: tableOf(['4D', '4C']) })      // bukan pair → tetap tidak sah
  assert.equal(win.btn('PLAY').disabled, true)
  const win2 = render({ selected: ['3D', '3C'], table: tableOf(['3D', '3S'].map(String)) })   // pair 3 (high 3S) vs pair 3 (high 3C): kalah
  assert.equal(win2.btn('PLAY').disabled, true)
  const ok = render({ selected: ['5D'], table: [{ playerId: 'p2', combo: { type: 'single', cards: [mk('4H')] } }] })
  assert.equal(ok.btn('PLAY').disabled, false)
})
t('bukan giliran: PLAY & SKIP nonaktif, tetapi Combo Detector dan seleksi tetap bisa dipakai', () => {
  const r = render({ myTurn: false, selected: ['3D', '3C'] })
  assert.equal(r.btn('PLAY').disabled, true); assert.equal(r.btn('SKIP').disabled, true)
  assert.equal(r.btn('Single').disabled, false); assert.equal(r.btn('Pair').disabled, false)
  assert.equal(r.btn('CLEAR').disabled, false); assert.equal(r.raised, 2)           // kartu terpilih tetap menonjol
})
t('CLEAR nonaktif saat tidak ada seleksi; kartu terpilih terangkat sebanyak seleksi', () => {
  assert.equal(render().btn('CLEAR').disabled, true)
  const r = render({ selected: ['9S', 'JS', '2D'] }); assert.equal(r.raised, 3); assert.equal(r.btn('CLEAR').disabled, false)
})
t('layar sempit: Combo Detector pindah ke atas dek, CLEAR di kiri bawah, kontrol tetap lengkap', () => {
  const r = render({ width: 400 })
  for (const l of ['Single', 'Pair', 'CLEAR', 'AUTO', 'SKIP', 'PLAY', 'HINT']) assert.ok(r.btn(l), `tombol ${l} tidak ada`)
  assert.ok(r.html.indexOf('>Single<') < r.html.indexOf('>3<'))
  assert.ok(r.html.indexOf('>CLEAR<') > r.html.indexOf('>2<'))                       // CLEAR di bawah dek
  assert.ok(r.html.indexOf('>CLEAR<') < r.html.indexOf('>SKIP<'))                    // kiri dari kontrol
})
t('tidak terhubung: PLAY & SKIP nonaktif', () => {
  const r = render({ connected: false, selected: ['3D', '3C'] }); assert.equal(r.btn('PLAY').disabled, true); assert.equal(r.btn('SKIP').disabled, true)
})
console.log(`\n${pass}/${pass + fail} lulus (render)`); process.exit(fail ? 1 : 0)
