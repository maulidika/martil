'use strict';
/**
 * S6: every SQL statement on `users` lives in src/db/userStore.js; src/auth/routes.js only validates, hashes and signs tokens.
 * This is also the first test of the routes themselves: the REAL routes.js and userStore.js run against the REAL in-memory SQLite
 * (helpers/memdb.js); express, bcryptjs and the JWT module are small fakes, so it runs without `npm install`.
 *   npm run test:authroutes      (from the backend folder)
 *
 * Behavior pinned here is the CURRENT behavior. In particular usernames are case-sensitive ('Bob' and 'bob' are two accounts);
 * the decision about case-insensitive usernames is still open, so that test is named as such and is the one to update with it.
 */
const Module = require('module');
const path = require('path');
const assert = require('node:assert/strict');
const memdb = require('./helpers/memdb');

const SRC = path.join(__dirname, '../src');
function stub(rel, exports) { const f = require.resolve(path.join(SRC, rel)); require.cache[f] = { id: f, filename: f, loaded: true, exports }; }
stub('db/database.js', { db: () => memdb.handle() });
stub('auth/jwt.js', {
  signToken: (p) => `T:${JSON.stringify(p)}`,
  verifyToken: (t) => { if (!String(t).startsWith('T:')) throw new Error('bad token'); return JSON.parse(String(t).slice(2)); },
});
const fakeRouter = { routes: {}, post(p, h) { this.routes[`POST ${p}`] = h; }, get(p, h) { this.routes[`GET ${p}`] = h; } };
let uuidN = 0; let failHash = false;
const origLoad = Module._load;
Module._load = function (request, ...rest) {
  if (request === 'express') return { Router: () => fakeRouter };
  if (request === 'bcryptjs') return { hash: async (p) => { if (failHash) throw new Error('hash down'); return `hash:${p}`; }, compare: async (p, h) => h === `hash:${p}` };
  if (request === 'uuid') return { v4: () => `uid-${++uuidN}` };
  return origLoad.call(this, request, ...rest);
};
const router = require('../src/auth/routes');
const users = require('../src/db/userStore');
const realLog = console.log; console.error = () => {};

async function call(route, { body = {}, headers = {} } = {}) {
  const res = { statusCode: 200, body: undefined, status(c) { this.statusCode = c; return this; }, json(b) { this.body = b; return this; } };
  await router.routes[route]({ body, headers }, res);
  return res;
}
const rows = () => memdb.handle().prepare('SELECT * FROM users').all().map((r) => ({ ...r }));
const register = (username = 'alice', password = 'secret1', extra = {}) => call('POST /register', { body: { username, password, ...extra } });

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

// ── userStore ────────────────────────────────────────────────────────────────────────────────────────
test('userStore: insertUser menyimpan baris; email kosong jadi NULL, email terisi disimpan', () => {
  users.insertUser('a', 'alice', undefined, 'h1'); users.insertUser('b', 'bob', '', 'h2'); users.insertUser('c', 'carol', 'c@x.io', 'h3');
  assert.deepEqual(rows().map((r) => [r.id, r.username, r.email, r.password_hash]), [['a', 'alice', null, 'h1'], ['b', 'bob', null, 'h2'], ['c', 'carol', 'c@x.io', 'h3']]);
});
test('userStore: findUserIdByUsername cocok persis (peka huruf besar/kecil), hanya { id }', () => {
  users.insertUser('a', 'alice', null, 'h');
  assert.deepEqual({ ...users.findUserIdByUsername('alice') }, { id: 'a' });
  assert.equal(users.findUserIdByUsername('Alice'), undefined); assert.equal(users.findUserIdByUsername('nobody'), undefined);
});
test('userStore: findUserByUsername memberi baris penuh (termasuk password_hash); findUserById hanya id dan username', () => {
  users.insertUser('a', 'alice', 'a@x.io', 'secret-hash');
  const full = users.findUserByUsername('alice');
  assert.equal(full.password_hash, 'secret-hash'); assert.equal(full.email, 'a@x.io');
  assert.deepEqual({ ...users.findUserById('a') }, { id: 'a', username: 'alice' });
  assert.equal(users.findUserById('zzz'), undefined); assert.equal(users.findUserByUsername('zzz'), undefined);
});
test('userStore: username kembar ditolak oleh UNIQUE (perilaku DB saat ini)', () => {
  users.insertUser('a', 'alice', null, 'h');
  assert.throws(() => users.insertUser('b', 'alice', null, 'h'), /UNIQUE/i);
  assert.equal(rows().length, 1); assert.equal(memdb.takeErrors().length, 1);
});

