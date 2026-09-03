import assert from "node:assert/strict";
import test from "node:test";

import { createSceneUniforms, OUTER_ROUTE_RADIUS, ROUTE_COUNT, SCENE_UNIFORM_FLOATS } from "../src/render/scene-data.js";

test("scene uniforms preserve the logical orbit geometry across aspect ratios", () => {
  const data = createSceneUniforms({ x: 30, y: -40, angle: 0.25, radius: 280, route: 1, mode: 0 }, 1600, 900, 0, { x: 42, y: -18 });

  assert.equal(data.length, SCENE_UNIFORM_FLOATS);
  assert.ok(Math.abs(data[0] - (1600 / 900)) < 1e-6);
  assert.equal(data[1], 300);
  assert.equal(data[2], 400);
  assert.equal(data[3], 140);
  assert.equal(data[4], 30);
  assert.equal(data[5], -40);
  assert.equal(data[6], 0.25);
  assert.equal(data[7], 1);
  assert.equal(data[8], OUTER_ROUTE_RADIUS);
  assert.equal(ROUTE_COUNT, 4);
  assert.equal(data[12], 42);
  assert.equal(data[13], -18);
  assert.equal(data[14], 0);
});

test("scene uniforms mark a selected laser platform so the scout silhouette can be hidden", () => {
  const data = createSceneUniforms({ x: 0, y: 0, angle: 0, radius: 140, route: 0, mode: 0, activeShip: 1 }, 1200, 900);

  assert.equal(data[15], 1);
});

test("scene uniforms carry the pursuer, its detection radius, and the target zone", () => {
  const data = createSceneUniforms({
    x: 0, y: 0, angle: 0, heading: 1.5, radius: 280, route: 1, mode: 0,
    enemyX: 340, enemyY: 120, enemyMode: 1, enemyDetectionRadius: 110,
    goalX: 151, goalY: 236, goalReached: true,
  }, 1200, 900);

  assert.equal(data[6], 1.5);
  assert.deepEqual([...data.slice(16, 23)], [340, 120, 1, 110, 151, 236, 1]);
});

test("scene uniforms carry the automatic laser, its blocker, and the locked pursuer attack", () => {
  const data = createSceneUniforms({
    x: 0, y: 0, angle: 0, radius: 280, route: 1, mode: 0,
    laserOriginX: 10, laserOriginY: 20, laserTargetX: 30, laserTargetY: 40,
    asteroidX: 21, asteroidY: 22, laserCharge: 0.75, targetDestroyed: true,
    enemyAimStartX: 80, enemyAimStartY: 90, enemyAimTargetX: 100, enemyAimTargetY: 110,
    enemyPelletX: 210, enemyPelletY: 220, enemyPelletActive: true,
  }, 1200, 900);

  assert.deepEqual([...data.slice(24, 32)], [10, 20, 30, 40, 21, 22, 26, 0.75]);
  assert.deepEqual([...data.slice(32, 36)], [80, 90, 100, 110]);
  assert.deepEqual([...data.slice(36, 40)], [1, 210, 220, 1]);
});

test("portrait viewports expand the camera so all four levels remain visible", () => {
  const data = createSceneUniforms({ x: 0, y: 120, angle: 0, radius: 120, route: 1, mode: 0 }, 900, 1600);

  assert.ok(Math.abs(data[1] - (300 / (900 / 1600))) < 1e-4);
  assert.ok(data[1] > 300);
});
