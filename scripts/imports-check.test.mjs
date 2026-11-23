/**
 * Unused-import guard (also runs as the "tools:imports" suite of `npm test`):
 *   node scripts/imports-check.test.mjs
 *
 * Every name brought in by `import ... from` (frontend/src) or `const ... = require(...)` (backend/src) must be referenced
 * at least once in the rest of the file. A textual check on purpose: no parser and no dependency, so it also runs in a
 * checkout without `npm install`.
 *
 * Known limits (a mutation that slips through them is not caught):
 *   - a name that only appears in a string, a JSX text or as an object key still counts as "used";
 *   - a shadowed name counts as "used";
 *   - comments are stripped before searching, so a name that only appears in a comment IS reported.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SCAN = [
  { dir: 'frontend/src', file: /\.(jsx?|mjs)$/, kind: 'esm' },
  { dir: 'backend/src', file: /\.js$/, kind: 'cjs' },
];
// Imports that are intentionally "unused". Each entry must still match a real import (see the last real-tree test).
const ALLOWED_UNUSED = [
  {
    name: 'React', from: 'react',
    why: 'Vite compiles JSX with the automatic runtime, but the render harnesses in frontend/tests build the real pages with '
      + 'esbuild `jsx: "transform"` (classic), which needs `React` in scope. Removing it breaks combo-ui, kick-ui and lobby-ui.',
  },
];

const IMPORT_RE = /^[ \t]*import\s+([^'";]+?)\s+from\s+['"]([^'"]+)['"][ \t]*;?[ \t]*$/gm;
const REQUIRE_RE = /^(?:const|let|var)\s+(\{[^}]*\}|[\w$]+)\s*=\s*require\(\s*['"]([^'"]+)['"]\s*\)[^;\n]*;/gm;

const stripComments = (code) => code
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1');
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const isUsed = (name, body) => new RegExp(`(?<![\\w$.])${escapeRe(name)}(?![\\w$])`).test(body);

function esmNames(clause) {
  const names = [];
  const ns = /\*\s*as\s+([\w$]+)/.exec(clause);
  if (ns) names.push(ns[1]);
  const braces = /\{([^}]*)\}/.exec(clause);
  if (braces) for (const part of braces[1].split(',')) {
    const p = part.trim();
    if (p) names.push(p.includes(' as ') ? p.split(/\s+as\s+/)[1].trim() : p);
  }
  const rest = clause.replace(/\{[^}]*\}/, '').replace(/\*\s*as\s+[\w$]+/, '');
  for (const part of rest.split(',')) if (part.trim()) names.push(part.trim());
  return names;
}

function cjsNames(target) {
  if (!target.startsWith('{')) return [target];
  return target.slice(1, -1).split(',').map((p) => p.trim()).filter(Boolean)
    .map((p) => (p.includes(':') ? p.split(':')[1] : p).split('=')[0].trim());
}

/** Names imported/required in `code` that are never referenced again: [{ name, from }]. */
function findUnusedImports(code, kind) {
  const text = code.replace(/\r\n/g, '\n');
  const decls = [];
  const re = kind === 'esm' ? IMPORT_RE : REQUIRE_RE;
  const body = stripComments(text.replace(re, (_m, target, from) => {
    for (const name of (kind === 'esm' ? esmNames(target) : cjsNames(target))) decls.push({ name, from });
    return '';
  }));
  return decls.filter((d) => !isUsed(d.name, body));
}

function listFiles(dir, re, out = []) {
  for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    const rel = `${dir}/${e.name}`;
    if (e.isDirectory()) { if (e.name !== 'node_modules') listFiles(rel, re, out); } else if (re.test(e.name)) out.push(rel);
  }
  return out;
}

function scan({ dir, file, kind }) {
  const files = listFiles(dir, file);
  const unused = [];
  for (const rel of files) {
    for (const d of findUnusedImports(fs.readFileSync(path.join(ROOT, rel), 'utf8'), kind)) unused.push({ file: rel, ...d });
  }
  return { files, unused };
}
const isAllowed = (u) => ALLOWED_UNUSED.some((a) => a.name === u.name && a.from === u.from);

const tests = [];
const test = (name, fn) => tests.push({ name, fn });
const names = (code, kind = 'esm') => findUnusedImports(code, kind).map((d) => d.name);

