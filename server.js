'use strict';

require('dotenv').config();

const express = require('express');
const http    = require('http');
const { Server } = require('socket.io');
const cors    = require('cors');

const authRoutes = require('./auth/routes');
const registerSocketHandlers = require('./socket/socketHandler');

const app    = express();
const server = http.createServer(app);
const PORT   = process.env.PORT || 3001;
const CLIENT = process.env.CLIENT_URL || 'http://localhost:5173';

const io = new Server(server, {
  cors: { origin: CLIENT, credentials: true },
});

app.use(cors({ origin: CLIENT, credentials: true }));
app.use(express.json());

app.use('/api/auth', authRoutes);
app.get('/health', (_req, res) => res.json({ ok: true, ts: Date.now() }));

registerSocketHandlers(io);

server.listen(PORT, () => {
  console.log(`\n🃏  Martil server running → http://localhost:${PORT}\n`);
});

module.exports = { app, server };
