export const reactState = { cleanup: null }
export const useEffect = (fn) => { reactState.cleanup = fn() }
export const useCallback = (fn) => fn
