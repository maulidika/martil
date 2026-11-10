// Smoke test render GamePage.jsx ASLI dengan React + react-dom/server (render statis, tanpa DOM/efek).
// JSX dikompilasi dengan esbuild (dibawa Vite, devDependency project ini); TypeScript tidak dibutuhkan.
// SKIP (exit 0) hanya bila project belum punya node_modules; bila node_modules ada tetapi dependency hilang -> FAIL.
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
// esbuild: resolved from where Vite itself resolves it (works with hoisted and nested layouts), else directly.
const findEsbuild = () => {
  const vitePath = find('vite')
  if (vitePath) { try { return createRequire(vitePath).resolve('esbuild') } catch {} }
  return find('esbuild')
}
const reactPath = find('react'), serverPath = find('react-dom/server'), esbuildPath = findEsbuild()
const missing = [['react', reactPath], ['react-dom', serverPath], ['esbuild (dibawa oleh vite)', esbuildPath]].filter(([, p]) => !p).map(([n]) => n)
if (missing.length) {
  if (fs.existsSync(path.join(here, '../../node_modules'))) {
    console.log(`  FAIL   render GamePage: node_modules sudah ada tetapi dependency ini tidak ditemukan: ${missing.join(', ')}. Jalankan "npm install" di folder frontend.`)
    process.exit(1)
  }
  console.log(`  SKIP   render GamePage: dependency belum terpasang (${missing.join(', ')}). Jalankan "npm install" di folder frontend.`)
  process.exit(0)
}
const esbuild = req(esbuildPath), { renderToString } = req(serverPath), React = req(reactPath)
console.log(`  INFO   JSX dikompilasi dengan esbuild ${esbuild.version}`)

// ── lingkungan browser palsu ──
const ss = new Map(); const fakeStore = { getItem: k => ss.get(k) ?? null, setItem: (k, v) => ss.set(k, v), removeItem: k => ss.delete(k) }
globalThis.sessionStorage = fakeStore; globalThis.localStorage = fakeStore
const setWidth = (w, h = w < 720 ? 800 : 700) => { globalThis.window = { innerWidth: w, innerHeight: h, addEventListener() {}, removeEventListener() {}, location: { pathname: '/game' } } }
const origErr = console.error; console.error = (...a) => { if (!String(a[0]).includes('useLayoutEffect does nothing on the server')) origErr(...a) }

