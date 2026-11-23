/**
 * Tests for scripts/run-tests.mjs, using fake suites (small scripts in a temp folder) plus a tiny real run.
 *   node scripts/run-tests.test.mjs        (also runs as the "tools:runner" suite of the runner itself)
 *
 * Covered: exit codes (0 / 1 / 2), PASS vs FAIL vs SKIP, strict mode, timeouts, a suite that cannot start, inconsistent
 * "N/M lulus" counts, a FAIL line with exit code 0, partial and full SKIP, Jest-style counts, --only / --list / --verbose /
 * --help, bad usage, and that every backend/frontend test file in the repo is wired into the runner.
 */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RUNNER = path.join(ROOT, 'scripts/run-tests.mjs');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'martil-runner-test-'));

// ── fake suites ──────────────────────────────────────────────────────────────────────────────────────
const script = (name, body) => { const f = path.join(tmp, name); fs.writeFileSync(f, body); return f; };
const S = {
  pass: script('pass.js', "console.log('  PASS  a\\n  PASS  b\\n  PASS  c\\n\\n3/3 lulus');"),
  noCounts: script('nocounts.js', "console.log('Semua uji konsistensi lulus');"),
  multi: script('multi.js', "console.log('48/48 lulus\\n26/26 lulus (render)');"),
  jest: script('jest.js', "console.error('Tests:       3 passed, 3 total');"),
  fail: script('fail.js', "console.log('  FAIL  x\\n        boom-detail\\n\\n1/3 lulus'); process.exit(1);"),
  nameWithCount: script('namewithcount.js', "console.log('  PASS  hitungan tidak konsisten (2/3 lulus tetapi exit code 0)\\n  PASS  b\\n\\n2/2 lulus');"),
  failLine: script('failline.js', "console.log('  FAIL  x\\n2/3 lulus');"),
  inconsistent: script('inconsistent.js', "console.log('2/3 lulus');"),
  partialSkip: script('partialskip.js', "console.log('5/5 lulus\\n  SKIP   render: dependency belum terpasang (esbuild)');"),
  fullSkip: script('fullskip.js', "console.log('  SKIP   render Lobby: dependency belum terpasang (esbuild)');"),
  slow: script('slow.js', 'setTimeout(() => {}, 8000);'),
  existing: script('existing.txt', 'x'),
};
const missingFile = path.join(tmp, 'does-not-exist.bin');
const suite = (name, file, extra = {}) => ({ name, cwd: tmp, cmd: ['node', file], ...extra });

function run(args, suites, env = {}) {
  const list = path.join(tmp, `suites-${Math.random().toString(36).slice(2)}.json`);
  if (suites) fs.writeFileSync(list, JSON.stringify(suites));
  const r = spawnSync(process.execPath, [RUNNER, ...(suites ? ['--suites', list] : []), ...args], { encoding: 'utf8', env: { ...process.env, ...env } });
  return { status: r.status, out: `${r.stdout}${r.stderr}` };
}
const line = (out, name) => out.split('\n').find((l) => l.includes(` ${name} `) || l.trimEnd().endsWith(` ${name}`)) || '';

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

// ── tests ────────────────────────────────────────────────────────────────────────────────────────────
test('semua suite lulus → exit 0; hitungan dijumlahkan (termasuk beberapa baris "lulus" dan format Jest); tanpa hitungan tampil "-"', () => {
  const r = run([], [
    suite('t:pass', S.pass), suite('t:nocounts', S.noCounts), suite('t:multi', S.multi), suite('t:jest', S.jest),
    suite('t:req-ok', S.pass, { requires: [{ type: 'file', path: S.existing, reason: 'x' }] }),
  ]);
  assert.equal(r.status, 0, r.out);
  assert.match(r.out, /5 suite: 5 PASS, 0 FAIL, 0 SKIP/);
  assert.match(r.out, /tes terhitung: 83\/83 lulus/);   // 3 + 74 + 3 + 3
  assert.match(line(r.out, 't:multi'), /PASS\s+t:multi\s+74\/74/);
  assert.match(line(r.out, 't:jest'), /3\/3/);
  assert.match(line(r.out, 't:nocounts'), /PASS\s+t:nocounts\s+-/);
  assert.ok(!/SKIP bukan lulus/.test(r.out), 'tanpa SKIP tidak ada peringatan SKIP');
});

