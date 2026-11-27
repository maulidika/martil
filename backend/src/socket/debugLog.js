'use strict';

/** One-line server log used by the socket layer: `[MARTIL <ISO time>] ACTION { details }`. */
function debugLog(action, details = {}) {
  console.info(`[MARTIL ${new Date().toISOString()}] ${action}`, details);
}

module.exports = { debugLog };
