import assert from "node:assert/strict";
import test from "node:test";

import { WasmOrbitSimulation } from "../src/simulation/wasm-orbit.js";

test("the browser adapter clamps radial intent before crossing the WASM boundary", () => {
  const calls = [];
  const simulation = new WasmOrbitSimulation(fakeExports((...args) => calls.push(args)));

  simulation.step({ radial: 3 }, 0.016);

  assert.deepEqual(calls, [[1, 0.016]]);
});

test("the browser adapter exposes one immutable render snapshot", () => {
  const simulation = new WasmOrbitSimulation(fakeExports());

  assert.deepEqual(simulation.snapshot(), {
    x: 120,
    y: 0,
    angle: 0,
    radius: 120,
    speed: 100,
    radialVelocity: 0,
    route: 1,
    mode: 0,
    transitionProgress: 0,
    time: 0,
    crashes: 0,
    enemyX: 320,
    enemyY: 40,
    enemyMode: 0,
    enemyRoute: -1,
    enemyDetectionRadius: 110,
    goalX: 150,
    goalY: 235,
    goalReached: false,
    goalCount: 0,
    asteroidX: 210,
    asteroidY: 220,
    laserOriginX: 100,
    laserOriginY: 200,
    laserTargetX: 500,
    laserTargetY: 200,
    laserCharge: 0.5,
    targetDestroyed: false,
    enemyShotLevel: 0.25,
    enemyAimLevel: 0.75,
    enemyAimStartX: 300,
    enemyAimStartY: 100,
    enemyAimTargetX: 120,
    enemyAimTargetY: 50,
    enemyPelletX: 200,
    enemyPelletY: 210,
    enemyPelletActive: true,
    activeShip: 0,
    scoutAlive: true,
    laserAlive: true,
    gameOver: false,
  });
});

test("the browser adapter resets to the second orbital level by default", () => {
  const calls = [];
  const simulation = new WasmOrbitSimulation({ ...fakeExports(), resetShip: (...args) => calls.push(args) });

  simulation.reset();

  assert.deepEqual(calls, [[0, 1]]);
});

function fakeExports(onStep = () => {}) {
  return {
    initialize: () => {},
    resetShip: () => {},
    step: onStep,
    getShipX: () => 120,
    getShipY: () => 0,
    getShipAngle: () => 0,
    getShipRadius: () => 120,
    getShipSpeed: () => 100,
    getRadialVelocity: () => 0,
    getCapturedRoute: () => 1,
    getMotionMode: () => 0,
    getTransitionProgress: () => 0,
    getSimulationTime: () => 0,
    getCrashCount: () => 0,
    getEnemyX: () => 320,
    getEnemyY: () => 40,
    getEnemyMode: () => 0,
    getEnemyRoute: () => -1,
    getEnemyDetectionRadius: () => 110,
    getGoalX: () => 150,
    getGoalY: () => 235,
    getGoalReached: () => 0,
    getGoalCount: () => 0,
    getAsteroidX: () => 210,
    getAsteroidY: () => 220,
    getLaserOriginX: () => 100,
    getLaserOriginY: () => 200,
    getLaserTargetX: () => 500,
    getLaserTargetY: () => 200,
    getLaserCharge: () => 0.5,
    getTargetDestroyed: () => 0,
    getEnemyShotLevel: () => 0.25,
    getEnemyAimLevel: () => 0.75,
    getEnemyAimStartX: () => 300,
    getEnemyAimStartY: () => 100,
    getEnemyAimTargetX: () => 120,
    getEnemyAimTargetY: () => 50,
    getEnemyPelletX: () => 200,
    getEnemyPelletY: () => 210,
    getEnemyPelletActive: () => 1,
    getActiveShip: () => 0,
    getScoutAlive: () => 1,
    getLaserAlive: () => 1,
    getGameOver: () => 0,
    switchActiveShip: () => {},
    fireActiveLaser: () => {},
  };
}
