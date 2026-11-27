'use strict';

/**
 * Every SQL statement on the `users` table (it used to be inline in auth/routes.js). Same statements and argument order as
 * before; input validation, hashing and tokens stay in the routes.
 */
const { db } = require('./database');

/** `{ id }` of the user with exactly this username (case-sensitive), or undefined. */
function findUserIdByUsername(username) {
  return db().prepare('SELECT id FROM users WHERE username = ?').get(username);
}

/** New user row; a missing email is stored as NULL. */
function insertUser(id, username, email, passwordHash) {
  db().prepare('INSERT INTO users (id, username, email, password_hash) VALUES (?, ?, ?, ?)')
    .run(id, username, email || null, passwordHash);
}

/** The full row (including password_hash) for login, or undefined. */
function findUserByUsername(username) {
  return db().prepare('SELECT * FROM users WHERE username = ?').get(username);
}

/** `{ id, username }` only (never the hash), or undefined. */
function findUserById(id) {
  return db().prepare('SELECT id, username FROM users WHERE id = ?').get(id);
}

module.exports = { findUserIdByUsername, insertUser, findUserByUsername, findUserById };