test('satu suite gagal → exit 1, suite lain tetap dijalankan, output suite yang gagal ditampilkan', () => {
  const r = run([], [suite('t:before', S.pass), suite('t:fail', S.fail), suite('t:after', S.pass)]);
  assert.equal(r.status, 1, r.out);
  assert.match(r.out, /3 suite: 2 PASS, 1 FAIL, 0 SKIP/);
  assert.match(line(r.out, 't:fail'), /FAIL\s+t:fail\s+.*exit code 1/);
  assert.match(line(r.out, 't:after'), /PASS/, 'suite sesudah yang gagal tetap dijalankan');
  assert.match(r.out, /boom-detail/, 'output suite gagal harus tampil');
});

test('nama tes yang memuat teks "2/3 lulus" tidak ikut terhitung (hanya baris ringkasan yang dibaca)', () => {
  const r = run([], [suite('t:name', S.nameWithCount)]);
  assert.equal(r.status, 0, r.out);
  assert.match(line(r.out, 't:name'), /PASS\s+t:name\s+2\/2/);
  assert.match(r.out, /tes terhitung: 2\/2 lulus/);
});

test('baris FAIL padahal exit code 0 → dianggap gagal', () => {
  const r = run([], [suite('t:failline', S.failLine)]);
  assert.equal(r.status, 1, r.out);
  assert.match(r.out, /ada baris FAIL padahal exit code 0/);
});

test('hitungan tidak konsisten (2/3 lulus tetapi exit code 0) → gagal', () => {
  const r = run([], [suite('t:inconsistent', S.inconsistent)]);
  assert.equal(r.status, 1, r.out);
  assert.match(r.out, /hitungan tidak konsisten \(2\/3\)/);
});

test('timeout → FAIL dengan catatan timeout; suite sesudahnya tetap jalan', () => {
  const r = run([], [suite('t:slow', S.slow, { timeoutSec: 1 }), suite('t:next', S.pass)]);
  assert.equal(r.status, 1, r.out);
  assert.match(line(r.out, 't:slow'), /FAIL.*timeout setelah 1 dtk/);
  assert.match(line(r.out, 't:next'), /PASS/);
});

test('--timeout mengatur batas bawaan semua suite', () => {
  const r = run(['--timeout', '1'], [suite('t:slow', S.slow)]);
  assert.equal(r.status, 1, r.out);
  assert.match(r.out, /timeout setelah 1 dtk/);
});

test('perintah tidak ada → FAIL "tidak bisa dijalankan" (bukan crash runner)', () => {
  const r = run([], [{ name: 't:nocmd', cwd: tmp, cmd: ['definitely-not-a-real-command-xyz'] }, suite('t:ok', S.pass)]);
  assert.equal(r.status, 1, r.out);
  assert.match(line(r.out, 't:nocmd'), /FAIL.*tidak bisa dijalankan/);
  assert.match(line(r.out, 't:ok'), /PASS/);
});

test('syarat berkas tidak terpenuhi → SKIP dengan alasan, tidak dijalankan, bukan kegagalan; --strict membuatnya gagal', () => {
  const suites = [suite('t:needs', S.fail, { requires: [{ type: 'file', path: missingFile, reason: 'alasan-skip-berkas' }] }), suite('t:ok', S.pass)];
  const r = run([], suites);
  assert.equal(r.status, 0, r.out);
  assert.match(line(r.out, 't:needs'), /SKIP.*alasan-skip-berkas/);
  assert.match(r.out, /2 suite: 1 PASS, 0 FAIL, 1 SKIP/);
  assert.match(r.out, /SKIP bukan lulus/);
  assert.match(r.out, /- t:needs: alasan-skip-berkas/);
  const strict = run(['--strict'], suites);
  assert.equal(strict.status, 1, strict.out);
  assert.match(strict.out, /--strict: SKIP dihitung gagal/);
});

