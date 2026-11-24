/**
 * Dependency guard (also runs as the "tools:deps" suite of `npm test`):  node scripts/deps-check.test.mjs
 *
 *  - every dependency declared in backend/ and frontend/package.json is used (imported somewhere in that folder, or named in
 *    one of its `scripts`, which covers CLI tools such as nodemon, jest and vite);
 *  - every package imported by the source code (src, vite.config.js, trace-sockets.js) is declared;
 *  - no dependency points at a local path (`file:`, `link:`), neither in package.json nor as a link in the lockfile;
 *  - package-lock.json matches package.json (dependencies, devDependencies, engines);
 *  - root and backend `engines.node` exist, are equal, and match the Node.js version the README names as prerequisite.
 *
 * Textual check on purpose (no parser, no dependency, works without `npm install`). Limits: a package that is only
 * mentioned in a string or regex literal still counts as "used"; comments are stripped first.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { builtinModules } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const readJson = (rel) => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));

// Packages that are used without being imported or named in a script. Each entry needs a written reason.
const ALLOWED_UNUSED = [];

const stripComments = (code) => code
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1');

const SPECIFIER_RES = [
  /\brequire\(\s*['"]([^'"\n]+)['"]\s*\)/g,
  /\bimport\(\s*['"]([^'"\n]+)['"]\s*\)/g,
  /\bfrom\s*['"]([^'"\n]+)['"]/g,
  /\bimport\s*['"]([^'"\n]+)['"]/g,
];
const BUILTINS = new Set(builtinModules);

/** Package names (not subpaths, not builtins, not relative paths) imported by `code`. */
function externalImports(code) {
  const text = stripComments(code.replace(/\r\n/g, '\n'));
  const found = new Set();
  for (const re of SPECIFIER_RES) {
    for (const m of text.matchAll(re)) {
      const spec = m[1];
      if (spec.startsWith('.') || spec.startsWith('/') || spec.startsWith('node:')) continue;
      const name = spec.startsWith('@') ? spec.split('/').slice(0, 2).join('/') : spec.split('/')[0];
      if (!BUILTINS.has(name)) found.add(name);
    }
  }
  return found;
}

/** True when `name` appears as a command word in one of the package.json scripts. */
function namedInScripts(name, scripts = {}) {
  const re = new RegExp(`(^|[\\s&|;])${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?=$|[\\s&|;])`);
  return Object.values(scripts).some((cmd) => re.test(cmd));
}

function listFiles(dir, out = []) {
  const abs = path.join(ROOT, dir);
  if (!fs.existsSync(abs)) return out;
  for (const e of fs.readdirSync(abs, { withFileTypes: true })) {
    const rel = `${dir}/${e.name}`;
    if (e.isDirectory()) { if (e.name !== 'node_modules') listFiles(rel, out); } else if (/\.(c|m)?jsx?$/.test(e.name)) out.push(rel);
  }
  return out;
}
const importsOf = (files) => {
  const all = new Set();
  for (const f of files) for (const n of externalImports(fs.readFileSync(path.join(ROOT, f), 'utf8'))) all.add(n);
  return all;
};

// Each package: where its code lives. `source` = what ships/runs (checked for undeclared imports); `all` also counts
// tests and tooling when deciding whether a declared dependency is used.
const PACKAGES = [
  { dir: 'backend', source: [...listFiles('backend/src')], tests: [...listFiles('backend/tests')] },
  {
    dir: 'frontend',
    source: [...listFiles('frontend/src'), ...['frontend/vite.config.js', 'frontend/trace-sockets.js'].filter((f) => fs.existsSync(path.join(ROOT, f)))],
    tests: [...listFiles('frontend/tests')],
  },
];

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

// ── the checker itself (fixtures) ────────────────────────────────────────────────────────────────────
test('pemeriksa: require, import (satu/banyak baris), import dinamis, export-from, dan import tanpa nama terbaca', () => {
  const code = [
    "const a = require('alpha')", "import b from 'beta'", "import {\n  c,\n  d,\n} from 'gamma'",
    "const e = await import('delta')", "export { f } from 'epsilon'", "import 'zeta/side-effect'",
  ].join('\n');
  assert.deepEqual([...externalImports(code)].sort(), ['alpha', 'beta', 'delta', 'epsilon', 'gamma', 'zeta']);
});

test('pemeriksa: subpath dan paket ber-scope diperlakukan sebagai paket induknya', () => {
  assert.deepEqual([...externalImports("import x from 'react-dom/client'\nimport y from '@vitejs/plugin-react'\nimport z from '@scope/pkg/deep/file'")].sort(),
    ['@scope/pkg', '@vitejs/plugin-react', 'react-dom']);
});

test('pemeriksa: builtin, node:, dan path relatif diabaikan', () => {
  assert.deepEqual([...externalImports("require('fs'); require('node:sqlite'); require('./x'); require('../y'); import p from 'path'; import q from '/abs'")], []);
});

test('pemeriksa: komentar tidak dihitung, URL di dalam string tidak merusak', () => {
  assert.deepEqual([...externalImports("// require('ghost')\n/* import x from 'ghost2' */\nconst u = 'http://host/'; require('real')")], ['real']);
});