// ── the checker itself (fixtures) ────────────────────────────────────────────────────────────────────
test('pemeriksa: import yang dipakai tidak dilaporkan, import yang tidak dipakai dilaporkan', () => {
  assert.deepEqual(names("import { a, b } from './x'\nconsole.log(a)\n"), ['b']);
  assert.deepEqual(names("import { a, b } from './x'\nconsole.log(a, b)\n"), []);
});

test('pemeriksa: import default, namespace, dan campuran', () => {
  assert.deepEqual(names("import D from './d'\nimport * as NS from './n'\nimport E, { f } from './e'\nD(); NS.go(); E(); f()\n"), []);
  assert.deepEqual(names("import D from './d'\nimport * as NS from './n'\nimport E, { f } from './e'\nE()\n"), ['D', 'NS', 'f']);
});

test('pemeriksa: alias (a as b) diukur lewat nama lokalnya', () => {
  assert.deepEqual(names("import { a as b } from './x'\nconsole.log(a)\n"), ['b']);
  assert.deepEqual(names("import { a as b } from './x'\nconsole.log(b)\n"), []);
});

test('pemeriksa: import beberapa baris dan import tanpa nama (side-effect) ditangani', () => {
  assert.deepEqual(names("import {\n  a,\n  b,\n} from './x'\nimport './style.css'\nuse(b)\n"), ['a']);
});

test('pemeriksa: komponen yang hanya dipakai di JSX dihitung terpakai', () => {
  assert.deepEqual(names("import Modal from './Modal'\nconst x = <Modal open />\n"), []);
});

test('pemeriksa: nama yang hanya ada di komentar atau sebagai properti objek lain (obj.nama) dilaporkan', () => {
  assert.deepEqual(names("import { a } from './x'\n// a is mentioned here\n/* and a here */\n"), ['a']);
  assert.deepEqual(names("import { a } from './x'\nconsole.log(obj.a)\n"), ['a']);
});

test('pemeriksa: URL di dalam string tidak dianggap komentar', () => {
  assert.deepEqual(names("import { a } from './x'\nconst u = 'http://host/'; a()\n"), []);
});

test('pemeriksa: require (CommonJS): nama langsung, destructuring, rename, dan require(...).prop', () => {
  const src = "const fs = require('fs');\nconst { a, b: c, d } = require('./x');\nconst e = require('./y').e;\nfs.read(); a(); e();\n";
  assert.deepEqual(names(src, 'cjs'), ['c', 'd']);
  assert.deepEqual(names("const {\n  a,\n  b,\n} = require('./x');\nb();\n", 'cjs'), ['a']);
});

test('pemeriksa: CRLF tidak mengubah hasil', () => {
  assert.deepEqual(names("import { a, b } from './x'\r\nconsole.log(a)\r\n"), ['b']);
});

// ── the real tree ────────────────────────────────────────────────────────────────────────────────────
for (const root of SCAN) {
  test(`${root.dir}: tidak ada import yang tidak terpakai`, () => {
    const { files, unused } = scan(root);
    assert.ok(files.length > 0, `tidak ada berkas ditemukan di ${root.dir}`);
    const bad = unused.filter((u) => !isAllowed(u));
    assert.deepEqual(bad.map((u) => `${u.file}: '${u.name}' dari '${u.from}'`), [], 'import tidak terpakai: hapus, atau (dengan alasan tertulis) tambahkan ke ALLOWED_UNUSED');
  });
}

test('pengecualian ALLOWED_UNUSED masih dipakai: tiap entri cocok dengan import nyata (entri basi harus dihapus)', () => {
  const all = SCAN.flatMap((root) => scan(root).unused);
  for (const a of ALLOWED_UNUSED) {
    assert.ok(a.why.length > 20, `${a.name}: alasan wajib ditulis`);
    assert.ok(all.some((u) => u.name === a.name && u.from === a.from), `pengecualian '${a.name}' dari '${a.from}' tidak cocok dengan import mana pun lagi: hapus dari ALLOWED_UNUSED`);
  }
});

// ── runner ───────────────────────────────────────────────────────────────────────────────────────────
let failed = 0;
for (const t of tests) {
  try { t.fn(); console.log(`  PASS  ${t.name}`); } catch (e) {
    failed += 1;
    console.log(`  FAIL  ${t.name}\n        ${String(e.stack || e.message).split('\n').slice(0, 8).join('\n        ')}`);
  }
}
console.log(`\n${tests.length - failed}/${tests.length} lulus`);
process.exit(failed ? 1 : 0);
