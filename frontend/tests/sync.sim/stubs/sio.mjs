export const sockets = []
class FakeSocket {
  constructor(url, opts) { this.opts = opts; this.listeners = {}; this.connected = false; this.id = 'S' + (sockets.length + 1); this.sent = []; this.active = true; this.connectCalls = 0; this.disconnected = false }
  on(ev, fn) { (this.listeners[ev] ||= []).push(fn) }
  removeAllListeners() { this.listeners = {} }
  emit(ev, data) { this.sent.push([ev, data]) }
  connect() { this.connectCalls++ }
  disconnect() { this.connected = false; this.disconnected = true }
  // helpers sisi "server"
  fire(ev, ...a) { (this.listeners[ev] || []).forEach(f => f(...a)) }
  open() { this.connected = true; this.fire('connect') }
  drop(reason) { this.connected = false; this.fire('disconnect', reason) }
}
export const io = (url, opts) => { const s = new FakeSocket(url, opts); sockets.push(s); return s }