test('pemeriksa: CRLF tidak mengubah hasil', () => {
  assert.deepEqual([...externalImports("const a = require('alpha')\r\nimport b from 'beta'\r\n")].sort(), ['alpha', 'beta']);
});

test('pemeriksa: nama di scripts dikenali sebagai kata perintah, bukan potongan kata', () => {
  assert.equal(namedInScripts('nodemon', { dev: 'nodemon src/server.js' }), true);
  assert.equal(namedInScripts('jest', { 'test:jest': 'jest' }), true);
  assert.equal(namedInScripts('vite', { dev: 'cd x && vite --host' }), true);
  assert.equal(namedInScripts('vite', { dev: 'vitest' }), false);
  assert.equal(namedInScripts('jest', { t: 'node tests/jest-shim.js' }), false);
  assert.equal(namedInScripts('nodemon', {}), false);
});

// ── the real tree ────────────────────────────────────────────────────────────────────────────────────
for (const pkgInfo of PACKAGES) {
  const pkg = readJson(`${pkgInfo.dir}/package.json`);
  const declared = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };

  test(`${pkgInfo.dir}: tiap dependency yang dideklarasikan dipakai (diimpor, atau disebut di scripts)`, () => {
    assert.ok(pkgInfo.source.length > 0, `tidak ada berkas sumber di ${pkgInfo.dir}`);
    const used = importsOf([...pkgInfo.source, ...pkgInfo.tests]);
    const unused = Object.keys(declared).filter((n) => !used.has(n) && !namedInScripts(n, pkg.scripts) && !ALLOWED_UNUSED.some((a) => a.name === n));
    assert.deepEqual(unused, [], `dependency tak terpakai di ${pkgInfo.dir}/package.json: hapus, atau tambahkan ke ALLOWED_UNUSED dengan alasan`);
  });

  test(`${pkgInfo.dir}: tiap paket yang diimpor kode sumber dideklarasikan di package.json`, () => {
    const missing = [...importsOf(pkgInfo.source)].filter((n) => !(n in declared)).sort();
    assert.deepEqual(missing, [], `diimpor tetapi tidak ada di ${pkgInfo.dir}/package.json`);
  });

  test(`${pkgInfo.dir}: tidak ada dependency ke path lokal (file:, link:) di package.json maupun lockfile`, () => {
    const local = Object.entries(declared).filter(([, v]) => /^(file:|link:|\.{1,2}[\\/])/.test(v)).map(([n, v]) => `${n}@${v}`);
    assert.deepEqual(local, []);
    const lock = readJson(`${pkgInfo.dir}/package-lock.json`);
    const links = Object.entries(lock.packages).filter(([, v]) => v.link).map(([k]) => k);
    assert.deepEqual(links, [], 'lockfile berisi link lokal');
    assert.deepEqual(Object.keys(lock.packages).filter((k) => k.startsWith('..')), [], 'lockfile berisi entri di luar folder');
  });

  test(`${pkgInfo.dir}: package-lock.json sesuai package.json (dependencies, devDependencies, engines)`, () => {
    const root = readJson(`${pkgInfo.dir}/package-lock.json`).packages[''];
    assert.deepEqual(root.dependencies || {}, pkg.dependencies || {}, 'dependencies beda: jalankan npm install');
    assert.deepEqual(root.devDependencies || {}, pkg.devDependencies || {}, 'devDependencies beda: jalankan npm install');
    assert.deepEqual(root.engines || {}, pkg.engines || {}, 'engines beda: jalankan npm install');
    assert.equal(root.name, pkg.name);
    assert.equal(root.version, pkg.version);
  });
}

test('engines.node ada di root dan backend, sama, dan sesuai prasyarat Node.js di README', () => {
  const rootEng = readJson('package.json').engines?.node;
  const backEng = readJson('backend/package.json').engines?.node;
  assert.ok(rootEng, 'package.json root belum punya engines.node');
  assert.equal(backEng, rootEng, 'engines.node root dan backend harus sama');
  const major = /^(\d+)\.x$/.exec(rootEng)?.[1];
  assert.ok(major, `engines.node '${rootEng}' harus berbentuk 'N.x'`);
  const readme = fs.readFileSync(path.join(ROOT, 'README.md'), 'utf8');
  const stated = /^Prasyarat: \*\*Node\.js (\d+)\.x\*\*/m.exec(readme)?.[1];
  assert.ok(stated, "README harus punya baris 'Prasyarat: **Node.js N.x** ...'");
  assert.equal(stated, major, `README menyebut Node.js ${stated}.x, engines.node '${rootEng}'`);
});

test('ALLOWED_UNUSED tidak basi: tiap entri punya alasan dan masih dideklarasikan', () => {
  const declaredAll = new Set(PACKAGES.flatMap((p) => { const j = readJson(`${p.dir}/package.json`); return Object.keys({ ...j.dependencies, ...j.devDependencies }); }));
  for (const a of ALLOWED_UNUSED) {
    assert.ok(a.why && a.why.length > 20, `${a.name}: alasan wajib ditulis`);
    assert.ok(declaredAll.has(a.name), `${a.name}: tidak dideklarasikan lagi, hapus dari ALLOWED_UNUSED`);
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
