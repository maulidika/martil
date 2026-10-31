export const create = (init) => {
  let state; const set = (p) => { state = { ...state, ...(typeof p === 'function' ? p(state) : p) } }; const get = () => state
  state = init(set, get)
  const hook = (sel) => (sel ? sel(state) : state); hook.getState = get; hook.setState = set; return hook
}
