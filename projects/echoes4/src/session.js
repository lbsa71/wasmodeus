import { createWorld, finishWorld } from './core/simulation.js';
/** @typedef {import('./core/types.js').Database} Database */

/** @param {Database} db @param {string} id @param {number} seed */
export function beginDive(db, id, seed) {
  if (db.active?.status === 'playing') return db.active;
  db.active = createWorld({ id, source: db.runs.at(-1) ?? null, config: db.config, seed });
  return db.active;
}
/** @param {Database} db @param {string} [reason] */
export function completeDive(db, reason = db.active?.status ?? 'complete') {
  if (!db.active) throw new Error('No dive to archive.');
  const recorded = db.runs.find(run => run.id === db.active?.id);
  if (recorded) return recorded;
  if (db.active.status === 'playing') db.active.status = 'complete';
  const run = finishWorld(db.active, reason);
  db.runs.push(run);
  return run;
}
