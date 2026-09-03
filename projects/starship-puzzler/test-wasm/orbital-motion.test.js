import assert from "node:assert/strict";
import test from "node:test";

import { loadWasm } from "../test-support/wasm-helper.js";

const wasm = await loadWasm(new URL("../public/orbital-motion.wasm", import.meta.url));

test("each captured route starts at its Newtonian circular speed", () => {
  wasm.initialize(140, 560);
  wasm.resetShip(0.7, 1);

  assert.equal(wasm.getRouteCount(), 4);
  assert.equal(wasm.getObstacleCount(), 4);
  assert.ok(Math.abs(wasm.getShipSpeed() - wasm.getCircularSpeed(1)) < 1e-9);
  assert.ok(Math.abs(wasm.getShipRadius() - 280) < 1e-9);
});

test("tangential speed is derived from radius throughout a jump and fall", () => {
  wasm.initialize(140, 560);
  wasm.resetShip(0, 1);
  wasm.step(1, 0.01);
  assertTangentialSpeedMatchesRadius();

  wasm.resetShip(0, 2);
  wasm.step(-1, 0.01);
  assertTangentialSpeedMatchesRadius();
});

test("the pursuer detects the ship and starts the same committed inward fall", () => {
  wasm.initialize(140, 560);
  wasm.resetShip(1, 1);
  const initialEnemyRadius = Math.hypot(wasm.getEnemyX(), wasm.getEnemyY());

  wasm.step(0, 0.01);
  assert.equal(wasm.getEnemyMode(), 1);

  repeat(20, () => wasm.step(0, 0.01));

  assert.equal(wasm.getEnemyMode(), 1);
  assert.equal(wasm.getEnemyRoute(), -1);
  assert.ok(Math.hypot(wasm.getEnemyX(), wasm.getEnemyY()) < initialEnemyRadius);
});

test("the pursuer holds its ring when the player trails behind it", () => {
  wasm.initialize(140, 560);
  wasm.resetShip(0.7, 2);

  wasm.step(0, 0.01);

  assert.equal(wasm.getEnemyMode(), 1);
  assert.equal(wasm.getEnemyRoute(), 2);
});

test("the pursuer returns to scanning when the player leaves its detection circle", () => {
  wasm.initialize(140, 560);
  wasm.resetShip(1, 1);
  wasm.step(0, 0.01);
  assert.equal(wasm.getEnemyMode(), 1);

  repeatUntil(500, () => wasm.step(1, 0.01), () => wasm.getEnemyMode() === 0);

  assert.equal(wasm.getEnemyMode(), 0);
});

test("contact with the pursuer removes the scout and switches to the laser", () => {
  wasm.initialize(140, 560);
  wasm.resetShip(1.08, 2);

  wasm.step(0, 0.01);

  assert.equal(wasm.getCrashCount(), 1);
  assert.equal(wasm.getScoutAlive(), 0);
  assert.equal(wasm.getLaserAlive(), 1);
  assert.equal(wasm.getActiveShip(), 1);
  assert.equal(wasm.getEnemyMode(), 0);
});

test("red ignores the cold laser platform after the scout is lost", () => {
  wasm.initialize(140, 560);
  wasm.resetShip(1.08, 2);
  wasm.step(0, 0.01);

  repeat(200, () => wasm.step(0, 0.01));

  assert.equal(wasm.getScoutAlive(), 0);
  assert.equal(wasm.getLaserAlive(), 1);
  assert.equal(wasm.getEnemyMode(), 0);
  assert.equal(wasm.getEnemyAimLevel(), 0);
  assert.equal(wasm.getEnemyPelletActive(), 0);
});

test("an aligned pursuer immediately shoots the asteroid without ending the encounter", () => {
  wasm.initialize(140, 560);
  wasm.resetShip(1, 1);
  const asteroidStart = [wasm.getAsteroidX(), wasm.getAsteroidY()];

  repeatUntil(120, () => wasm.step(0, 0.01), () => Math.hypot(wasm.getAsteroidX() - asteroidStart[0], wasm.getAsteroidY() - asteroidStart[1]) > 1);

  assert.equal(wasm.getTargetDestroyed(), 0);
  assert.notDeepEqual([wasm.getAsteroidX(), wasm.getAsteroidY()], asteroidStart);
});

test("the pursuer telegraphs a locked shot before it fires", () => {
  wasm.initialize(140, 560);
  wasm.resetShip(1.3, 1);

  wasm.step(0, 0.01);
  assert.ok(wasm.getEnemyAimLevel() > 0);
  assert.equal(wasm.getEnemyShotLevel(), 0);

  assert.notEqual(wasm.getEnemyAimTargetX(), 0);

  repeatUntil(120, () => wasm.step(0, 0.01), () => wasm.getEnemyShotLevel() > 0);
  assert.ok(wasm.getEnemyShotLevel() > 0);
});

test("the red ship keeps taking irregular shots while it is scanning", () => {
  wasm.initialize(140, 560);
  wasm.resetShip(0, 1);

  wasm.step(0, 0.01);

  assert.equal(wasm.getEnemyMode(), 0);
  assert.ok(wasm.getEnemyAimLevel() > 0 || wasm.getEnemyShotLevel() > 0);
});

