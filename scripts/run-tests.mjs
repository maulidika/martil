#!/usr/bin/env node
/**
 * One command for every test suite (backend + frontend). Plain Node: works the same on Windows, macOS and Linux.
 *
 *   npm test                          (from the project root: everything)
 *   npm test -- --only backend        (only suites whose name contains "backend"; comma-separated list allowed)
 *   npm test -- --strict              (a SKIP, also a partial one, counts as a failure)
 *   npm test -- --list                (print the suites and exit)
 *   node scripts/run-tests.mjs --help
 *
 * Suites run one after another (several tests use the real clock, so they are not run in parallel). Each suite's output
 * is kept and only shown when it fails (or with --verbose). A suite is:
 *   PASS  exit code 0 (and no inconsistent "N/M lulus" count, and no FAIL line)
 *   FAIL  non-zero exit code, timeout, cannot start, or inconsistent output
 *   SKIP  not run, or everything in it was skipped (e.g. render tests without dependencies, a suite that needs bash):
 *         never a silent pass; shown in the summary. SKIP is not a failure unless --strict.
 * Exit code: 0 all good, 1 a suite failed (or SKIP with --strict), 2 usage error.
 *
 * Suites that need bash use the program named by MARTIL_BASH (default "bash"). On Windows point it at Git Bash when
 * `bash` on your PATH is WSL, e.g. in PowerShell:  $env:MARTIL_BASH = "C:\Program Files\Git\bin\bash.exe"
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// ── suite list ───────────────────────────────────────────────────────────────────────────────────────
const BASH = { type: 'bash', reason: 'butuh bash (mis. Git Bash di Windows; atur MARTIL_BASH bila `bash` di PATH bukan yang benar)' };
const be = (name, file) => ({ name: `backend:${name}`, cwd: 'backend', cmd: ['node', `tests/${file}`] });
const fe = (name, cmd, extra = {}) => ({ name: `frontend:${name}`, cwd: 'frontend', cmd, ...extra });
const feBash = (name) => fe(name, ['bash', `tests/${name}/run.sh`], { requires: [BASH] });

const DEFAULT_SUITES = [
  be('reconnect', 'reconnect.sim.js'),
  be('room-navigation', 'room-navigation.sim.js'),
  be('kick', 'kick.sim.js'),
  be('combo', 'combo.consistency.js'),
  be('card-ids', 'card-ids.sim.js'),
  be('payload-guards', 'payload-guards.sim.js'),
  be('turn-timer', 'turn-timer.sim.js'),
  be('intermission', 'intermission.sim.js'),
  be('max-games', 'max-games.sim.js'),
  be('single-room', 'single-room.sim.js'),
  be('profiles', 'profiles.sim.js'),
  be('host-retention', 'host-retention.sim.js'),
  be('config-jwt', 'config-jwt.sim.js'),
  be('debug-log', 'debug-log.sim.js'),
  be('db-schema', 'db-schema.sim.js'),
  be('db-persistence', 'db-persistence.sim.js'),
  be('room-code-case', 'room-code-case.sim.js'),
  be('constants', 'constants.sim.js'),
  {
    name: 'backend:jest', cwd: 'backend', cmd: ['node', 'node_modules/jest/bin/jest.js'],
    requires: [{ type: 'file', path: 'node_modules/jest/bin/jest.js', reason: 'jest belum terpasang: jalankan "npm install" di folder backend' }],
  },
  fe('sync', ['node', 'tests/sync.sim/main.mjs']),
  fe('store-selectors', ['node', 'tests/store-selectors/run.mjs']),
  fe('store-invariants', ['node', 'tests/store-invariants/run.mjs']),
  fe('lobby-views', ['node', 'tests/lobby-views/run.mjs']),
  fe('server-errors', ['node', 'tests/server-errors/run.mjs']),
  fe('player-names', ['node', 'tests/player-names/run.mjs']),
  feBash('combo-ui'),
  feBash('kick-ui'),
  feBash('lobby-ui'),
  feBash('game-ui'),
  { name: 'tools:runner', cwd: '.', cmd: ['node', 'scripts/run-tests.test.mjs'] },
  { name: 'tools:docs', cwd: '.', cmd: ['node', 'scripts/docs-check.test.mjs'] },
  { name: 'tools:imports', cwd: '.', cmd: ['node', 'scripts/imports-check.test.mjs'] },
  { name: 'tools:deps', cwd: '.', cmd: ['node', 'scripts/deps-check.test.mjs'] },
];

// ── arguments ────────────────────────────────────────────────────────────────────────────────────────
function parseArgs(argv) {
  const o = { only: [], strict: false, list: false, verbose: false, timeoutSec: 180, suitesFile: null, help: false };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    const val = () => { i += 1; if (i >= argv.length) throw new Error(`${a} butuh nilai`); return argv[i]; };
    if (a === '--only') o.only.push(...val().split(',').map((s) => s.trim()).filter(Boolean));
    else if (a === '--strict') o.strict = true;
    else if (a === '--list') o.list = true;
    else if (a === '--verbose') o.verbose = true;
    else if (a === '--timeout') {
      const n = Number(val());
      if (!Number.isFinite(n) || n <= 0) throw new Error('--timeout harus angka detik > 0');
      o.timeoutSec = n;
    } else if (a === '--suites') o.suitesFile = val();
    else if (a === '--help' || a === '-h') o.help = true;
    else throw new Error(`opsi tidak dikenal: ${a}`);
  }
  return o;
}

const HELP = `Penggunaan: node scripts/run-tests.mjs [opsi]
  --only a,b      hanya suite yang namanya memuat salah satu kata (mis. backend, kick, frontend:sync)
  --strict        SKIP (juga sebagian) dianggap gagal
  --list          tampilkan daftar suite lalu keluar
  --verbose       tampilkan output semua suite, bukan hanya yang gagal
  --timeout N     batas waktu per suite dalam detik (bawaan 180)
  --suites FILE   pakai daftar suite dari berkas JSON (untuk menguji runner)
Exit code: 0 semua baik, 1 ada suite gagal (atau SKIP dengan --strict), 2 salah pemakaian.`;

// ── running ──────────────────────────────────────────────────────────────────────────────────────────
const BASH_EXE = process.env.MARTIL_BASH || 'bash';
let bashOk;
function hasBash() {
  if (bashOk === undefined) {
    const r = spawnSync(BASH_EXE, ['--version'], { encoding: 'utf8' });
    bashOk = !r.error && r.status === 0;
  }
  return bashOk;
}

function missingRequirement(suite) {
  for (const req of suite.requires || []) {
    if (req.type === 'bash' && !hasBash()) return req.reason || 'butuh bash';
    if (req.type === 'file' && !fs.existsSync(path.resolve(ROOT, suite.cwd || '.', req.path))) return req.reason || `berkas tidak ada: ${req.path}`;
  }
  return null;
}

// Summary lines "N/M lulus" printed by the suites (several per suite possible: e.g. logic + render), and Jest's own
// summary. Only lines that START with the count are read, so a test NAME that mentions "2/3 lulus" is never counted.
function parseCounts(output) {
  let passed = 0; let total = 0; let found = false;
  for (const m of output.matchAll(/^\s*(\d+)\/(\d+) lulus/gm)) { passed += Number(m[1]); total += Number(m[2]); found = true; }
  const jest = output.match(/^Tests:\s+(?:\d+ failed, )?(?:\d+ skipped, )?(\d+) passed, (\d+) total/m);
  if (jest) { passed += Number(jest[1]); total += Number(jest[2]); found = true; }
  return { passed, total, found };
}

function runSuite(suite, { timeoutSec }) {
  const base = { name: suite.name, passed: 0, total: 0, ms: 0, note: '', output: '' };
  const missing = missingRequirement(suite);
  if (missing) return { ...base, status: 'SKIP', note: missing };

  const [exe, ...args] = suite.cmd;
  const program = exe === 'node' ? process.execPath : exe === 'bash' ? BASH_EXE : exe;
  const started = Date.now();
  const r = spawnSync(program, args, {
    cwd: path.resolve(ROOT, suite.cwd || '.'),
    env: process.env,
    encoding: 'utf8',
    timeout: (suite.timeoutSec || timeoutSec) * 1000,
    maxBuffer: 64 * 1024 * 1024,
  });
  const ms = Date.now() - started;
  const output = `${r.stdout || ''}${r.stderr || ''}`;
  const common = { ...base, ms, output };

  if (r.error && r.error.code === 'ETIMEDOUT') return { ...common, status: 'FAIL', note: `timeout setelah ${suite.timeoutSec || timeoutSec} dtk` };
  if (r.error) return { ...common, status: 'FAIL', note: `tidak bisa dijalankan: ${r.error.message}` };
  if (r.status !== 0) return { ...common, status: 'FAIL', note: `exit code ${r.status === null ? `(sinyal ${r.signal})` : r.status}` };

  const counts = parseCounts(output);
  if (/^\s*FAIL\b/m.test(output)) return { ...common, ...counts, status: 'FAIL', note: 'ada baris FAIL padahal exit code 0' };
  if (counts.found && counts.passed < counts.total) return { ...common, ...counts, status: 'FAIL', note: `hitungan tidak konsisten (${counts.passed}/${counts.total}) padahal exit code 0` };

  const skips = [...output.matchAll(/^\s*SKIP\b.*$/gm)].map((m) => m[0].trim().replace(/\s+/g, ' '));
  if (skips.length && !counts.found) return { ...common, status: 'SKIP', note: `seluruhnya dilewati: ${skips[0].replace(/^SKIP\s*/, '')}` };
  if (skips.length) return { ...common, ...counts, status: 'PASS', partialSkips: skips.length, note: `${skips.length} bagian SKIP: ${skips[0].replace(/^SKIP\s*/, '').slice(0, 80)}` };
  return { ...common, ...counts, status: 'PASS' };
}

// ── main ─────────────────────────────────────────────────────────────────────────────────────────────
function main(argv) {
  let opts;
  try { opts = parseArgs(argv); } catch (e) { console.error(`${e.message}\n\n${HELP}`); return 2; }
  if (opts.help) { console.log(HELP); return 0; }

  let suites = DEFAULT_SUITES;
  if (opts.suitesFile) {
    try { suites = JSON.parse(fs.readFileSync(opts.suitesFile, 'utf8')); } catch (e) { console.error(`tidak bisa membaca --suites: ${e.message}`); return 2; }
  }
  if (opts.only.length) suites = suites.filter((s) => opts.only.some((w) => s.name.includes(w)));
  if (suites.length === 0) { console.error(`tidak ada suite yang cocok dengan: ${opts.only.join(', ')}  (lihat --list)`); return 2; }
  if (opts.list) { for (const s of suites) console.log(s.name); return 0; }

  const width = Math.max(...suites.map((s) => s.name.length)) + 2;
  const results = [];
  const started = Date.now();
  console.log(`Menjalankan ${suites.length} suite (node ${process.version})\n`);
  for (const suite of suites) {
    const res = runSuite(suite, opts);
    results.push(res);
    const counts = res.total ? `${res.passed}/${res.total}` : '-';
    console.log(`  ${res.status.padEnd(5)} ${res.name.padEnd(width)}${counts.padStart(9)}  ${(res.ms / 1000).toFixed(1).padStart(5)}s${res.note ? `  ${res.note}` : ''}`);
    if (opts.verbose && res.output) console.log(res.output.trimEnd().split('\n').map((l) => `        | ${l}`).join('\n'));
  }

  const failed = results.filter((r) => r.status === 'FAIL');
  const skipped = results.filter((r) => r.status === 'SKIP');
  const partial = results.filter((r) => r.partialSkips);
  const passed = results.filter((r) => r.status === 'PASS');
  const tests = results.reduce((a, r) => ({ passed: a.passed + r.passed, total: a.total + r.total }), { passed: 0, total: 0 });

  if (!opts.verbose) {
    for (const r of failed) {
      console.log(`\n── ${r.name}: ${r.note}`);
      const tail = r.output.trimEnd().split('\n').slice(-40);
      console.log(tail.map((l) => `   | ${l}`).join('\n'));
    }
  }

  console.log(`\nRingkasan: ${results.length} suite: ${passed.length} PASS, ${failed.length} FAIL, ${skipped.length} SKIP`
    + ` | tes terhitung: ${tests.passed}/${tests.total} lulus | ${((Date.now() - started) / 1000).toFixed(1)}s`);
  if (skipped.length || partial.length) {
    console.log('SKIP bukan lulus: bagian ini TIDAK teruji pada eksekusi ini:');
    for (const r of [...skipped, ...partial]) console.log(`  - ${r.name}: ${r.note}`);
    console.log(opts.strict ? '(--strict: SKIP dihitung gagal)' : '(gunakan --strict agar SKIP dihitung gagal)');
  }
  if (failed.length) return 1;
  if (opts.strict && (skipped.length || partial.length)) return 1;
  return 0;
}

process.exitCode = main(process.argv.slice(2));
