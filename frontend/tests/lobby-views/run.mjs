// HomeView / RoomView (suite "frontend:lobby-views"):  node tests/lobby-views/run.mjs   (from the frontend folder)
//
//  1. behaviour: the REAL components/HomeView.jsx and components/RoomView.jsx are compiled with esbuild (shipped with Vite) and
//     CALLED with props; the returned element tree is searched for buttons/inputs, and their handlers are invoked.
//  2. static contract: LobbyPage passes to each view exactly the props the view destructures, wires each callback to the
//     intended handler, and the views stay presentational (no store, socket hook or router).
// Skipped (exit 0) only when the project has no node_modules yet; once dependencies are installed a missing one is a FAIL.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import { pathToFileURL, fileURLToPath } from 'node:url'
import { execSync } from 'node:child_process'

const here = path.dirname(fileURLToPath(import.meta.url))
const SRC = path.join(here, '../../src')
const read = (rel) => fs.readFileSync(path.join(SRC, rel), 'utf8')
let pass = 0, fail = 0
const t = (name, fn) => { try { fn(); pass++; console.log('  PASS ', name) } catch (e) { fail++; console.log('  FAIL ', name, '\n        ', String(e.message).split('\n').slice(0, 6).join('\n         ')) } }

// ── 2. static contract (needs no dependency) ────────────────────────────────────────────────────────
const lobby = read('pages/LobbyPage.jsx')
const propsOfView = (src) => /export default function \w+\(\{([^}]*)\}\)/.exec(src)[1].split(',').map((x) => x.trim()).filter(Boolean).sort()
const propsPassed = (name) => {
  const m = new RegExp(`<${name}\\b([\\s\\S]*?)/>`).exec(lobby)
  assert.ok(m, `LobbyPage tidak memakai <${name} />`)
  return [...m[1].matchAll(/^\s*(\w+)=\{/gm)].map((x) => x[1]).sort()
}
t('kontrak: LobbyPage mengirim ke HomeView tepat props yang diterimanya', () => {
  assert.deepEqual(propsPassed('HomeView'), propsOfView(read('components/HomeView.jsx')))
})
t('kontrak: LobbyPage mengirim ke RoomView tepat props yang diterimanya', () => {
  assert.deepEqual(propsPassed('RoomView'), propsOfView(read('components/RoomView.jsx')))
})
t('kontrak: tiap callback dihubungkan ke handler yang dimaksud', () => {
  for (const [prop, handler] of [['onCreate', 'doCreate'], ['onJoin', 'doJoin'], ['onMaxGamesChange', 'setMaxGames'], ['onJoinInputChange', 'setJoinInput'],
    ['onStart', 'doStart'], ['onExit', 'doExit'], ['onKick', 'setKickTarget'], ['maxGamesOptions', 'MAX_GAMES_OPTIONS'], ['room', 'myRoom']]) {
    assert.ok(new RegExp(`\\b${prop}=\\{${handler}\\}`).test(lobby), `${prop} harus berisi ${handler}`)
  }
})
t('kedua view murni tampilan: tidak memakai store, hook socket, atau router', () => {
  for (const f of ['components/HomeView.jsx', 'components/RoomView.jsx']) {
    const src = read(f).replace(/\/\/.*$/gm, '')
    assert.doesNotMatch(src, /useGameStore|gameStore|useSocket|emitSocket|react-router|useNavigate/, `${f} harus tetap murni tampilan`)
  }
})

// ── 1. behaviour (needs react + esbuild) ────────────────────────────────────────────────────────────
const roots = [...(process.env.NODE_PATH || '').split(path.delimiter).filter(Boolean)]
try { roots.push(execSync('npm root -g', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim()) } catch {}
const req = createRequire(import.meta.url)
const find = (name) => { try { return req.resolve(name, { paths: [path.join(here, '../..'), ...roots] }) } catch { return null } }
const vitePath = find('vite'); let esbuildPath = null
if (vitePath) { try { esbuildPath = createRequire(vitePath).resolve('esbuild') } catch {} }
esbuildPath ||= find('esbuild')
const reactPath = find('react')
const missing = [['react', reactPath], ['esbuild (dibawa oleh vite)', esbuildPath]].filter(([, p]) => !p).map(([n]) => n)
if (missing.length) {
  if (fs.existsSync(path.join(here, '../../node_modules'))) { console.log(`  FAIL   render HomeView/RoomView: node_modules sudah ada tetapi tidak ditemukan: ${missing.join(', ')}. Jalankan "npm install" di folder frontend.`); fail++ }
  else console.log(`  SKIP   render HomeView/RoomView: dependency belum terpasang (${missing.join(', ')}).`)
  console.log(`\n${pass}/${pass + fail} lulus`); process.exit(fail ? 1 : 0)
}
const esbuild = req(esbuildPath), React = req(reactPath)
const OUT = fs.mkdtempSync(path.join(os.tmpdir(), 'martil-lobbyviews-'))
let HomeView, RoomView
try {
  for (const d of ['components', 'utils']) fs.mkdirSync(path.join(OUT, d))
  const map = (spec) => ({ react: pathToFileURL(reactPath).href }[spec] ?? ((spec.startsWith('../utils/') || spec.startsWith('./')) ? spec + '.mjs' : spec))
  for (const f of ['utils/kick.js', 'components/lobbyStyles.js', 'components/HomeView.jsx', 'components/RoomView.jsx']) {
    let code = esbuild.transformSync(read(f), { loader: 'jsx', format: 'esm', target: 'es2022', jsx: 'transform', sourcefile: f }).code
    code = code.replace(/from\s+(['"])([^'"]+)\1/g, (m, q, spec) => `from '${map(spec)}'`)
    fs.writeFileSync(path.join(OUT, f.replace(/\.jsx?$/, '.mjs')), code)
  }
  const url = (f) => pathToFileURL(path.join(OUT, f)).href
  HomeView = (await import(url('components/HomeView.mjs'))).default
  RoomView = (await import(url('components/RoomView.mjs'))).default
} finally { fs.rmSync(OUT, { recursive: true, force: true }) }

// element-tree helpers (the views are plain function components without hooks, so they can be called directly)
const walk = (node, visit) => {
  if (Array.isArray(node)) return node.forEach((n) => walk(n, visit))
  if (node && typeof node === 'object' && node.props) { visit(node); walk(node.props.children, visit) }
}
const find_ = (tree, pred) => { const out = []; walk(tree, (el) => { if (pred(el)) out.push(el) }); return out }
const textOf = (node) => Array.isArray(node) ? node.map(textOf).join('') : (node && typeof node === 'object' && node.props) ? textOf(node.props.children) : (node == null || node === false || node === true) ? '' : String(node)
const buttons = (tree) => find_(tree, (e) => e.type === 'button')
const btn = (tree, label) => { const b = buttons(tree).filter((x) => textOf(x).trim() === label); assert.equal(b.length, 1, `tombol '${label}': ${b.length}x`); return b[0] }
const spy = () => { const f = (...a) => { f.calls.push(a) }; f.calls = []; return f }

const home = (o = {}) => HomeView({ maxGamesOptions: [3, 4, 5], maxGames: 4, onMaxGamesChange: spy(), joinInput: '', onJoinInputChange: spy(), onCreate: spy(), onJoin: spy(), ...o })
t('HomeView: judul, label, dan satu tombol per opsi dari props (bukan dari konstanta)', () => {
  const tree = home({ maxGamesOptions: [2, 7, 9] })
  const text = textOf(tree)
  assert.ok(text.includes('Buat Room Baru') && text.includes('Gabung Room') && text.includes('Jumlah game per set'))
  assert.deepEqual(buttons(tree).map((b) => textOf(b).trim()).slice(0, 3), ['2', '7', '9'])
})
t('HomeView: opsi terpilih ditandai (border 2px), yang lain 1px', () => {
  const tree = home({ maxGamesOptions: [3, 4, 5], maxGames: 5 })
  const styles = ['3', '4', '5'].map((n) => btn(tree, n).props.style.border)
  assert.ok(styles[2].startsWith('2px') && styles[0].startsWith('1px') && styles[1].startsWith('1px'), JSON.stringify(styles))
})
t('HomeView: klik opsi memanggil onMaxGamesChange(n)', () => {
  const o = { onMaxGamesChange: spy() }; const tree = home(o)
  btn(tree, '5').props.onClick(); btn(tree, '3').props.onClick()
  assert.deepEqual(o.onMaxGamesChange.calls, [[5], [3]])
})
t('HomeView: Buat Room memanggil onCreate, Gabung memanggil onJoin', () => {
  const o = { onCreate: spy(), onJoin: spy() }; const tree = home(o)
  btn(tree, 'Buat Room').props.onClick(); btn(tree, 'Gabung').props.onClick()
  assert.equal(o.onCreate.calls.length, 1); assert.equal(o.onJoin.calls.length, 1)
})
t('HomeView: input kode: nilai dari props, maxLength 6, onChange mengirim huruf besar', () => {
  const o = { joinInput: 'AB3', onJoinInputChange: spy() }; const tree = home(o)
  const [input] = find_(tree, (e) => e.type === 'input')
  assert.equal(input.props.value, 'AB3'); assert.equal(input.props.maxLength, 6)
  input.props.onChange({ target: { value: 'ab3x9z' } })
  assert.deepEqual(o.onJoinInputChange.calls, [['AB3X9Z']])
})

const ID = ['u1', 'u2', 'u3', 'u4']
const room = (n, o = {}) => ({ code: 'ABC123', hostId: 'u1', status: 'waiting', maxGames: 4, players: ID.slice(0, n).map((id) => ({ id, connected: true, inRoom: true })), ...o })
const roomView = (o = {}) => {
  const r = o.room || room(4)
  return RoomView({ room: r, user: { id: 'u1' }, players: r.players, isHost: true, ready: true, exiting: false, nameOf: (id) => `N-${id}`,
    onStart: spy(), onExit: spy(), onKick: spy(), ...o })
}
t('RoomView: kode, jumlah pemain, 4 kursi (kosong = Menunggu…), (kamu), Host, dan jumlah game', () => {
  const tree = roomView({ room: room(2) }); const text = textOf(tree)
  assert.ok(text.includes('ABC123') && text.includes('2/4 pemain') && text.includes('4 game per set'))
  assert.ok(text.includes('N-u1 (kamu)') && text.includes('N-u2') && !text.includes('N-u2 (kamu)'))
  assert.equal((text.match(/Menunggu…/g) || []).length, 2)
  assert.ok(text.includes('Host'))
})
t('RoomView: pemain yang belum kembali diberi label', () => {
  const r = room(4); r.players[2].inRoom = false
  assert.equal((textOf(roomView({ room: r })).match(/belum kembali/g) || []).length, 1)
})
t('RoomView: teks tombol Host mengikuti ready dan jumlah pemain', () => {
  assert.ok(btn(roomView({ ready: true }), 'Mulai Game'))
  assert.ok(btn(roomView({ room: room(2), ready: false }), 'Menunggu pemain (2/4)'))
  assert.ok(btn(roomView({ room: room(4), ready: false }), 'Menunggu semua pemain kembali'))
})
t('RoomView: klik tombol Host memanggil onStart; bukan Host: tanpa tombol Mulai, ada pesan menunggu host', () => {
  const o = { onStart: spy() }; btn(roomView(o), 'Mulai Game').props.onClick(); assert.equal(o.onStart.calls.length, 1)
  const guest = roomView({ user: { id: 'u2' }, isHost: false })
  assert.ok(textOf(guest).includes('Menunggu host memulai game…'))
  assert.equal(buttons(guest).filter((b) => /Mulai Game|Menunggu pemain|Menunggu semua/.test(textOf(b))).length, 0)
})
t('RoomView: Exit Room aktif memanggil onExit; saat exiting dinonaktifkan dan teksnya berubah', () => {
  const o = { onExit: spy() }; const b = btn(roomView(o), 'Exit Room')
  assert.ok(!b.props.disabled); b.props.onClick(); assert.equal(o.onExit.calls.length, 1)
  const busy = btn(roomView({ exiting: true }), 'Keluar dari room…')
  assert.equal(busy.props.disabled, true)
})
t('RoomView: tombol Kick hanya untuk Host terhadap pemain lain; klik memanggil onKick(id)', () => {
  const o = { onKick: spy() }; const tree = roomView(o)
  const kicks = buttons(tree).filter((b) => textOf(b).trim() === 'Kick')
  assert.equal(kicks.length, 3)
  kicks.forEach((b) => b.props.onClick())
  assert.deepEqual(o.onKick.calls, [['u2'], ['u3'], ['u4']])
  const guest = roomView({ user: { id: 'u2' }, isHost: false })
  assert.equal(buttons(guest).filter((b) => textOf(b).trim() === 'Kick').length, 0)
  const playing = roomView({ room: room(4, { status: 'playing' }) })
  assert.equal(buttons(playing).filter((b) => textOf(b).trim() === 'Kick').length, 0)
})

console.log(`\n${pass}/${pass + fail} lulus`); process.exit(fail ? 1 : 0)
