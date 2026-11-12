// Static render of the real LobbyPage.jsx (react-dom/server).
// JSX is compiled with esbuild, which ships with Vite (a devDependency of this project): no TypeScript needed.
// Skipped (exit 0) only when the project has no node_modules yet; once dependencies are installed, a missing
// one is a hard FAIL so the render can never be skipped silently.
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
    console.log(`  FAIL   render Lobby: node_modules sudah ada tetapi dependency ini tidak ditemukan: ${missing.join(', ')}. Jalankan "npm install" di folder frontend.`)
    process.exit(1)
  }
  console.log(`  SKIP   render Lobby: dependency belum terpasang (${missing.join(', ')}). Jalankan "npm install" di folder frontend.`)
  process.exit(0)
}
const esbuild = req(esbuildPath), { renderToString } = req(serverPath), React = req(reactPath)
console.log(`  INFO   JSX dikompilasi dengan esbuild ${esbuild.version}`)

const ss = new Map(); const fake = { getItem: k => ss.get(k) ?? null, setItem: (k, v) => ss.set(k, v), removeItem: k => ss.delete(k) }
globalThis.sessionStorage = fake; globalThis.localStorage = fake
globalThis.window = { innerWidth: 1000, addEventListener() {}, removeEventListener() {}, location: { pathname: '/lobby' } }
globalThis.document = { activeElement: null }
const origErr = console.error; console.error = (...a) => { if (!/useLayoutEffect does nothing/.test(String(a[0]))) origErr(...a) }