// ── routes ───────────────────────────────────────────────────────────────────────────────────────────
test('register: 201 + token + { id, username }; baris tersimpan dengan hash (bukan password)', async () => {
  const res = await register('alice', 'secret1', { email: 'a@x.io' });
  assert.equal(res.statusCode, 201);
  assert.deepEqual(res.body, { token: 'T:{"id":"uid-1","username":"alice"}', user: { id: 'uid-1', username: 'alice' } });
  assert.deepEqual(rows().map((r) => [r.id, r.username, r.email, r.password_hash]), [['uid-1', 'alice', 'a@x.io', 'hash:secret1']]);
});
test('register: username sudah dipakai -> 409 USERNAME_TAKEN dan tidak ada baris kedua', async () => {
  await register('alice');
  const res = await register('alice', 'other-pass');
  assert.equal(res.statusCode, 409); assert.deepEqual(res.body, { error: 'USERNAME_TAKEN' }); assert.equal(rows().length, 1);
});
test('register: validasi: 400 dengan kode yang tepat dan tidak ada baris', async () => {
  const cases = [
    [{}, 'USERNAME_AND_PASSWORD_REQUIRED'], [{ username: 'alice' }, 'USERNAME_AND_PASSWORD_REQUIRED'], [{ password: 'secret1' }, 'USERNAME_AND_PASSWORD_REQUIRED'],
    [{ username: 'ab', password: 'secret1' }, 'USERNAME_3_TO_30_CHARS'], [{ username: 'a'.repeat(31), password: 'secret1' }, 'USERNAME_3_TO_30_CHARS'],
    [{ username: 'alice', password: '12345' }, 'PASSWORD_MIN_6_CHARS'], [{ username: 'al ice', password: 'secret1' }, 'USERNAME_ALPHANUMERIC_ONLY'],
    [{ username: 'al-ice', password: 'secret1' }, 'USERNAME_ALPHANUMERIC_ONLY'],
  ];
  for (const [body, error] of cases) { const res = await call('POST /register', { body }); assert.equal(res.statusCode, 400, JSON.stringify(body)); assert.deepEqual(res.body, { error }, JSON.stringify(body)); }
  assert.equal(rows().length, 0);
});
test('register: batas panjang 3 dan 30 karakter diterima', async () => {
  assert.equal((await register('abc')).statusCode, 201); assert.equal((await register('a'.repeat(30))).statusCode, 201);
});
test('register: kegagalan di dalam (hash) -> 500 INTERNAL_ERROR dan tidak ada baris', async () => {
  failHash = true;
  try { const res = await register(); assert.equal(res.statusCode, 500); assert.deepEqual(res.body, { error: 'INTERNAL_ERROR' }); assert.equal(rows().length, 0); } finally { failHash = false; }
});
test('register: username peka huruf besar/kecil: Bob dan bob dua akun (perilaku saat ini; keputusan case-insensitive masih menunggu)', async () => {
  assert.equal((await register('Bob')).statusCode, 201); assert.equal((await register('bob')).statusCode, 201); assert.equal(rows().length, 2);
});

test('login: berhasil -> 200 token + { id, username } (tanpa hash)', async () => {
  await register('alice', 'secret1');
  const res = await call('POST /login', { body: { username: 'alice', password: 'secret1' } });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { token: 'T:{"id":"uid-1","username":"alice"}', user: { id: 'uid-1', username: 'alice' } });
});
test('login: password salah dan username tak dikenal sama-sama 401 INVALID_CREDENTIALS', async () => {
  await register('alice', 'secret1');
  for (const body of [{ username: 'alice', password: 'wrong-pass' }, { username: 'nobody', password: 'secret1' }, { username: 'Alice', password: 'secret1' }]) {
    const res = await call('POST /login', { body }); assert.equal(res.statusCode, 401); assert.deepEqual(res.body, { error: 'INVALID_CREDENTIALS' });
  }
});
test('login: field kosong -> 400 CREDENTIALS_REQUIRED', async () => {
  for (const body of [{}, { username: 'alice' }, { password: 'secret1' }]) { const res = await call('POST /login', { body }); assert.equal(res.statusCode, 400); assert.deepEqual(res.body, { error: 'CREDENTIALS_REQUIRED' }); }
});

test('me: token valid -> { user: { id, username } } saja (tidak ada password_hash atau email)', async () => {
  await register('alice', 'secret1', { email: 'a@x.io' });
  const res = await call('GET /me', { headers: { authorization: 'Bearer T:{"id":"uid-1","username":"alice"}' } });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(JSON.parse(JSON.stringify(res.body)), { user: { id: 'uid-1', username: 'alice' } });   // what Express sends (node:sqlite rows have no prototype)
  assert.deepEqual(Object.keys(res.body.user).sort(), ['id', 'username']);
});
test('me: tanpa header Bearer -> 401 NO_TOKEN; token rusak -> 401 INVALID_TOKEN; user sudah tidak ada -> 404 USER_NOT_FOUND', async () => {
  let res = await call('GET /me', { headers: {} }); assert.equal(res.statusCode, 401); assert.deepEqual(res.body, { error: 'NO_TOKEN' });
  res = await call('GET /me', { headers: { authorization: 'Basic abc' } }); assert.deepEqual(res.body, { error: 'NO_TOKEN' });
  res = await call('GET /me', { headers: { authorization: 'Bearer garbage' } }); assert.equal(res.statusCode, 401); assert.deepEqual(res.body, { error: 'INVALID_TOKEN' });
  res = await call('GET /me', { headers: { authorization: 'Bearer T:{"id":"ghost","username":"x"}' } }); assert.equal(res.statusCode, 404); assert.deepEqual(res.body, { error: 'USER_NOT_FOUND' });
});

(async () => {
  let failed = 0;
  for (const { name, fn } of tests) {
    memdb.fresh(); memdb.takeErrors(); uuidN = 0;
    try {
      await fn();
      const errs = memdb.takeErrors(); if (errs.length) throw new Error(`error SQL tertelan oleh server selama skenario:\n  ${errs.join('\n  ')}`);
      realLog(`  PASS  ${name}`);
    } catch (e) { failed += 1; realLog(`  FAIL  ${name}\n        ${String(e.stack || e.message).split('\n').slice(0, 6).join('\n        ')}`); }
  }
  realLog(`\n${tests.length - failed}/${tests.length} lulus`); process.exit(failed ? 1 : 0);
})();
