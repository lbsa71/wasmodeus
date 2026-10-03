import { DEFAULT_CONFIG } from '../core/simulation.js';
/** @typedef {import('../core/types.js').Database} Database */
export const MAX_SNAPSHOT_BYTES = 64 * 1024 * 1024;

/** @returns {Database} */
export function createDatabase() {
  return { version: 1, revision: 0, updatedAt: new Date().toISOString(), config: { ...DEFAULT_CONFIG }, runs: [], active: null };
}
/** @param {unknown} value @param {Set<object>} [ancestors] */
function finiteJSON(value, ancestors = new Set()) {
  if (typeof value === 'number') { if (!Number.isFinite(value)) throw new Error('JSON numbers must be finite.'); return; }
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return;
  if (typeof value !== 'object' || (!Array.isArray(value) && Object.getPrototypeOf(value) !== Object.prototype)) throw new Error('Only plain finite JSON values can be saved.');
  if (ancestors.has(value)) throw new Error('Cyclic JSON cannot be saved.');
  ancestors.add(value);
  for (const item of Object.values(value)) finiteJSON(item, ancestors);
  ancestors.delete(value);
}
/** @param {unknown} value @returns {Record<string,unknown>} */
function object(value) { if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid database object.'); return /** @type {Record<string,unknown>} */ (value); }
/** @param {unknown} value @returns {unknown[]} */
function array(value) { if (!Array.isArray(value)) throw new Error('Invalid database array.'); return value; }
/** @param {unknown} value */
function string(value) { if (typeof value !== 'string' || !value.length) throw new Error('Invalid database text.'); }
/** @param {unknown} value */
function date(value) { string(value); if (!Number.isFinite(Date.parse(/** @type {string} */ (value)))) throw new Error('Invalid database date.'); }
/** @param {unknown} value @param {number} [minimum] @returns {number} */
function number(value, minimum = -Infinity) { if (typeof value !== 'number' || !Number.isFinite(value) || value < minimum) throw new Error('Invalid finite number.'); return value; }
/** @param {unknown} value @param {number} [minimum] @returns {number} */
function integer(value, minimum = 0) { const result = number(value, minimum); if (!Number.isSafeInteger(result)) throw new Error('Invalid integer.'); return result; }
/** @param {unknown} value @param {string[]} allowed */
function member(value, allowed) { if (!allowed.includes(/** @type {string} */ (value))) throw new Error('Invalid database state.'); }

/** @param {unknown} value */
function config(value) {
  const c = object(value);
  integer(c.tickRate, 1); number(c.baseRadius, 0.001); number(c.startMass, 0.001);
  for (const key of ['baseSpeed','turnRate','speedExponent','turnExponent','spawnPadding']) number(c[key], 0);
  number(c.durationSeconds, 0); number(c.echoDelaySeconds, 0.001);
  if (number(c.growthEfficiency, 0) > 1 || number(c.eatRatio, 1) > 10 || number(c.tickRate) > 240) throw new Error('Invalid tuning values.');
}
/** @param {Record<string,unknown>} p */
function pose(p) { number(p.x); number(p.y); number(p.heading); number(p.mass, 0.000001); }
/** @param {unknown} input */
function track(input) {
  const t = object(input); string(t.id); member(t.kind, ['player','ghost','echo']);
  const born = integer(t.bornTick), end = integer(t.endTick, born); pose(object(t.initial));
  let previous = born;
  for (const frame of array(t.frames)) {
    const f = object(frame); const tick = integer(f.tick, previous);
    if (tick > end) throw new Error('Frame outside recorded lifetime.'); previous = tick; pose(f);
  }
  previous = born;
  for (const control of array(t.controls)) {
    const c = object(control); const tick = integer(c.tick, previous);
    if (tick > end) throw new Error('Control outside recorded lifetime.'); previous = tick; number(c.x); number(c.y);
  }
}
/** @param {unknown} value @param {Set<string>} ids */
function events(value, ids) {
  const seen = new Set(); let previous = 0;
  for (const input of array(value)) {
    const e = object(input); string(e.id); if (seen.has(e.id)) throw new Error('Duplicate event id.'); seen.add(e.id);
    previous = integer(e.tick, previous); member(e.type, ['birth','eat','passive']);
    if (!ids.has(/** @type {string} */ (e.actorId))) throw new Error('Unknown event actor.');
    if (e.type === 'eat' && (!ids.has(/** @type {string} */ (e.preyId)) || e.preyId === e.actorId)) throw new Error('Unknown meal prey.');
    number(e.x); number(e.y);
    for (const key of ['mass','eaterMass','preyMass']) if (e[key] !== undefined) number(e[key], 0.000001);
  }
}
/** @param {unknown[]} values @returns {Set<string>} */
function tracks(values) {
  const ids = new Set();
  for (const input of values) { track(input); const id = /** @type {string} */ (object(input).id); if (ids.has(id)) throw new Error('Duplicate fish recording.'); ids.add(id); }
  return ids;
}
/** @param {unknown} value */
function run(value) {
  const r = object(value); string(r.id); date(r.startedAt); date(r.finishedAt); string(r.reason); integer(r.durationTicks);
  config(r.config); events(r.events, tracks(array(r.tracks)));
}
/** @param {unknown} value @param {Set<string>} runIds */
function world(value, runIds) {
  const w = object(value); string(w.id); integer(w.tick); member(w.status, ['playing','complete','eaten']); config(w.config);
  integer(w.seed); date(w.startedAt); integer(w.nextEcho); integer(w.nextEchoTick);
  const ids = tracks(array(object(w.recording).tracks)); events(w.events, ids);
  let players = 0; const fishIds = new Set();
  for (const input of array(w.fish)) {
    const f = object(input); string(f.id); member(f.kind, ['player','ghost','echo']); member(f.state, ['active','passive','eaten']); pose(f);
    integer(f.bornTick); integer(f.controlIndex); integer(f.expectedMealIndex); array(f.expectedMeals);
    if (!ids.has(/** @type {string} */ (f.id)) || fishIds.has(f.id)) throw new Error('Invalid fish identity.'); fishIds.add(f.id);
    if (f.kind === 'player') players++;
    if (f.source !== undefined) { const s = object(f.source); string(s.trackId); member(s.mode, ['archive','delay']); if (s.delayTicks !== undefined) integer(s.delayTicks); if (s.rotation !== undefined) number(s.rotation); }
  }
  if (players !== 1 || fishIds.size !== ids.size) throw new Error('Aquarium must have exactly one player and complete recordings.');
  if (w.source !== null) { run(w.source); if (!runIds.has(/** @type {string} */ (object(w.source).id))) throw new Error('Missing source dive.'); }
}
/** @param {unknown} input @returns {Database} */
export function validateDatabase(input) {
  finiteJSON(input);
  if (new TextEncoder().encode(JSON.stringify(input)).byteLength > MAX_SNAPSHOT_BYTES) throw new Error('Database exceeds the 64 MiB snapshot limit. Export your archive.');
  const db = object(input); if (db.version !== 1) throw new Error('Unsupported aquarium database version.');
  integer(db.revision); date(db.updatedAt); config(db.config);
  const ids = new Set();
  for (const input of array(db.runs)) { run(input); const id = object(input).id; if (ids.has(id)) throw new Error('Duplicate dive id.'); ids.add(id); }
  if (db.active !== null) world(db.active, /** @type {Set<string>} */ (ids));
  return /** @type {Database} */ (structuredClone(input));
}
