// Zustand subscription guard (suite "frontend:store-selectors"):  node tests/store-selectors/run.mjs   (from the frontend folder)
//
//  1. behaviour: the REAL hooks/useSocket.js, built the same way as the sync.sim suite (prepare() from ../sync.sim/main.mjs),
//     must call useGameStore exactly once and with a selector. A call without a selector subscribes to the whole store and
//     re-renders <App> (and the routed page) on every store change.
//  2. static: outside ALLOWED_WHOLE_STORE no file in frontend/src may call useGameStore() without a selector, and every
//     field destructured from such a call must still be used in that file.
//
// Static limits: textual check (no parser). A field that is mentioned only in a string, a comment-free JSX text or as an
// object key still counts as "used"; comments are stripped first.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { prepare } from '../sync.sim/main.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const SRC = path.join(HERE, '../../src')

// Pages that still read the whole store on purpose: each uses most of its fields, and the render harnesses (combo-ui,
// kick-ui, lobby-ui) stub zustand with `useStore = () => state`, which ignores selectors. Moving them is a separate step.
const ALLOWED_WHOLE_STORE = [
  { file: 'pages/GamePage.jsx', why: 'uses almost every store field; render harnesses stub zustand without selector support' },
  { file: 'pages/LobbyPage.jsx', why: 'uses most of its fields; render harnesses stub zustand without selector support' },
  { file: 'pages/ResultPage.jsx', why: 'uses most of its fields; render harnesses stub zustand without selector support' },
]

const stripComments = (code) => code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1')
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const isUsed = (name, body) => new RegExp(`(?<![\\w$.])${escapeRe(name)}(?![\\w$])`).test(body)
const WHOLE_CALL = /\buseGameStore\(\s*\)/
const DESTRUCTURE = /(?:const|let|var)\s*\{([^}]*)\}\s*=\s*useGameStore\(\s*\)/g

/** { whole: boolean, unusedFields: string[] } for one source text. */
function analyse(code) {
  const text = stripComments(code.replace(/\r\n/g, '\n'))
  const fields = []
  const body = text.replace(DESTRUCTURE, (_m, list) => {
    for (const p of list.split(',')) { const n = p.trim(); if (n) fields.push((n.includes(':') ? n.split(':')[1] : n).split('=')[0].trim()) }
    return ''
  })
  return { whole: WHOLE_CALL.test(text), unusedFields: fields.filter((f) => !isUsed(f, body)) }
}

function listFiles(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) listFiles(p, out); else if (/\.(jsx?|mjs)$/.test(e.name)) out.push(p)
  }
  return out
}
const rel = (p) => path.relative(SRC, p).split(path.sep).join('/')
const scanned = listFiles(SRC).map((p) => ({ file: rel(p), ...analyse(fs.readFileSync(p, 'utf8')) }))

let pass = 0, fail = 0
const t = (name, fn) => { try { fn(); pass++; console.log('  PASS ', name) } catch (e) { fail++; console.log('  FAIL ', name, '\n        ', String(e.message).split('\n').slice(0, 6).join('\n         ')) } }

