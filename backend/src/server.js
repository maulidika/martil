/**
 * server.js — Martil backend entry point
 */

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const dotenv = require('dotenv');

dotenv.config();

const authRoutes = require('./auth/routes');
const registerSocketHandlers = require('./socket/socketHandler');

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: process.env.CLIENT_URL || 'http://localhost:5173',
    credentials: true,
  },
});

app.use(cors({ origin: process.env.CLIENT_URL || 'http://localhost:5173', credentials: true }));
app.use(express.json());

app.use('/api/auth', authRoutes);
app.get('/health', (_, res) => res.json({ ok: true }));

registerSocketHandlers(io);

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => console.log(`Martil server running on :${PORT}`));

module.exports = { app, server };
