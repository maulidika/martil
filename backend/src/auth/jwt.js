'use strict';

const fs = require('fs');
const jwt = require('jsonwebtoken');

// Public development fallback (it is in the repo, so it is NOT a secret). Never accepted in production.
const DEV_FALLBACK_SECRET = 'martil-dev-secret';

class ConfigError extends Error {}

/**
 * Decide which signing secret to use from an env-like object. Pure: no logging, no process.exit.
 *  - NODE_ENV=production: JWT_SECRET is required (empty/whitespace-only/the dev fallback is rejected -> ConfigError).
 *  - anything else (including NODE_ENV unset): JWT_SECRET is used if present, otherwise the dev fallback.
 * Error messages never contain the secret value.
 */
function resolveSecret(env = process.env) {
  const value = typeof env.JWT_SECRET === 'string' ? env.JWT_SECRET : '';
  const present = value.trim() !== '';
  const production = String(env.NODE_ENV || '').trim().toLowerCase() === 'production';

  if (production) {
    if (!present) {
      throw new ConfigError('JWT_SECRET is required when NODE_ENV=production. Set it in backend/.env (see backend/.env.example).');
    }
    if (value.trim() === DEV_FALLBACK_SECRET) {
      throw new ConfigError('JWT_SECRET must not be the built-in development value when NODE_ENV=production.');
    }
    return { secret: value, usedFallback: false };
  }
  if (!present) return { secret: DEV_FALLBACK_SECRET, usedFallback: true };
  return { secret: value, usedFallback: false };
}

// Short message, exit code 1, no stack trace. fs.writeSync keeps the message from being lost on exit.
function failFast(message) {
  const line = `[config] FATAL: ${message}\n`;
  try { fs.writeSync(2, line); } catch { console.error(line.trimEnd()); }
  process.exit(1);
}

// Runs once per process (module load). dotenv.config() in server.js must run before this module is required.
function initSecret() {
  try {
    const { secret, usedFallback } = resolveSecret(process.env);
    if (usedFallback) {
      console.warn('[config] WARNING: JWT_SECRET is not set; using the built-in development secret. Local development only: set JWT_SECRET in backend/.env.');
    }
    return secret;
  } catch (e) {
    if (e instanceof ConfigError) failFast(e.message);
    throw e;
  }
}

const SECRET = initSecret();

function signToken(payload) {
  return jwt.sign(payload, SECRET, { expiresIn: '7d' });
}

function verifyToken(token) {
  return jwt.verify(token, SECRET);
}

module.exports = { signToken, verifyToken, resolveSecret, ConfigError };