// ── 1. behaviour of the real useSocket ──────────────────────────────────────────────────────────────
function probeUseSocket() {
  const OUT = prepare()
  try {
    fs.writeFileSync(path.join(OUT, 'stubs/zustand.mjs'), [
      'export const calls = []',
      'export const create = (init) => {',
      '  let state; const set = (p) => { state = { ...state, ...(typeof p === "function" ? p(state) : p) } }; const get = () => state',
      '  state = init(set, get)',
      '  const hook = (sel) => { calls.push(typeof sel); return sel ? sel(state) : state }',
      '  hook.getState = get; hook.setState = set; return hook',
      '}', ''].join('\n'))
    fs.writeFileSync(path.join(OUT, 'probe.mjs'), [
      'const ss = new Map([["martil_token", JSON.stringify("tok")], ["martil_user", JSON.stringify({ id: "u1" })]])',
      'globalThis.sessionStorage = { getItem: k => ss.get(k) ?? null, setItem: (k, v) => ss.set(k, v), removeItem: k => ss.delete(k) }',
      'globalThis.window = { location: { pathname: "/" } }',
      'console.info = () => {}',
      'const { calls } = await import("./stubs/zustand.mjs")',
      'const { sockets } = await import("./stubs/sio.mjs")',
      'const { useSocket } = await import("./hooks/useSocket.mjs")',
      'calls.length = 0',
      'useSocket()',
      'console.log("PROBE " + JSON.stringify({ calls, sockets: sockets.length }))',
      'process.exit(0)', ''].join('\n'))
    const r = spawnSync(process.execPath, [path.join(OUT, 'probe.mjs')], { encoding: 'utf8' })
    const line = (r.stdout || '').split(/\r?\n/).find((l) => l.startsWith('PROBE '))
    assert.ok(line, `probe gagal: ${(r.stderr || r.stdout || '').slice(0, 300)}`)
    return JSON.parse(line.slice(6))
  } finally { fs.rmSync(OUT, { recursive: true, force: true }) }
}
const probe = probeUseSocket()
t('useSocket: tepat satu pemanggilan useGameStore, dengan selector (tidak berlangganan seluruh store)', () => {
  assert.deepEqual(probe.calls, ['function'])
})
t('useSocket: efeknya tetap jalan (socket dibuat saat ada token)', () => {
  assert.equal(probe.sockets, 1)
})

// ── 2. static guard ─────────────────────────────────────────────────────────────────────────────────
t('pemeriksa: pemanggilan tanpa selector terdeteksi, dengan selector dan getState() tidak', () => {
  assert.equal(analyse('const a = useGameStore()').whole, true)
  assert.equal(analyse('const a = useGameStore(  )').whole, true)
  assert.equal(analyse('const a = useGameStore((s) => s.token)').whole, false)
  assert.equal(analyse('const { x } = useGameStore.getState()').whole, false)
  assert.equal(analyse('// useGameStore() in a comment\n').whole, false)
})
t('pemeriksa: field hasil destructuring yang tidak dipakai terdeteksi (alias dan baris ganda ikut)', () => {
  assert.deepEqual(analyse('const { a, b } = useGameStore()\nuse(a)\n').unusedFields, ['b'])
  assert.deepEqual(analyse('const {\n  a,\n  b: c,\n} = useGameStore()\nuse(a)\n').unusedFields, ['c'])
  assert.deepEqual(analyse('const { a, b } = useGameStore()\nuse(a, b)\n').unusedFields, [])
  assert.deepEqual(analyse('const { a } = useGameStore()\nuse(obj.a)\n').unusedFields, ['a'])
  assert.deepEqual(analyse('const { a, b } = useGameStore()\r\nuse(a)\r\n').unusedFields, ['b'])
})
t('frontend/src ditemukan dan dipindai', () => { assert.ok(scanned.length > 10) })
t('tidak ada useGameStore() tanpa selector di luar ALLOWED_WHOLE_STORE', () => {
  const allowed = new Set(ALLOWED_WHOLE_STORE.map((a) => a.file))
  assert.deepEqual(scanned.filter((s) => s.whole && !allowed.has(s.file)).map((s) => s.file), [], 'pakai selector (useGameStore((s) => s.field))')
})
t('ALLOWED_WHOLE_STORE tidak basi: tiap entri punya alasan dan masih memanggil useGameStore() tanpa selector', () => {
  for (const a of ALLOWED_WHOLE_STORE) {
    assert.ok(a.why.length > 20, `${a.file}: alasan wajib ditulis`)
    assert.ok(scanned.some((s) => s.file === a.file && s.whole), `${a.file}: tidak lagi memanggil useGameStore() tanpa selector: hapus dari ALLOWED_WHOLE_STORE`)
  }
})
t('setiap field hasil destructuring useGameStore() masih dipakai', () => {
  assert.deepEqual(scanned.flatMap((s) => s.unusedFields.map((f) => `${s.file}: ${f}`)), [])
})

console.log(`\n${pass}/${pass + fail} lulus`); process.exit(fail ? 1 : 0)