// ── bangun modul uji: transpile JSX → ESM, arahkan impor ke stub ──
const OUT = fs.mkdtempSync(path.join(os.tmpdir(), 'martil-render-'))
for (const d of ['pages', 'utils', 'store', 'stubs', 'components', 'components/game']) fs.mkdirSync(path.join(OUT, d), { recursive: true })
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
  let code = esbuild.transformSync(fs.readFileSync(path.join(SRC, rel), 'utf8'), { loader: 'jsx', format: 'esm', target: 'es2022', jsx: 'transform', sourcefile: rel }).code
  // esbuild prints import specifiers with double quotes: accept both quote styles.
  code = code.replace(/from\s+(['"])([^'"]+)\1/g, (m, q, spec) => `from '${rewrite(spec)}'`).replace(/import\.meta\.env\.\w+/g, 'undefined')
  fs.writeFileSync(path.join(OUT, dest), code)
}
const fix = (prefix) => (spec) => ({
  react: map.react, 'react-router-dom': `${prefix}stubs/router.mjs`, zustand: `${prefix}stubs/zustand.mjs`,
  '../store/gameStore': '../store/gameStore.mjs', '../hooks/useSocket': `${prefix}stubs/socket.mjs`,
  '../components/GameSyncWaiting': `${prefix}stubs/waiting.mjs`,
}[spec] ?? (spec.startsWith('.') ? spec + '.mjs' : spec))
build('store/gameStore.js', 'store/gameStore.mjs', fix('../'))
for (const f of ['comboDetector', 'comboPicker', 'groupChain', 'handUi', 'session', 'gameLayout', 'profile']) build(`utils/${f}.js`, `utils/${f}.mjs`, fix('../'))
build('components/game/ui.jsx', 'components/game/ui.mjs', fix('../../'))
build('pages/GamePage.jsx', 'pages/GamePage.mjs', fix('../'))
const { useGameStore: store } = await import(pathToFileURL(path.join(OUT, 'store/gameStore.mjs')).href)
const GamePage = (await import(pathToFileURL(path.join(OUT, 'pages/GamePage.mjs')).href)).default

// ── helper ──
let pass = 0, fail = 0
const t = (name, fn) => { try { fn(); pass++; console.log('  PASS ', name) } catch (e) { fail++; console.log('  FAIL ', name, '\n        ', e.message) } }
const mk = (id) => ({ id, rank: id.slice(0, -1), suit: id.slice(-1) })
const HAND = ['3D','3C','4H','5D','6C','9S','JS','2D']
function render({ width = 1000, myTurn = true, selected = [], table = [], connected = true, hand = HAND, opp = [{ id: 'p2', cardCount: 13 }], players, bet, turn, scores = {}, offline = [] } = {}) {
  setWidth(width)
  const me = 'me'
  const current = turn ?? (myTurn ? me : 'p2')
  store.setState({
    user: { id: me, username: 'Syamil_Jumaries' }, roomCode: 'ROOM', connected,
    roomInfo: { code: 'ROOM', maxGames: 4, setScores: scores, ...(bet !== undefined ? { bet } : {}),
                players: players || [me, ...opp.map(o => o.id)].map(id => ({ id, connected: !offline.includes(id), inRoom: true })) },
    selectedIds: selected, events: [], currentTurn: current,
    gameState: { gameNumber: 1, myHand: hand.map(mk), opponents: opp, currentTurn: current, timeLeft: 30000, table },
  })
  const html = renderToString(React.createElement(GamePage)).replace(/<!-- -->/g, '')
  const buttons = [...html.matchAll(/<button([^>]*)>(.*?)<\/button>/g)].map(m => ({ label: m[2].replace(/<[^>]*>/g, '').trim(), disabled: /disabled=""/.test(m[1]) }))
  const btn = (label) => buttons.find(b => b.label === label || b.label.startsWith(label + ' '))
  return { html, buttons, btn, raised: (html.match(/translateY\(-\d+px\)/g) || []).length }
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
// ── Redesign: kursi, taruhan, profil ──
const seatOrder = (html) => [...html.matchAll(/data-seat="(\w+)"/g)].map(m => m[1])
const OPP3 = [{ id: 'aaaa1111', cardCount: 13 }, { id: 'bbbb2222', cardCount: 9 }, { id: 'cccc3333', cardCount: 4 }]
t('Redesign: 3 lawan duduk kiri/atas/kanan, pemain utama di bawah; tiap kursi menampilkan nama dan jumlah kartu', () => {
  const html = render({ opp: OPP3 }).html
  assert.deepEqual(seatOrder(html), ['left', 'top', 'right', 'me'])
  for (const o of OPP3) assert.ok(html.includes(o.id.slice(0, 8)))
  for (const n of ['13', '9', '4']) assert.ok(html.includes(`aria-label="${n} kartu"`), `tumpukan kartu ${n} tidak ada`)
  assert.ok(html.includes('Syamil_Jumaries')); assert.ok(html.includes('aria-label="sisa kartu"'))
})
t('Redesign: tata letak proporsional untuk 2 dan 1 lawan', () => {
  assert.deepEqual(seatOrder(render({ opp: OPP3.slice(0, 2) }).html), ['left', 'right', 'me'])
  assert.deepEqual(seatOrder(render({ opp: OPP3.slice(0, 1) }).html), ['top', 'me'])
})
t('Redesign: urutan duduk mengikuti urutan giliran (pemain setelah saya di kiri)', () => {
  const players = ['aaaa1111', 'me', 'bbbb2222', 'cccc3333'].map(id => ({ id, connected: true, inRoom: true }))
  const html = render({ opp: OPP3, players }).html
  const marks = [...html.matchAll(/data-seat="(\w+)"/g)].map(m => ({ side: m[1], i: m.index }))
  const at = (side) => { const k = marks.findIndex(m => m.side === side); const seg = html.slice(marks[k].i, marks[k + 1]?.i ?? html.length); return OPP3.map(o => o.id).find(id => seg.includes(id.slice(0, 8))) }
  assert.equal(at('left'), 'bbbb2222'); assert.equal(at('top'), 'cccc3333'); assert.equal(at('right'), 'aaaa1111')
})
t('Redesign: cincin timer hanya pada pemain yang sedang giliran', () => {
  const mine = render({ opp: OPP3, turn: 'me' }).html, theirs = render({ opp: OPP3, turn: 'bbbb2222' }).html
  assert.equal((mine.match(/conic-gradient/g) || []).length, 1); assert.equal((theirs.match(/conic-gradient/g) || []).length, 1)
  const seatI = theirs.indexOf('data-seat="top"'), meI = theirs.indexOf('data-seat="me"')
  assert.ok(theirs.slice(seatI, meI).includes('conic-gradient'), 'cincin ada di kursi lawan yang giliran'); assert.ok(!theirs.slice(meI).includes('conic-gradient'))
  assert.ok(!mine.slice(0, mine.indexOf('data-seat="me"')).includes('conic-gradient'))
})
t('Redesign: pemain lawan terputus ditandai; skor set tampil di kursi', () => {
  const html = render({ opp: OPP3, offline: ['cccc3333'], scores: { me: 12, aaaa1111: -4 } }).html
  assert.ok(html.includes('terputus')); assert.ok(html.includes('12pt')); assert.ok(html.includes('-4pt'))
})
t('Redesign: taruhan di kiri bawah mengikuti data Room (tidak di-hardcode); placeholder bila belum ada', () => {
  const betText = (html) => (html.match(/data-testid="bet"[^>]*>.*?<span>(.*?)<\/span>/) || [])[1]
  assert.equal(betText(render().html), '—')                          // belum ada sistem taruhan → placeholder
  assert.equal(betText(render({ bet: 5000 }).html), '5K')
  assert.equal(betText(render({ bet: 10000 }).html), '10K')
  assert.equal(betText(render({ bet: '25K' }).html), '25K')
  const html = render({ bet: 5000 }).html
  assert.ok(html.indexOf('data-testid="bet"') > html.indexOf('data-testid="detector"'))      // di kolom kiri, di bawah Combo Detector
  assert.ok(html.indexOf('data-testid="bet"') > html.indexOf('>CLEAR<'))
})
t('Redesign: taruhan terpisah dari koin pemain (koin profil tidak berubah saat taruhan berubah)', () => {
  const coins = (h) => [...h.matchAll(/(\d+(?:,\d+)?[KMB])<\/span>/g)].map(m => m[1]).filter(x => x !== '5K' && x !== '10K')
  assert.deepEqual(coins(render({ bet: 5000 }).html), coins(render({ bet: 10000 }).html))
})
t('Redesign: kartu di meja tampil dengan label kombinasi dan nama pemain', () => {
  const html = render({ table: [{ playerId: 'p2', combo: { type: 'pair', cards: ['5D', '5H'].map(mk) } }] }).html
  assert.ok(html.includes('Pair')); assert.ok(html.includes('oleh '))
  assert.ok(render({ myTurn: true }).html.includes('Meja kosong'))
})
t('Redesign: profil memiliki avatar, level (placeholder) dan koin (dummy) untuk setiap pemain', () => {
  const html = render({ opp: OPP3 }).html
  assert.equal((html.match(/Lv\./g) || []).length, 4)                // 3 lawan + saya
  assert.ok((html.match(/<svg/g) || []).length >= 5)                  // avatar siluet tiap pemain (+ watermark)
})
t('Redesign: layar sempit menampilkan seluruh kursi, kontrol, dan umpan balik seleksi', () => {
  const r = render({ width: 390, opp: OPP3, selected: ['3D', '4H'] })
  assert.deepEqual(seatOrder(r.html), ['left', 'top', 'right', 'me'])
  assert.ok(r.html.includes('Kombinasi tidak valid'))
  for (const l of ['SKIP', 'PLAY', 'CLEAR']) assert.ok(r.btn(l))
})

// ── H7: errors are visible in Game ──
const withError = (msg, fn) => { store.setState({ error: msg }); try { return fn() } finally { store.setState({ error: null }) } }
t('Game: error (dari server atau aksi lokal yang ditolak) tampil sebagai alert di atas meja', () => {
  const html = withError('Bukan giliranmu.', () => render({ myTurn: false }).html)
  assert.match(html, /<div role="alert" data-testid="game-error"[^>]*>Bukan giliranmu\.<\/div>/)
})
t('Game: tanpa error tidak ada alert; tombol dan layout tidak berubah', () => {
  const r = render()
  assert.ok(!r.html.includes('game-error')); assert.ok(!r.html.includes('role="alert"'))
  for (const l of ['Single', 'Pair', 'CLEAR', 'AUTO', 'SKIP', 'PLAY', 'HINT']) assert.ok(r.btn(l), `tombol ${l} tidak ada`)
})
t('Game: banner error tidak menangkap sentuhan (pointer-events: none) dan tidak menutupi tombol', () => {
  const html = withError('Kartu itu tidak ada di tanganmu.', () => render().html)
  const tag = html.slice(html.indexOf('data-testid="game-error"'), html.indexOf('>', html.indexOf('data-testid="game-error"')))
  assert.match(tag, /pointer-events:\s*none/); assert.match(tag, /position:\s*fixed/)
})

console.log(`\n${pass}/${pass + fail} lulus (render)`); process.exit(fail ? 1 : 0)
