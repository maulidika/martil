/**
 * Socket event inventory (also runs as the "tools:events" suite of `npm test`):  node scripts/events-check.test.mjs
 *
 * Reads the server (backend/src) and the client (frontend/src) as text and checks that the two sides agree on which events exist:
 *  - every event the server emits has a client listener, except the ones in IGNORED_BY_CLIENT (each with a written reason);
 *  - every client listener has a server emit (a listener nobody can trigger is dead code, e.g. the old `player_joined`);
 *  - every event the server handles is sent by the client, and the client only sends events the server handles;
 *  - the double error channels (leave_room / return_to_room send both `<x>_error` and `error`) are listened to on both sides.
 *
 * Textual check on purpose (no parser, no dependency, works without `npm install`). Event names are read from the FIRST argument of
 * `.emit(`, `socket.on(`, `s.on(` and `onSafe(socket, ...)`; for `cond ? 'a' : 'b'` only the branches count. A name built at runtime
 * is invisible to it, and so are events sent through a variable (client side: any string literal equal to a handled event counts as "sent").
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Socket.IO lifecycle events: nobody emits/handles them by name in our own code.
const CLIENT_LIFECYCLE = ['connect', 'disconnect', 'connect_error'];
const SERVER_LIFECYCLE = ['connection', 'disconnecting'];
// Server events the client intentionally does not listen to. Each entry needs a reason; a stale entry fails the test.
const IGNORED_BY_CLIENT = [
  { event: 'kick_done', why: 'confirmation to the Host who kicked; the client learns the result through room_updated. Part of the Host Kick protocol (asserted by backend/tests/room-code-case.sim.js), so it is kept as is.' },
];

const stripComments = (code) => code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1');

/** Text of the first argument of a call, starting right after its opening parenthesis. */
function firstArg(code, start) {
  let depth = 0, quote = null;
  for (let i = start; i < code.length; i++) {
    const ch = code[i];
    if (quote) { if (ch === '\\') i++; else if (ch === quote) quote = null; continue; }
    if (ch === '\'' || ch === '"' || ch === '`') quote = ch;
    else if ('([{'.includes(ch)) depth++;
    else if (')]}'.includes(ch)) { if (depth === 0) return code.slice(start, i); depth--; }
    else if (ch === ',' && depth === 0) return code.slice(start, i);
  }
  return code.slice(start);
}

