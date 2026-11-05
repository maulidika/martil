import { useSyncExternalStore } from 'react'
export function create(init) {
  let state; const subs = new Set()
  const set = (p) => { const next = typeof p === 'function' ? p(state) : p; state = { ...state, ...next }; subs.forEach(f => f()) }
  const get = () => state
  state = init(set, get)
  function useStore(sel) { return useSyncExternalStore(cb => { subs.add(cb); return () => subs.delete(cb) }, () => (sel ? sel(state) : state)) }
  useStore.getState = get; useStore.setState = set; return useStore
}