test('SKIP sebagian (ada hitungan + baris SKIP) → PASS dengan catatan, tampil di ringkasan; --strict → gagal', () => {
  const suites = [suite('t:partial', S.partialSkip)];
  const r = run([], suites);
  assert.equal(r.status, 0, r.out);
  assert.match(line(r.out, 't:partial'), /PASS\s+t:partial\s+5\/5.*1 bagian SKIP/);
  assert.match(r.out, /SKIP bukan lulus/);
  assert.equal(run(['--strict'], suites).status, 1);
});

test('SKIP seluruhnya dari output (tanpa hitungan) → status SKIP, bukan PASS', () => {
  const r = run([], [suite('t:fullskip', S.fullSkip)]);
  assert.equal(r.status, 0, r.out);
  assert.match(line(r.out, 't:fullskip'), /SKIP.*seluruhnya dilewati.*dependency belum terpasang/);
  assert.match(r.out, /0 PASS, 0 FAIL, 1 SKIP/);
  assert.equal(run(['--strict'], [suite('t:fullskip', S.fullSkip)]).status, 1);
});

test('suite berbasis bash: bash tidak tersedia (MARTIL_BASH salah) → SKIP "butuh bash", tidak dijalankan; --strict → gagal', () => {
  const suites = [suite('t:needs-bash', S.fail, { cmd: ['bash', S.fail], requires: [{ type: 'bash', reason: 'butuh bash-uji' }] }), suite('t:ok', S.pass)];
  const env = { MARTIL_BASH: path.join(tmp, 'no-such-bash') };
  const r = run([], suites, env);
  assert.equal(r.status, 0, r.out);
  assert.match(line(r.out, 't:needs-bash'), /SKIP.*butuh bash-uji/);
  assert.match(r.out, /2 suite: 1 PASS, 0 FAIL, 1 SKIP/);
  assert.equal(run(['--strict'], suites, env).status, 1);
});

test('suite berbasis bash: MARTIL_BASH dipakai sebagai program bash (diuji dengan node sebagai pengganti bash)', () => {
  const suites = [{ name: 't:bash-ok', cwd: tmp, cmd: ['bash', S.pass], requires: [{ type: 'bash' }] }];
  const r = run([], suites, { MARTIL_BASH: process.execPath });
  assert.equal(r.status, 0, r.out);
  assert.match(line(r.out, 't:bash-ok'), /PASS\s+t:bash-ok\s+3\/3/);
});

test('--only: cocok sebagian nama, daftar dipisah koma; tidak ada yang cocok → exit 2 tanpa menjalankan apa pun', () => {
  const suites = [suite('backend:a', S.pass), suite('backend:b', S.fail), suite('frontend:c', S.pass)];
  const one = run(['--only', 'frontend'], suites);
  assert.equal(one.status, 0, one.out);
  assert.match(one.out, /1 suite: 1 PASS/);
  const two = run(['--only', 'backend:a,frontend:c'], suites);
  assert.equal(two.status, 0, two.out);
  assert.match(two.out, /2 suite: 2 PASS/);
  const none = run(['--only', 'tidak-ada'], suites);
  assert.equal(none.status, 2);
  assert.match(none.out, /tidak ada suite yang cocok/);
});

test('--list hanya mencetak nama suite (tidak menjalankan apa pun) dan exit 0', () => {
  const r = run(['--list'], [suite('x:one', S.fail), suite('x:two', S.fail)]);
  assert.equal(r.status, 0, r.out);
  assert.deepEqual(r.out.trim().split('\n'), ['x:one', 'x:two']);
});

test('--verbose menampilkan output suite yang lulus; tanpa itu hanya suite gagal yang ditampilkan', () => {
  const suites = [suite('t:pass', S.pass)];
  assert.match(run(['--verbose'], suites).out, /\| {3}PASS {2}a/);
  assert.ok(!/\| {3}PASS {2}a/.test(run([], suites).out));
});