const OUT = fs.mkdtempSync(path.join(os.tmpdir(), 'martil-lobby-'))
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
  let code = esbuild.transformSync(fs.readFileSync(path.join(SRC, rel), 'utf8'), { loader: 'jsx', format: 'esm', target: 'es2022', jsx: 'transform', sourcefile: rel }).code
  // esbuild prints import specifiers with double quotes: accept both quote styles.
  code = code.replace(/from\s+(['"])([^'"]+)\1/g, (m, q, spec) => `from '${map('../')(spec)}'`).replace(/import\.meta\.env\.\w+/g, 'undefined')
  fs.writeFileSync(path.join(OUT, dest), code)
}
for (const f of ['store/gameStore.js', 'utils/kick.js', 'utils/profile.js', 'components/Modal.jsx', 'pages/LobbyPage.jsx']) build(f, f.replace(/\.jsx?$/, '.mjs'))
const url = (f) => pathToFileURL(path.join(OUT, f)).href
const { useGameStore: store } = await import(url('store/gameStore.mjs'))
const LobbyPage = (await import(url('pages/LobbyPage.mjs'))).default

let pass = 0, fail = 0
const t = (name, fn) => { try { fn(); pass++; console.log('  PASS ', name) } catch (e) { fail++; console.log('  FAIL ', name, '\n        ', e.message) } }

const ME = 'me00000000'
const base = { user: { id: ME, username: 'Budi' }, token: 'x', connected: true, error: null, events: [], setResult: null, restricted: false }
const renderHomepage = () => { store.setState({ ...base, roomCode: null, roomInfo: null }); return renderToString(React.createElement(LobbyPage)).replace(/<!-- -->/g, '') }
const renderRoom = (maxGames) => {
  const players = [ME, 'p200000000'].map(id => ({ id, connected: true, inRoom: true }))
  store.setState({ ...base, roomCode: 'ABC123', roomInfo: { code: 'ABC123', hostId: ME, status: 'waiting', maxGames, players, gameHistory: [] } })
  return renderToString(React.createElement(LobbyPage)).replace(/<!-- -->/g, '')
}

/** The buttons inside the "Jumlah game per set" picker: [{ n, selected }] in render order. */
function gamePicker(html) {
  const from = html.indexOf('Jumlah game per set')
  assert.ok(from > 0, 'pemilih jumlah game tidak ada')
  const to = html.indexOf('Buat Room</button>', from)
  assert.ok(to > from, 'tombol Buat Room tidak ada')
  return [...html.slice(from, to).matchAll(/<button\b([^>]*)>(\d+)<\/button>/g)]
    .map(m => ({ n: Number(m[2]), selected: /border:2px solid/.test(m[1]) }))
}

t('Homepage: pilihan jumlah game per set hanya 3, 4, 5 (urutan itu), tanpa 6', () => {
  const picker = gamePicker(renderHomepage())
  assert.deepEqual(picker.map(b => b.n), [3, 4, 5])
})

t('Homepage: default terpilih 4 (hanya satu tombol bergaya terpilih)', () => {
  const picker = gamePicker(renderHomepage())
  assert.deepEqual(picker.filter(b => b.selected).map(b => b.n), [4])
})

t('Homepage tetap menampilkan Buat Room dan Gabung; bukan tampilan Room', () => {
  const html = renderHomepage()
  assert.ok(html.includes('Buat Room Baru'))
  assert.ok(html.includes('Buat Room</button>'))
  assert.ok(html.includes('Gabung Room'), 'bagian Gabung Room tidak ada')
  assert.ok(!html.includes('Exit Room'), 'Homepage tidak boleh menampilkan tombol Exit Room')
})

t('Room: tidak ada pemilih jumlah game; jumlah game Room ditampilkan apa adanya dari server', () => {
  for (const n of [3, 4, 5]) {
    const html = renderRoom(n)
    assert.ok(!html.includes('Jumlah game per set'), 'Room tidak boleh menampilkan pemilih')
    assert.ok(html.includes(`${n} game per set`), `teks "${n} game per set" tidak ada`)
  }
})

// ── H7: errors from the server are visible ──
// The render helpers above reset the store from `base`, so the error is injected through `base`.
const withError = (msg, render) => { base.error = msg; try { return render() } finally { base.error = null } }
t('Homepage: error server ditampilkan sebagai alert (mis. kode room salah)', () => {
  const html = withError('Kode room tidak ditemukan.', renderHomepage)
  assert.match(html, /<div role="alert"[^>]*>Kode room tidak ditemukan\.<\/div>/)
})
t('Homepage: tanpa error tidak ada alert', () => {
  assert.ok(!renderHomepage().includes('role="alert"'))
})
t('Room: error server (mis. Mulai Game gagal) juga ditampilkan', () => {
  const html = withError('Butuh tepat 4 pemain untuk memulai game.', () => renderRoom(4))
  assert.match(html, /<div role="alert"[^>]*>Butuh tepat 4 pemain untuk memulai game\.<\/div>/)
  assert.ok(!renderRoom(4).includes('role="alert"'))
})

// ── Player names ──
const roomWithNames = ({ profiles, user = { id: ME, username: 'Budi' } }) => {
  const players = [ME, 'p200000000', 'p300000000'].map(id => ({ id, connected: true, inRoom: true }))
  store.setState({ ...base, user, roomCode: 'ABC123', roomInfo: { code: 'ABC123', hostId: ME, status: 'waiting', maxGames: 4, players, gameHistory: [], ...(profiles ? { profiles } : {}) } })
  return renderToString(React.createElement(LobbyPage)).replace(/<!-- -->/g, '')
}
t('Room: kursi menampilkan nama asli pemain (dan "(kamu)" untuk diri sendiri), bukan ID', () => {
  const html = roomWithNames({ profiles: { [ME]: { username: 'Budi' }, p200000000: { username: 'Sari_Dewi' }, p300000000: { username: 'Andi' } } })
  assert.ok(html.includes('Budi (kamu)')); assert.ok(html.includes('>Sari_Dewi<')); assert.ok(html.includes('>Andi<'))
  for (const id of ['me000000', 'p2000000', 'p3000000']) assert.ok(!html.includes(id), `${id} tidak boleh tampil`)
})
t('Room: pemain tanpa profil tampil dengan ID singkat 8 karakter; diri sendiri memakai username akun', () => {
  const html = roomWithNames({ profiles: { p200000000: { username: 'Sari_Dewi' } } })
  assert.ok(html.includes('Budi (kamu)'), 'username akun dipakai bila profil diri sendiri belum ada')
  assert.ok(html.includes('>Sari_Dewi<')); assert.ok(html.includes('>p3000000<'))
})
t('Room: tanpa peta profiles sama sekali (server lama) tetap jalan dengan ID singkat', () => {
  const html = roomWithNames({})
  assert.ok(html.includes('>p2000000<')); assert.ok(html.includes('>p3000000<'))
})

console.log(`\n${pass}/${pass + fail} lulus (render)`); process.exit(fail ? 1 : 0)
