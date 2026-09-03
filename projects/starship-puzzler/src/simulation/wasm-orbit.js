/**
 * @typedef {{
 * initialize(inner: number, outer: number): void,
 * resetShip(angle: number, route: number): void,
 * step(thrustIntent: number, elapsedSeconds: number): void,
 * getShipX(): number,
 * getShipY(): number,
 * getShipAngle(): number,
 * getShipRadius(): number,
 * getShipSpeed(): number,
 * getRadialVelocity(): number,
 * getCapturedRoute(): number,
 * getMotionMode(): number,
 * getTransitionProgress(): number,
 * getSimulationTime(): number,
 * getCrashCount(): number,
 * getEnemyX(): number,
 * getEnemyY(): number,
 * getEnemyMode(): number,
 * getEnemyRoute(): number,
 * getEnemyDetectionRadius(): number,
 * getGoalX(): number,
 * getGoalY(): number,
 * getGoalReached(): number,
 * getGoalCount(): number,
 * getAsteroidX(): number,
 * getAsteroidY(): number,
 * getLaserOriginX(): number,
 * getLaserOriginY(): number,
 * getLaserTargetX(): number,
 * getLaserTargetY(): number,
 * getLaserCharge(): number,
 * getTargetDestroyed(): number,
 * getEnemyShotLevel(): number
 * getEnemyAimLevel(): number,
 * getEnemyAimStartX(): number,
 * getEnemyAimStartY(): number,
 * getEnemyAimTargetX(): number,
 * getEnemyAimTargetY(): number
 * getEnemyPelletX(): number,
 * getEnemyPelletY(): number,
 * getEnemyPelletActive(): number
 * getActiveShip(): number,
 * getScoutAlive(): number,
 * getLaserAlive(): number,
 * getGameOver(): number,
 * switchActiveShip(direction: number): void,
 * fireActiveLaser(): void
 * }} OrbitExports
 */

export class WasmOrbitSimulation {
  /** @param {OrbitExports} exports */
  constructor(exports) {
    this.exports = exports;
  }

  /** @param {URL|string} wasmUrl */
  static async create(wasmUrl) {
    const response = await fetch(wasmUrl);
    if (!response.ok) throw new Error(`Unable to load orbital-motion.wasm (${response.status}).`);
    const binary = await response.arrayBuffer();
    const result = await WebAssembly.instantiate(binary, {
      env: {
        /** @param {number} message @param {number} file @param {number} line @param {number} column */
        abort(message, file, line, column) {
          throw new Error(`WASM abort ${message}:${file}:${line}:${column}`);
        },
      },
    });
    const exports = /** @type {unknown} */ (result.instance.exports);
    return new WasmOrbitSimulation(/** @type {OrbitExports} */ (exports));
  }

  /** @param {number} innerRadius @param {number} outerRadius */
  initialize(innerRadius, outerRadius) { this.exports.initialize(innerRadius, outerRadius); }
  /** @param {number} angle @param {number} route */
  reset(angle = 0, route = 1) { this.exports.resetShip(angle, route); }

  /** @param {{radial: number}} input @param {number} elapsedSeconds */
  step(input, elapsedSeconds) {
    this.exports.step(clampRadial(input.radial), elapsedSeconds);
  }
  /** @param {number} direction */
  switchShip(direction) { this.exports.switchActiveShip(direction < 0 ? -1 : 1); }
  fireLaser() { this.exports.fireActiveLaser(); }

  snapshot() {
    return Object.freeze({
      x: this.exports.getShipX(),
      y: this.exports.getShipY(),
      angle: this.exports.getShipAngle(),
      radius: this.exports.getShipRadius(),
      speed: this.exports.getShipSpeed(),
      radialVelocity: this.exports.getRadialVelocity(),
      route: this.exports.getCapturedRoute(),
      mode: this.exports.getMotionMode(),
      transitionProgress: this.exports.getTransitionProgress(),
      time: this.exports.getSimulationTime(),
      crashes: this.exports.getCrashCount(),
      enemyX: this.exports.getEnemyX(),
      enemyY: this.exports.getEnemyY(),
      enemyMode: this.exports.getEnemyMode(),
      enemyRoute: this.exports.getEnemyRoute(),
      enemyDetectionRadius: this.exports.getEnemyDetectionRadius(),
      goalX: this.exports.getGoalX(),
      goalY: this.exports.getGoalY(),
      goalReached: this.exports.getGoalReached() === 1,
      goalCount: this.exports.getGoalCount(),
      asteroidX: this.exports.getAsteroidX(),
      asteroidY: this.exports.getAsteroidY(),
      laserOriginX: this.exports.getLaserOriginX(),
      laserOriginY: this.exports.getLaserOriginY(),
      laserTargetX: this.exports.getLaserTargetX(),
      laserTargetY: this.exports.getLaserTargetY(),
      laserCharge: this.exports.getLaserCharge(),
      targetDestroyed: this.exports.getTargetDestroyed() === 1,
      enemyShotLevel: this.exports.getEnemyShotLevel(),
      enemyAimLevel: this.exports.getEnemyAimLevel(),
      enemyAimStartX: this.exports.getEnemyAimStartX(),
      enemyAimStartY: this.exports.getEnemyAimStartY(),
      enemyAimTargetX: this.exports.getEnemyAimTargetX(),
      enemyAimTargetY: this.exports.getEnemyAimTargetY(),
      enemyPelletX: this.exports.getEnemyPelletX(),
      enemyPelletY: this.exports.getEnemyPelletY(),
      enemyPelletActive: this.exports.getEnemyPelletActive() === 1,
      activeShip: this.exports.getActiveShip(),
      scoutAlive: this.exports.getScoutAlive() === 1,
      laserAlive: this.exports.getLaserAlive() === 1,
      gameOver: this.exports.getGameOver() === 1,
    });
  }
}

/** @param {number} value */
function clampRadial(value) { return value > 0 ? 1 : value < 0 ? -1 : 0; }
