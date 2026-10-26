const { io } = require('socket.io-client');
const SERVER = 'http://localhost:3001';
const users = [
  { username: 'trace1', password: 'password123' },
  { username: 'trace2', password: 'password123' },
  { username: 'trace3', password: 'password123' },
  { username: 'trace4', password: 'password123' },
];
async function register(user) {
  const res = await fetch(`${SERVER}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: user.username, password: user.password, email: `${user.username}@example.com` }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(data));
  return data;
}
async function connectClient(token, label) {
  const socket = io(SERVER, { auth: { token }, transports: ['websocket'], forceNew: true });
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} connect timeout`)), 5000);
    socket.once('connect', () => { clearTimeout(timer); resolve(); });
    socket.once('connect_error', (err) => { clearTimeout(timer); reject(err); });
  });
  console.log(`${label} connected`);
  return socket;
}
(async () => {
  const auths = [];
  for (const user of users) auths.push(await register(user));
  const sockets = [];
  for (let i = 0; i < auths.length; i++) {
    const socket = await connectClient(auths[i].token, `client${i + 1}`);
    sockets.push(socket);
  }
  const host = sockets[0];
  const roomCode = await new Promise((resolve) => {
    host.once('room_created', (payload) => resolve(payload.code));
    host.emit('create_room', { maxGames: 4 });
  });
  console.log('room created', roomCode);
  for (let i = 1; i < sockets.length; i++) {
    const socket = sockets[i];
    await new Promise((resolve) => {
      socket.once('room_updated', () => resolve());
      socket.emit('join_room', { roomCode });
    });
  }
  await new Promise((resolve) => {
    host.once('game_started', () => resolve());
    host.emit('start_game', { roomCode });
  });
  setTimeout(() => {
    sockets.forEach((s) => s.disconnect());
    process.exit(0);
  }, 2000);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