test('pemakaian salah → exit 2 dengan pesan dan bantuan; --help → exit 0', () => {
  for (const args of [['--bogus'], ['--only'], ['--timeout', 'abc'], ['--timeout', '0'], ['--suites']]) {
    const r = run(args);
    assert.equal(r.status, 2, `${args.join(' ')}\n${r.out}`);
    assert.match(r.out, /Penggunaan:/);
  }
  const h = run(['--help']);
  assert.equal(h.status, 0);
  assert.match(h.out, /Penggunaan:/);
  const bad = run(['--suites', path.join(tmp, 'nope.json')]);
  assert.equal(bad.status, 2);
  assert.match(bad.out, /tidak bisa membaca --suites/);
});

test('daftar bawaan: setiap berkas tes backend, folder tes frontend, dan tes alat (scripts/*.test.mjs) terdaftar di runner (tidak ada yang terlupa)', () => {
  const src = fs.readFileSync(RUNNER, 'utf8');
  const backend = fs.readdirSync(path.join(ROOT, 'backend/tests'), { withFileTypes: true }).filter((d) => d.isFile() && d.name.endsWith('.js')).map((d) => d.name);
  assert.ok(backend.length >= 15, 'daftar tes backend tidak terbaca');
  for (const f of backend) assert.ok(src.includes(`'${f}'`), `backend/tests/${f} belum terdaftar di scripts/run-tests.mjs`);
  assert.ok(fs.existsSync(path.join(ROOT, 'backend/src/game/engine.test.js')) && src.includes('node_modules/jest/bin/jest.js'), 'Jest (engine.test.js) harus terdaftar');
  const tools = fs.readdirSync(path.join(ROOT, 'scripts')).filter((f) => f.endsWith('.test.mjs'));
  assert.ok(tools.length >= 2, 'daftar tes alat tidak terbaca');
  for (const f of tools) assert.ok(src.includes(`'scripts/${f}'`), `scripts/${f} belum terdaftar di scripts/run-tests.mjs`);
  const frontend = fs.readdirSync(path.join(ROOT, 'frontend/tests'), { withFileTypes: true }).filter((d) => d.isDirectory() && d.name !== 'browser').map((d) => d.name);
  assert.ok(frontend.length >= 7, 'daftar tes frontend tidak terbaca');
  for (const d of frontend) {
    const sync = d === 'sync.sim' && src.includes("fe('sync'");
    assert.ok(sync || src.includes(`'${d}'`) || src.includes(`tests/${d}/`), `frontend/tests/${d} belum terdaftar di scripts/run-tests.mjs`);
  }
});

test('skrip npm: root "test", backend "test" dan frontend "test" memanggil runner; backend punya test:jest', () => {
  const read = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8')).scripts;
  assert.equal(read('package.json').test, 'node scripts/run-tests.mjs');
  assert.equal(read('backend/package.json').test, 'node ../scripts/run-tests.mjs --only backend');
  assert.equal(read('backend/package.json')['test:jest'], 'jest');
  assert.equal(read('frontend/package.json').test, 'node ../scripts/run-tests.mjs --only frontend');
});

test('lari nyata kecil: dua suite backend sungguhan lewat runner → exit 0 dan hitungan sesuai', () => {
  const r = run(['--only', 'backend:debug-log,backend:config-jwt']);
  assert.equal(r.status, 0, r.out);
  assert.match(r.out, /2 suite: 2 PASS, 0 FAIL, 0 SKIP/);
  assert.match(line(r.out, 'backend:debug-log'), /10\/10/);
  assert.match(line(r.out, 'backend:config-jwt'), /20\/20/);
});

// ── runner ───────────────────────────────────────────────────────────────────────────────────────────
let failed = 0;
for (const t of tests) {
  try { t.fn(); console.log(`  PASS  ${t.name}`); } catch (e) {
    failed += 1;
    console.log(`  FAIL  ${t.name}\n        ${String(e.stack || e.message).split('\n').slice(0, 8).join('\n        ')}`);
  }
}
fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\n${tests.length - failed}/${tests.length} lulus`);
process.exit(failed ? 1 : 0);