test("red fires a travelling pellet instead of a continuous beam", () => {
  wasm.initialize(140, 560);
  wasm.resetShip(1.3, 1);

  repeatUntil(120, () => wasm.step(0, 0.01), () => wasm.getEnemyPelletActive() === 1);
  const start = [wasm.getEnemyPelletX(), wasm.getEnemyPelletY()];
  wasm.step(0, 0.01);

  assert.equal(wasm.getEnemyPelletActive(), 1);
  assert.notDeepEqual([wasm.getEnemyPelletX(), wasm.getEnemyPelletY()], start);
});

test("switching selects the laser platform while preserving the scout", () => {
  wasm.initialize(140, 560);
  wasm.resetShip(0, 1);

  wasm.switchActiveShip(1);

  assert.equal(wasm.getActiveShip(), 1);
  assert.equal(wasm.getScoutAlive(), 1);
  assert.equal(wasm.getLaserAlive(), 1);
});

test("the selected laser fires only when explicitly commanded", () => {
  wasm.initialize(140, 560);
  wasm.resetShip(0, 1);
  wasm.switchActiveShip(1);

  repeat(100, () => wasm.step(0, 0.01));
  assert.equal(wasm.getLaserCharge(), 0);

  wasm.fireActiveLaser();
  wasm.step(0, 0.01);
  assert.ok(wasm.getLaserCharge() > 0);
});

test("a released outward jump arcs back to its departure ring", () => {
  wasm.initialize(140, 560);
  wasm.resetShip(0, 1);
  wasm.step(1, 0.01);

  repeatUntil(1_000, () => wasm.step(0, 0.01), () => wasm.getCapturedRoute() === 1);

  assert.equal(wasm.getCapturedRoute(), 1);
  assert.equal(wasm.getActiveThrust(), 0);
});

test("holding outward passes the next ring then lands on it during descent", () => {
  wasm.initialize(140, 560);
  wasm.resetShip(0, 1);
  let highestRadius = wasm.getShipRadius();

  repeatUntil(1_000, () => {
    wasm.step(1, 0.01);
    highestRadius = Math.max(highestRadius, wasm.getShipRadius());
  }, () => wasm.getCapturedRoute() === 2);

  assert.ok(highestRadius > 420);
  assert.equal(wasm.getCapturedRoute(), 2);
  assert.ok(Math.abs(wasm.getShipSpeed() - wasm.getCircularSpeed(2)) < 1e-9);
});

test("a held outward jump slows naturally before reaching its apex", () => {
  wasm.initialize(140, 560);
  wasm.resetShip(0, 1);
  wasm.step(1, 0.01);
  const initialRiseSpeed = wasm.getRadialVelocity();
  wasm.step(1, 0.01);

  assert.ok(wasm.getRadialVelocity() < initialRiseSpeed);
  assert.ok(wasm.getRadialVelocity() > 0);
});

test("an inward fall is committed and ignores outward input until it lands", () => {
  wasm.initialize(140, 560);
  wasm.resetShip(0, 2);
  wasm.step(-1, 0.01);

  repeatUntil(1_000, () => wasm.step(1, 0.01), () => wasm.getCapturedRoute() === 1);

  assert.equal(wasm.getCapturedRoute(), 1);
  assert.equal(wasm.getActiveThrust(), 0);
});

test("an outward jump ignores input after its apex until it lands", () => {
  wasm.initialize(140, 560);
  wasm.resetShip(0, 1);
  let wasAscending = true;
  repeatUntil(1_000, () => {
    wasm.step(1, 0.01);
    if (wasm.getRadialVelocity() <= 0) wasAscending = false;
  }, () => !wasAscending && wasm.getCapturedRoute() === 2);

  assert.equal(wasm.getCapturedRoute(), 2);
  assert.equal(wasm.getActiveThrust(), 0);
});

test("a scout that hits an obstacle is removed while the laser remains playable", () => {
  wasm.initialize(140, 560);
  wasm.resetShip(wasm.getObstacleAngle(1), 1);

  wasm.step(0, 0.01);

  assert.equal(wasm.getCrashCount(), 1);
  assert.equal(wasm.getScoutAlive(), 0);
  assert.equal(wasm.getActiveShip(), 1);
});

test("the same action sequence produces exactly the same state", () => {
  const run = () => {
    wasm.initialize(140, 560);
    wasm.resetShip(0.5, 1);
    repeat(20, () => wasm.step(1, 0.01));
    repeat(100, () => wasm.step(0, 0.01));
    wasm.step(-1, 0.01);
    repeat(100, () => wasm.step(0, 0.01));
    return [wasm.getShipX(), wasm.getShipY(), wasm.getShipAngle(), wasm.getShipRadius(), wasm.getShipSpeed(), wasm.getRadialVelocity(), wasm.getCapturedRoute(), wasm.getMotionMode(), wasm.getCrashCount()];
  };

  assert.deepEqual(run(), run());
});

function repeat(count, action) {
  for (let index = 0; index < count; index += 1) action();
}

function repeatUntil(limit, action, complete) {
  for (let index = 0; index < limit && !complete(); index += 1) action();
}

function assertTangentialSpeedMatchesRadius() {
  const tangentialSpeed = Math.sqrt(wasm.getShipSpeed() ** 2 - wasm.getRadialVelocity() ** 2);
  const expected = Math.sqrt(2_800_000 / wasm.getShipRadius());
  assert.ok(Math.abs(tangentialSpeed - expected) < 1e-9);
}
