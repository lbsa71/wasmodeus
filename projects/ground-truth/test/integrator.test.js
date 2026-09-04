import test from "node:test";
import assert from "node:assert/strict";

import { SKY_HEADROOM, integrate } from "../src/core/integrator.js";
import { cellIndex } from "../src/core/geometry.js";
import { packCell } from "../src/core/field-format.js";

const WORLD = { width: 16, height: 16 };
const PHYSICS = { gravity: 100, dt: 0.01, damping: 1, restitution: 0.5, dislodgeSpeed: 5 };

/** @param {[number, number][]} occupied */
function fieldWith(occupied) {
  const field = new Uint32Array(WORLD.width * WORLD.height);
  for (const [x, y] of occupied) field[cellIndex(x, y, WORLD.width)] = packCell(1, 2, 3);
  return field;
}

test("gravity accelerates a free pixel downwards", () => {
  const step = integrate({ pos: [8.5, 10.5], vel: [0, 0] }, fieldWith([]), WORLD, PHYSICS);
  assert.equal(step.vel[1], -1);
  assert.ok(step.pos[1] < 10.5);
  assert.equal(step.pos[0], 8.5);
  assert.deepEqual(step.hits, []);
});

test("a pixel lands on settled material instead of passing through it", () => {
  const field = fieldWith([[8, 9]]);
  const step = integrate({ pos: [8.5, 10.1], vel: [0, -20] }, field, WORLD, PHYSICS);
  assert.ok(step.pos[1] >= 10, "stays above the occupied cell");
  assert.ok(step.vel[1] > 0, "bounces with the configured restitution");
});

test("axes resolve separately so a pixel slides along a wall", () => {
  const field = fieldWith([[9, 10]]);
  const step = integrate({ pos: [8.5, 10.5], vel: [120, 0] }, field, WORLD, PHYSICS);
  assert.equal(step.pos[0], 8.5, "horizontal motion is blocked");
  assert.ok(step.pos[1] < 10.5, "vertical motion still happens");
});

test("a hard impact reports the struck cell so it can be dislodged", () => {
  const field = fieldWith([[8, 9]]);
  const step = integrate({ pos: [8.5, 10.05], vel: [0, -40] }, field, WORLD, PHYSICS);
  assert.deepEqual(step.hits, [[8, 9]]);
});

test("a gentle landing settles without dislodging what it lands on", () => {
  const field = fieldWith([[8, 9]]);
  const step = integrate({ pos: [8.5, 10.05], vel: [0, -1] }, field, WORLD, PHYSICS);
  assert.deepEqual(step.hits, []);
});

test("the side walls and floor are solid", () => {
  const left = integrate({ pos: [0.2, 5.5], vel: [-40, 0] }, fieldWith([]), WORLD, PHYSICS);
  assert.ok(left.vel[0] > 0);
  const floor = integrate({ pos: [5.5, 0.05], vel: [0, -40] }, fieldWith([]), WORLD, PHYSICS);
  assert.ok(floor.vel[1] > 0);
  assert.ok(floor.pos[1] >= 0);
});

test("a fountain jet may leave the world but not escape it forever", () => {
  const step = integrate({ pos: [8.5, WORLD.height + 1], vel: [0, 400] }, fieldWith([]), WORLD, PHYSICS);
  assert.ok(step.pos[1] > WORLD.height, "the sky is open");
  assert.ok(step.pos[1] <= WORLD.height * SKY_HEADROOM, "clamped to the ballistic ceiling");
});

test("damping bleeds energy out of the pool", () => {
  const damped = integrate({ pos: [8.5, 10.5], vel: [10, 0] }, fieldWith([]), WORLD, { ...PHYSICS, damping: 0.5 });
  assert.equal(damped.vel[0], 5);
});
