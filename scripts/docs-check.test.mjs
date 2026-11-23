/**
 * Documentation rules, enforced by a test (also runs as the "tools:docs" suite of `npm test`):
 *   node scripts/docs-check.test.mjs
 *
 * The rules (one place per fact):
 *   - README.md is the main documentation (what exists in the code and how to use it); HANDOFF.md is the single working-state
 *     file (status, decisions, open findings, test baseline, next task) updated at every stage. Special-purpose docs only when
 *     really needed: the allow-list below is the ONLY set of .md files; adding one means changing this list on purpose.
 *   - README has no test results (they change every stage and live in HANDOFF.md) and no working instructions for the AI.
 *   - Everything README points to must exist: anchors, relative links, `npm run` scripts, file paths, environment variables
 *     the code reads.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ALLOWED_MD = ['HANDOFF.md', 'README.md', 'frontend/tests/browser/README.md'];
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', 'coverage']);
const HANDOFF_SECTIONS = [
  'Cap pembaruan', 'Cara memakai file ini', 'Konteks', 'Cara kerja', 'Larangan', 'Lingkungan', 'Posisi saat ini',
  'Roadmap fitur', 'Keputusan final', 'Belum diputuskan', 'Temuan terbuka', 'Baseline tes', 'Tugas berikutnya',
];

// Windows checkouts may use CRLF line endings; every rule below is about the text, not the line endings.
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8').replace(/\r\n/g, '\n');
const exists = (rel) => fs.existsSync(path.join(ROOT, rel));

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) { if (!SKIP_DIRS.has(e.name)) walk(path.join(dir, e.name), out); } else out.push(path.join(dir, e.name));
  }
  return out;
}

// Markdown text outside fenced code blocks (a `#` inside a bash block is a comment, not a heading).
function outsideFences(text) {
  let fenced = false;
  return text.split('\n').map((line) => {
    if (/^\s*```/.test(line)) { fenced = !fenced; return ''; }
    return fenced ? '' : line;
  });
}
function headings(text) {
  return outsideFences(text).map((l) => /^(#{1,6})\s+(.*\S)\s*$/.exec(l)).filter(Boolean).map((m) => ({ level: m[1].length, text: m[2] }));
}
// GitHub anchor: lower-case, drop everything except letters/digits/space/-/_, each space becomes "-" (no trimming).
function slug(text) {
  return text.toLowerCase().replace(/[^\p{L}\p{N}\s_-]/gu, '').replace(/\s/g, '-');
}
function anchorsOf(text) {
  const seen = new Map();
  const set = new Set();
  for (const h of headings(text)) {
    const base = slug(h.text);
    const n = seen.get(base) || 0;
    seen.set(base, n + 1);
    set.add(n ? `${base}-${n}` : base);
  }
  return set;
}
function links(text) {
  const out = [];
  for (const line of outsideFences(text)) for (const m of line.matchAll(/\]\(([^)\s]+)\)/g)) out.push(m[1]);
  return out;
}

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

// ── which .md files exist ────────────────────────────────────────────────────────────────────────────
test('hanya berkas .md yang diizinkan yang ada (README.md, HANDOFF.md, dan tes browser); tidak ada .md baru', () => {
  const found = walk(ROOT).filter((f) => /\.(md|markdown)$/i.test(f)).map((f) => path.relative(ROOT, f).split(path.sep).join('/')).sort();
  assert.deepEqual(found, [...ALLOWED_MD].sort(), 'daftar .md berubah: dokumentasi baru harus dibenarkan dan daftar izin di tes ini diubah dengan sengaja');
});

test('README.md dan HANDOFF.md saling menunjuk', () => {
  assert.ok(links(read('README.md')).includes('HANDOFF.md'), 'README harus menautkan HANDOFF.md');
  assert.ok(links(read('HANDOFF.md')).some((l) => l === 'README.md' || l.startsWith('README.md#')), 'HANDOFF harus menautkan README.md');
});

// ── links and anchors ────────────────────────────────────────────────────────────────────────────────
for (const file of ALLOWED_MD) {
  test(`${file}: heading unik, semua anchor internal valid, semua tautan relatif menunjuk berkas yang ada`, () => {
    const text = read(file);
    const hs = headings(text).map((h) => slug(h.text));
    assert.equal(new Set(hs).size, hs.length, 'ada heading kembar (anchor jadi ambigu)');
    const anchors = anchorsOf(text);
    for (const link of links(text)) {
      if (/^(https?:|mailto:)/.test(link)) continue;
      const [target, frag] = link.split('#');
      if (!target) { assert.ok(anchors.has(frag), `anchor tidak ada: #${frag}`); continue; }
      const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(file), target));
      assert.ok(exists(resolved), `tautan ke berkas yang tidak ada: ${link}`);
      if (frag && /\.md$/.test(resolved)) assert.ok(anchorsOf(read(resolved)).has(frag), `anchor tidak ada di ${resolved}: #${frag}`);
    }
  });
}

// ── what README may and may not contain ──────────────────────────────────────────────────────────────
test('README tidak memuat hasil tes (angka lulus, jumlah suite/tes terhitung): itu ada di HANDOFF.md', () => {
  const text = read('README.md');
  assert.ok(!/\d+\s*\/\s*\d+\s+lulus/i.test(text), 'ada angka "N/M lulus"');
  assert.ok(!/tes terhitung|\b\d+\s+(suite|tes)\b/i.test(text), 'ada jumlah suite/tes');
});

test('README tidak memuat instruksi kerja untuk AI atau bagian manajemen kerja (itu milik HANDOFF.md)', () => {
  const text = read('README.md');
  assert.ok(!/jangan diasumsikan|jangan diimplementasikan|tunggu persetujuan/i.test(text), 'ada kalimat instruksi kerja');
  const names = headings(text).map((h) => h.text);
  for (const forbidden of ['Tugas berikutnya', 'Temuan terbuka', 'Baseline tes', 'Cap pembaruan']) {
    assert.ok(!names.some((n) => n.includes(forbidden)), `bagian "${forbidden}" seharusnya ada di HANDOFF.md`);
  }
});

test('README: setiap `npm run <skrip>` yang disebut ada di package.json (root, backend, atau frontend)', () => {
  const scripts = new Set();
  for (const p of ['package.json', 'backend/package.json', 'frontend/package.json']) for (const k of Object.keys(JSON.parse(read(p)).scripts || {})) scripts.add(k);
  const used = new Set();
  // "npm run test:<nama>" is a placeholder (the token ends with ":"), not a script name
  for (const m of read('README.md').matchAll(/npm run ([A-Za-z0-9:_-]+)/g)) if (!m[1].endsWith(':')) used.add(m[1]);
  assert.ok(used.size >= 5, 'tidak ada rujukan npm run yang terbaca');
  for (const u of used) assert.ok(scripts.has(u), `README menyebut "npm run ${u}" tetapi skrip itu tidak ada`);
});

test('README: setiap path berkas kode yang disebut dalam backtick (backend/, frontend/, scripts/) benar-benar ada', () => {
  const text = read('README.md');
  const paths = new Set([...text.matchAll(/`((?:backend|frontend|scripts)\/[A-Za-z0-9_./-]+\.(?:js|jsx|mjs|cjs|json|sh|md|html))`/g)].map((m) => m[1]));
  assert.ok(paths.size >= 5, 'terlalu sedikit path yang terbaca (pemindai rusak?)');
  for (const p of paths) assert.ok(exists(p), `README menyebut path yang tidak ada: ${p}`);
});

test('README: setiap environment variable yang dibaca kode (backend, frontend, runner tes) terdokumentasi', () => {
  const VITE_BUILTIN = new Set(['MODE', 'DEV', 'PROD', 'SSR', 'BASE_URL']);
  const files = [...walk(path.join(ROOT, 'backend/src')), ...walk(path.join(ROOT, 'frontend/src')), path.join(ROOT, 'scripts/run-tests.mjs')]
    .filter((f) => /\.(js|jsx|mjs)$/.test(f) && !/\.test\./.test(f));
  const vars = new Set();
  for (const f of files) {
    for (const m of fs.readFileSync(f, 'utf8').matchAll(/\b(?:process\.|import\.meta\.)?env\.([A-Z][A-Z0-9_]+)/g)) if (!VITE_BUILTIN.has(m[1])) vars.add(m[1]);
  }
  for (const expected of ['NODE_ENV', 'PORT', 'CLIENT_URL', 'JWT_SECRET', 'MARTIL_DEBUG', 'MARTIL_BASH', 'VITE_SERVER_URL']) {
    assert.ok(vars.has(expected), `pemindai tidak menemukan ${expected} (pemindai rusak atau variabel dihapus dari kode)`);
  }
  const readme = read('README.md');
  for (const v of vars) assert.ok(readme.includes(v), `kode membaca ${v} tetapi README tidak menyebutnya`);
});

// ── HANDOFF.md structure ─────────────────────────────────────────────────────────────────────────────
test('HANDOFF.md: bagian wajib ada, berurutan, dan tidak kosong', () => {
  const text = read('HANDOFF.md');
  const h2 = headings(text).filter((h) => h.level === 2).map((h) => h.text);
  assert.deepEqual(h2, HANDOFF_SECTIONS, 'daftar bagian ## di HANDOFF.md harus tepat dan berurutan');
  const lines = outsideFences(text);
  for (const name of HANDOFF_SECTIONS) {
    const i = lines.findIndex((l) => l === `## ${name}`);
    assert.ok(i >= 0, `judul bagian "${name}" tidak ditemukan`);
    const next = lines.findIndex((l, k) => k > i && /^## /.test(l));
    const body = lines.slice(i + 1, next === -1 ? undefined : next).join('\n').trim();
    assert.ok(body.length >= 20, `bagian "${name}" kosong`);
  }
});

test('HANDOFF.md: cap pembaruan berisi tahap, tanggal valid (YYYY-MM-DD), dan patch terakhir', () => {
  const m = /^\*\*Pembaruan terakhir:\*\* tahap (.+), (\d{4}-\d{2}-\d{2}), patch terakhir (\S+)\s*$/m.exec(read('HANDOFF.md'));
  assert.ok(m, 'format: **Pembaruan terakhir:** tahap <nama>, <YYYY-MM-DD>, patch terakhir <id>');
  const d = new Date(`${m[2]}T00:00:00Z`);
  assert.ok(!Number.isNaN(d.getTime()) && d.toISOString().startsWith(m[2]), 'tanggal tidak valid');
  assert.ok(m[1].trim().length > 1 && m[3].length > 1);
});

test('HANDOFF.md: bagian Baseline tes menyebut `npm test` dan prompt untuk chat baru menunjuk README.md dan HANDOFF.md', () => {
  const text = read('HANDOFF.md');
  const sec = (name) => { const i = text.indexOf(`## ${name}`); const j = text.indexOf('\n## ', i + 1); return text.slice(i, j === -1 ? undefined : j); };
  assert.match(sec('Baseline tes'), /`npm test`/);
  const how = sec('Cara memakai file ini');
  assert.match(how, /HANDOFF\.md/);
  assert.match(how, /README\.md/);
  assert.match(how, /npm test/);
});

// ── runner ───────────────────────────────────────────────────────────────────────────────────────────
let failed = 0;
for (const t of tests) {
  try { t.fn(); console.log(`  PASS  ${t.name}`); } catch (e) {
    failed += 1;
    console.log(`  FAIL  ${t.name}\n        ${String(e.stack || e.message).split('\n').slice(0, 6).join('\n        ')}`);
  }
}
console.log(`\n${tests.length - failed}/${tests.length} lulus`);
process.exit(failed ? 1 : 0);
