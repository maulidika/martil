'use strict';
/**
 * Real SQLite in memory with the production schema, for the simulation suites (replaces the old no-op DB stub).
 * `handle()` is the current database; `fresh()` swaps in a brand-new empty one (call it at the start of every scenario);
 * `takeErrors()` returns (and clears) every SQL error raised since the last call.
 * Only the database file location differs from production: the schema and the SQL statements are the real ones.
 */
const path = require('path');

// node:sqlite prints a one-time ExperimentalWarning when first loaded; keep the test output quiet.
const emitWarning = process.emitWarning;
process.emitWarning = function (warning, ...rest) {
  const text = typeof warning === 'string' ? warning : (warning && warning.message) || '';
  if (/sqlite/i.test(text)) return undefined;
  return emitWarning.call(process, warning, ...rest);
};
const realDb = require(path.join(__dirname, '../../src/db/database.js')); // the REAL module (loaded before it gets stubbed)
const { openDatabase, closeStaleRooms } = realDb;
process.emitWarning = emitWarning;

const opened = [];
let current = null;
const errors = [];

// Socket handlers run inside onSafe(), which swallows exceptions (the sender just gets INTERNAL_ERROR), so a failing
// SQL statement would never fail a test by itself. Every database/statement error is recorded here instead; the
// runners call takeErrors() after each scenario and fail it when anything was recorded.
const record = (sql, e) => errors.push(`${e && e.code ? `${e.code}: ` : ''}${e && e.message}${sql ? ` [${String(sql).replace(/\s+/g, ' ').slice(0, 90)}]` : ''}`);
function watchStatement(stmt, sql) {
  return new Proxy(stmt, {
    get(target, key) {
      const v = target[key];
      if (typeof v !== 'function') return v;
      return (...args) => { try { return v.apply(target, args); } catch (e) { record(sql, e); throw e; } };
    },
  });
}
function watch(d) {
  return new Proxy(d, {
    get(target, key) {
      const v = target[key];
      if (typeof v !== 'function') return v;
      if (key === 'prepare') return (sql) => { try { return watchStatement(target.prepare(sql), sql); } catch (e) { record(sql, e); throw e; } };
      if (key === 'exec') return (sql) => { try { return target.exec(sql); } catch (e) { record(sql, e); throw e; } };
      return v.bind(target);
    },
  });
}

function fresh() {
  const raw = openDatabase(':memory:');
  opened.push(raw);
  current = watch(raw);
  return current;
}
function handle() {
  return current || fresh();
}
function takeErrors() {
  return errors.splice(0);
}

// Close every handle when the suite ends (a handle is kept open until then in case server code still holds a statement).
process.on('exit', () => { for (const d of opened.splice(0)) { try { d.close(); } catch { /* already closed */ } } });

module.exports = { fresh, handle, takeErrors, closeStaleRooms };
