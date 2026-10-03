import assert from 'node:assert/strict';
import test from 'node:test';
import { createDatabase } from '../src/storage/validation.js';
import { beginDive, completeDive } from '../src/session.js';
import { stepWorld } from '../src/core/simulation.js';

test('completion archives a dive once, then the next dive uses its revised ecosystem', () => {
  const db = createDatabase(); db.config.durationSeconds = 1;
  const first = beginDive(db, 'first', 1);
  for (let tick = 0; tick < 30; tick++) stepWorld(first, { x: 1, y: 0 });
  const run = completeDive(db);
  assert.equal(db.runs.length, 1);
  assert.equal(completeDive(db).id, run.id);
  assert.equal(db.runs.length, 1);
  const second = beginDive(db, 'second', 2);
  assert.equal(second.tick, 0);
  assert.equal(second.source.id, first.id);
  assert.equal(second.fish.filter(fish => fish.kind === 'ghost').length, 1);
});

test('reloading a live dive resumes its exact progress instead of silently replacing it', () => {
  const db = createDatabase(); const live = beginDive(db, 'first', 1);
  stepWorld(live, { x: 1, y: 0 });
  assert.equal(beginDive(db, 'ignored', 9), live);
  assert.equal(db.active.tick, 1);
  completeDive(db, 'banked');
  assert.equal(db.active.status, 'complete');
  assert.equal(db.runs[0].reason, 'banked');
});
