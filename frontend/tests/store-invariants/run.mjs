// Store invariants (suite "frontend:store-invariants"):  node tests/store-invariants/run.mjs   (from the frontend folder)
//
// Runs the REAL store/gameStore.js (built like the sync.sim suite: prepare() from ../sync.sim/main.mjs, zustand replaced by
// its small stub) and checks that the two copies of the current turn never disagree:
//   invariant: gameState === null  ||  gameState.currentTurn === currentTurn
// plus the reset postconditions of the actions that clear room/game state.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { prepare } from '../sync.sim/main.mjs'

const ss = new Map()
globalThis.sessionStorage = { getItem: k => ss.get(k) ?? null, setItem: (k, v) => ss.set(k, v), removeItem: k => ss.delete(k) }
globalThis.localStorage = { removeItem() {} }

const OUT = prepare()
let useGameStore
try { ({ useGameStore } = await import(pathToFileURL(path.join(OUT, 'store/gameStore.mjs')).href)) } finally { fs.rmSync(OUT, { recursive: true, force: true }) }
const st = () => useGameStore.getState()
const reset = () => st().clearRoomState()
const consistent = () => st().gameState === null || st().gameState.currentTurn === st().currentTurn

let pass = 0, fail = 0
const t = (name, fn) => { reset(); try { fn(); pass++; console.log('  PASS ', name) } catch (e) { fail++; console.log('  FAIL ', name, '\n        ', String(e.message).split('\n').slice(0, 6).join('\n         ')) } }

t('setGameState menyalin giliran dari snapshot ke level atas', () => {
  st().setGameState({ currentTurn: 'u2', timeLeft: 5000, myHand: [{ id: '3D' }] })
  assert.equal(st().currentTurn, 'u2'); assert.equal(st().gameState.currentTurn, 'u2')
})

t('setCurrentTurn memperbarui salinan di gameState (tidak basi), field lain utuh', () => {
  st().setGameState({ currentTurn: 'u2', timeLeft: 5000, myHand: [{ id: '3D' }] })
  st().setCurrentTurn('u3')
  assert.equal(st().currentTurn, 'u3'); assert.equal(st().gameState.currentTurn, 'u3')
  assert.equal(st().gameState.timeLeft, 5000); assert.deepEqual(st().gameState.myHand, [{ id: '3D' }])
})

t('setCurrentTurn tidak memutasi objek gameState yang lama (objek baru)', () => {
  const g = { currentTurn: 'u2', timeLeft: 1 }
  st().setGameState(g)
  st().setCurrentTurn('u4')
  assert.equal(g.currentTurn, 'u2'); assert.notEqual(st().gameState, g)
})

t('setCurrentTurn tanpa gameState: disimpan di level atas dan tidak membuat gameState', () => {
  st().setCurrentTurn('u1')
  assert.equal(st().currentTurn, 'u1'); assert.equal(st().gameState, null)
})

t('snapshot yang datang setelah setCurrentTurn menimpa nilai sementara', () => {
  st().setCurrentTurn('u1')
  st().setGameState({ currentTurn: 'u2' })
  assert.equal(st().currentTurn, 'u2'); assert.ok(consistent())
})

t('setCurrentTurn(null) mengosongkan kedua salinan', () => {
  st().setGameState({ currentTurn: 'u2' })
  st().setCurrentTurn(null)
  assert.equal(st().currentTurn, null); assert.equal(st().gameState.currentTurn, null)
})

t('aksi reset (clearRoomState, enterRoomView, logout) mengosongkan gameState dan currentTurn', () => {
  for (const act of [() => st().clearRoomState(), () => st().enterRoomView({ code: 'ABC123' }), () => st().logout()]) {
    st().setGameState({ currentTurn: 'u2' }); act()
    assert.equal(st().gameState, null); assert.equal(st().currentTurn, null)
  }
})

t('applyRestoredSession: giliran mengikuti snapshot (ada game) atau null (tanpa game)', () => {
  st().applyRestoredSession({ code: 'ABC123', status: 'playing', game: { currentTurn: 'u7' } })
  assert.equal(st().currentTurn, 'u7'); assert.ok(consistent())
  st().applyRestoredSession({ code: 'ABC123', status: 'waiting' })
  assert.equal(st().currentTurn, null); assert.equal(st().gameState, null)
})

t('urutan acak 2000 aksi: gameState === null atau gameState.currentTurn === currentTurn, setelah SETIAP langkah', () => {
  let seed = 12345
  const rnd = (n) => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed % n }
  const ids = ['u1', 'u2', 'u3', 'u4', null]
  const actions = [
    () => st().setGameState({ currentTurn: ids[rnd(5)], timeLeft: rnd(30000), myHand: [] }),
    () => st().setGameState(null),
    () => st().setCurrentTurn(ids[rnd(5)]),
    () => st().setCurrentTurn(ids[rnd(5)]),
    () => st().applyRestoredSession({ code: 'ABC123', status: 'playing', game: { currentTurn: ids[rnd(5)] } }),
    () => st().applyRestoredSession({ code: 'ABC123', status: 'waiting' }),
    () => st().enterRoomView({ code: 'ABC123' }),
    () => st().clearRoomState(),
    () => st().logout(),
  ]
  for (let i = 0; i < 2000; i++) {
    const k = rnd(actions.length); actions[k]()
    assert.ok(consistent(), `langkah ${i}, aksi #${k}: gameState.currentTurn=${st().gameState?.currentTurn} currentTurn=${st().currentTurn}`)
  }
})

console.log(`\n${pass}/${pass + fail} lulus`); process.exit(fail ? 1 : 0)
