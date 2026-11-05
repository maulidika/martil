export const emitSocket = (ev, payload) => { (window.__emits = window.__emits || []).push([ev, payload]); return true }
export const requestResume = () => {}; export const useSocket = () => {}; export const getSocket = () => null
