'use strict';

const express = require('express');
const bcrypt  = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { db } = require('../db/database');
const { signToken } = require('./jwt');

const router = express.Router();

// POST /api/auth/register
router.post('/register', async (req, res) => {
  try {
    const { username, password, email } = req.body;

    if (!username || !password)
      return res.status(400).json({ error: 'USERNAME_AND_PASSWORD_REQUIRED' });
    if (username.length < 3 || username.length > 30)
      return res.status(400).json({ error: 'USERNAME_3_TO_30_CHARS' });
    if (password.length < 6)
      return res.status(400).json({ error: 'PASSWORD_MIN_6_CHARS' });
    if (!/^[a-zA-Z0-9_]+$/.test(username))
      return res.status(400).json({ error: 'USERNAME_ALPHANUMERIC_ONLY' });

    const existing = db().prepare('SELECT id FROM users WHERE username = ?').get(username);
    if (existing) return res.status(409).json({ error: 'USERNAME_TAKEN' });

    const hash = await bcrypt.hash(password, 10);
    const id   = uuidv4();

    db().prepare('INSERT INTO users (id, username, email, password_hash) VALUES (?, ?, ?, ?)')
      .run(id, username, email || null, hash);

    const token = signToken({ id, username });
    res.status(201).json({ token, user: { id, username } });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password)
      return res.status(400).json({ error: 'CREDENTIALS_REQUIRED' });

    const user = db().prepare('SELECT * FROM users WHERE username = ?').get(username);
    if (!user) return res.status(401).json({ error: 'INVALID_CREDENTIALS' });

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return res.status(401).json({ error: 'INVALID_CREDENTIALS' });

    const token = signToken({ id: user.id, username: user.username });
    res.json({ token, user: { id: user.id, username: user.username } });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
});

// GET /api/auth/me  (verify token)
router.get('/me', (req, res) => {
  try {
    const auth = req.headers.authorization;
    if (!auth?.startsWith('Bearer ')) return res.status(401).json({ error: 'NO_TOKEN' });
    const { verifyToken } = require('./jwt');
    const payload = verifyToken(auth.slice(7));
    const user = db().prepare('SELECT id, username FROM users WHERE id = ?').get(payload.id);
    if (!user) return res.status(404).json({ error: 'USER_NOT_FOUND' });
    res.json({ user });
  } catch {
    res.status(401).json({ error: 'INVALID_TOKEN' });
  }
});

module.exports = router;