/** Event names written as string literals in an argument; for a ternary only the two branches (not the condition). */
function literalNames(expr) {
  const text = expr.includes('?') ? expr.slice(expr.indexOf('?') + 1) : expr;
  return [...text.matchAll(/(['"])([\w:.-]+)\1/g)].map((m) => m[2]);
}

/** Event names passed as the first argument of calls matching `callRe` (the regex must end right after the "("). */
function namesOfCalls(code, callRe) {
  const text = stripComments(code.replace(/\r\n/g, '\n'));
  const out = new Set();
  for (const m of text.matchAll(callRe)) for (const n of literalNames(firstArg(text, m.index + m[0].length))) out.add(n);
  return out;
}
const union = (...sets) => new Set(sets.flatMap((s) => [...s]));

function listFiles(dir, re, out = []) {
  const abs = path.join(ROOT, dir);
  for (const e of fs.readdirSync(abs, { withFileTypes: true })) {
    const rel = `${dir}/${e.name}`;
    if (e.isDirectory()) { if (e.name !== 'node_modules') listFiles(rel, re, out); } else if (re.test(e.name)) out.push(rel);
  }
  return out;
}
const readAll = (files) => files.map((f) => fs.readFileSync(path.join(ROOT, f), 'utf8'));

const serverCode = readAll(listFiles('backend/src', /\.js$/));
const clientCode = readAll(listFiles('frontend/src', /\.jsx?$/));
const payloadJs = fs.readFileSync(path.join(ROOT, 'backend/src/socket/payload.js'), 'utf8');

const errorChannels = (() => {
  const m = /const ERROR_CHANNELS = (\{[\s\S]*?\});/.exec(payloadJs);
  assert.ok(m, 'ERROR_CHANNELS tidak ditemukan di payload.js');
  const map = {};
  for (const e of m[1].matchAll(/(\w+):\s*\[([^\]]*)\]/g)) map[e[1]] = [...e[2].matchAll(/'([\w]+)'/g)].map((x) => x[1]);
  return map;
})();

const serverEmits = union(...serverCode.map((c) => namesOfCalls(c, /\.emit\(/g)), new Set(Object.values(errorChannels).flat()));
const serverHandles = union(...serverCode.map((c) => namesOfCalls(c, /\bonSafe\(\s*socket\s*,/g)), ...serverCode.map((c) => namesOfCalls(c, /\bsocket\.on\(/g)))
const clientListens = union(...clientCode.map((c) => namesOfCalls(c, /\b(?:s|socket)\.on\(/g)));
const clientSendsByCall = union(...clientCode.map((c) => namesOfCalls(c, /\b(?:emitSocket|s\.emit)\(/g)));
const clientLiterals = new Set(clientCode.flatMap((c) => [...stripComments(c).matchAll(/(['"])([\w:.-]+)\1/g)].map((m) => m[2])));
const diff = (a, b) => [...a].filter((x) => !b.has(x)).sort();

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

// ── the readers themselves (fixtures) ────────────────────────────────────────────────────────────────
test('pembaca: nama event dari argumen pertama, termasuk onSafe(socket, ...) dan banyak argumen', () => {
  const code = "io.to(code).emit('a_event', { x: 1 });\nonSafe(socket, 'b_event', (d) => {});\nsocket.on('c_event', () => {});\ns.on('d_event', ({ code }) => {})";
  assert.deepEqual([...namesOfCalls(code, /\.emit\(/g)], ['a_event']);
  assert.deepEqual([...namesOfCalls(code, /\bonSafe\(\s*socket\s*,/g)], ['b_event']);
  assert.deepEqual([...namesOfCalls(code, /\b(?:s|socket)\.on\(/g)].sort(), ['c_event', 'd_event']);
});
test('pembaca: ternary hanya mengambil kedua cabangnya, bukan kondisinya; nama dinamis diabaikan', () => {
  assert.deepEqual([...namesOfCalls("other.emit(result.mode === 'result' ? 'kicked_from_result' : 'kicked', { roomCode: code });", /\.emit\(/g)].sort(), ['kicked', 'kicked_from_result']);
  assert.deepEqual([...namesOfCalls('socket.emit(channel, { code });', /\.emit\(/g)], []);
  assert.deepEqual([...namesOfCalls('socket.emit(`x_${y}`, 1);', /\.emit\(/g)], []);
});
test('pembaca: komentar diabaikan, CRLF dan tanda kurung bersarang tidak merusak', () => {
  assert.deepEqual([...namesOfCalls("// socket.emit('ghost', 1)\n/* s.on('ghost2') */\r\nsocket.emit('real', fn(a, b), [1, 2]);", /\.emit\(/g)], ['real']);
  assert.deepEqual([...namesOfCalls("socket.emit(pick(a, 'x_y'), 1)", /\.emit\(/g)], ['x_y']);
});

// ── the real code ────────────────────────────────────────────────────────────────────────────────────
test('inventaris terbaca: kedua sisi punya event (bukan lulus karena kosong)', () => {
  for (const [name, set] of [['serverEmits', serverEmits], ['serverHandles', serverHandles], ['clientListens', clientListens]]) assert.ok(set.size >= 8, `${name}: ${set.size}`);
  for (const ev of ['room_updated', 'game_state', 'error']) { assert.ok(serverEmits.has(ev), ev); assert.ok(clientListens.has(ev), ev); }
  assert.ok(serverEmits.has('kicked') && serverEmits.has('kicked_from_result'), 'ternary kick harus terbaca');
});

test('setiap event yang dikirim server didengarkan klien (kecuali IGNORED_BY_CLIENT)', () => {
  const ignored = new Set(IGNORED_BY_CLIENT.map((i) => i.event));
  assert.deepEqual(diff(serverEmits, clientListens).filter((e) => !ignored.has(e)), [], 'server mengirim event yang tidak didengarkan klien: tambah listener, atau daftarkan di IGNORED_BY_CLIENT dengan alasan');
});

test('setiap listener klien punya pengirim di server (tanpa listener mati)', () => {
  assert.deepEqual(diff(clientListens, serverEmits).filter((e) => !CLIENT_LIFECYCLE.includes(e)), [], 'listener klien untuk event yang tidak pernah dikirim server');
});

test('setiap event yang ditangani server dikirim klien', () => {
  assert.deepEqual(diff(serverHandles, clientLiterals).filter((e) => !SERVER_LIFECYCLE.includes(e)), [], 'server menangani event yang tidak pernah dikirim klien');
});

test('klien hanya mengirim event yang ditangani server', () => {
  assert.deepEqual(diff(clientSendsByCall, serverHandles), []);
});

test('kanal error ganda (leave_room, return_to_room: <x>_error dan error): tetap dua kanal dan didengarkan klien di keduanya', () => {
  for (const ev of ['leave_room', 'return_to_room']) {
    assert.equal(errorChannels[ev].length, 2, `${ev}: ${errorChannels[ev]}`);
    assert.ok(errorChannels[ev].includes('error'), ev);
    for (const ch of errorChannels[ev]) assert.ok(clientListens.has(ch), `klien tidak mendengarkan ${ch}`);
  }
  assert.deepEqual(errorChannels.kick_player, ['kick_error']);
});

test('IGNORED_BY_CLIENT tidak basi: tiap entri punya alasan, masih dikirim server, dan masih tidak didengarkan klien', () => {
  for (const i of IGNORED_BY_CLIENT) {
    assert.ok(i.why.length > 30, `${i.event}: alasan wajib ditulis`);
    assert.ok(serverEmits.has(i.event), `${i.event}: server tidak mengirimnya lagi: hapus dari IGNORED_BY_CLIENT`);
    assert.ok(!clientListens.has(i.event), `${i.event}: klien kini mendengarkannya: hapus dari IGNORED_BY_CLIENT`);
  }
});

let failed = 0;
for (const t of tests) {
  try { t.fn(); console.log(`  PASS  ${t.name}`); } catch (e) {
    failed += 1;
    console.log(`  FAIL  ${t.name}\n        ${String(e.stack || e.message).split('\n').slice(0, 8).join('\n        ')}`);
  }
}
console.log(`\n${tests.length - failed}/${tests.length} lulus`);
process.exit(failed ? 1 : 0);
