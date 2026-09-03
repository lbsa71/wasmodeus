import {
  advanceMotion,
  activeShipIndex,
  asteroidX,
  asteroidY,
  circularSpeed,
  configureRoutes,
  crashes,
  elapsedTime,
  enemyCapturedRoute,
  enemyDetectionRadius,
  enemyAimLevel,
  enemyAimStartX,
  enemyAimStartY,
  enemyAimTargetX,
  enemyAimTargetY,
  enemyPelletActive,
  enemyPelletX,
  enemyPelletY,
  enemyMotionMode,
  enemyShotLevel,
  enemyX,
  enemyY,
  goalX,
  goalY,
  goalsCompleted,
  isGoalReached,
  isGameOver,
  isLaserAlive,
  isScoutAlive,
  isTargetDestroyed,
  laserChargeLevel,
  laserOriginX,
  laserOriginY,
  laserTargetX,
  laserTargetY,
  obstacleAngle,
  obstacleCount,
  programmedThrust,
  radialVelocity,
  resetMotion,
  routeCount,
  switchShip,
  fireLaser,
  shipAngle,
  shipCapturedRoute,
  shipMotionMode,
  shipRadius,
  shipSpeed,
  shipX,
  shipY,
  transitionProgress,
} from "./core/orbital-motion";

export function initialize(innerRadius: f64, outerRadius: f64): void { configureRoutes(innerRadius, outerRadius); }
export function resetShip(angle: f64, route: i32): void { resetMotion(angle, route); }
export function step(thrustIntent: f64, elapsedSeconds: f64): void { advanceMotion(thrustIntent, elapsedSeconds); }
export function getShipX(): f64 { return shipX(); }
export function getShipY(): f64 { return shipY(); }
export function getShipAngle(): f64 { return shipAngle(); }
export function getShipRadius(): f64 { return shipRadius(); }
export function getShipSpeed(): f64 { return shipSpeed(); }
export function getRadialVelocity(): f64 { return radialVelocity(); }
export function getCircularSpeed(route: i32): f64 { return circularSpeed(route); }
export function getActiveThrust(): f64 { return programmedThrust(); }
export function getCapturedRoute(): i32 { return shipCapturedRoute(); }
export function getMotionMode(): i32 { return shipMotionMode(); }
export function getTransitionProgress(): f64 { return transitionProgress(); }
export function getRouteCount(): i32 { return routeCount(); }
export function getObstacleCount(): i32 { return obstacleCount(); }
export function getObstacleAngle(index: i32): f64 { return obstacleAngle(index); }
export function getSimulationTime(): f64 { return elapsedTime(); }
export function getCrashCount(): i32 { return crashes(); }
export function getEnemyX(): f64 { return enemyX(); }
export function getEnemyY(): f64 { return enemyY(); }
export function getEnemyMode(): i32 { return enemyMotionMode(); }
export function getEnemyRoute(): i32 { return enemyCapturedRoute(); }
export function getEnemyDetectionRadius(): f64 { return enemyDetectionRadius(); }
export function getGoalX(): f64 { return goalX(); }
export function getGoalY(): f64 { return goalY(); }
export function getGoalReached(): i32 { return isGoalReached(); }
export function getGoalCount(): i32 { return goalsCompleted(); }
export function getAsteroidX(): f64 { return asteroidX(); }
export function getAsteroidY(): f64 { return asteroidY(); }
export function getLaserOriginX(): f64 { return laserOriginX(); }
export function getLaserOriginY(): f64 { return laserOriginY(); }
export function getLaserTargetX(): f64 { return laserTargetX(); }
export function getLaserTargetY(): f64 { return laserTargetY(); }
export function getLaserCharge(): f64 { return laserChargeLevel(); }
export function getTargetDestroyed(): i32 { return isTargetDestroyed(); }
export function getEnemyShotLevel(): f64 { return enemyShotLevel(); }
export function getEnemyAimLevel(): f64 { return enemyAimLevel(); }
export function getEnemyAimStartX(): f64 { return enemyAimStartX(); }
export function getEnemyAimStartY(): f64 { return enemyAimStartY(); }
export function getEnemyAimTargetX(): f64 { return enemyAimTargetX(); }
export function getEnemyAimTargetY(): f64 { return enemyAimTargetY(); }
export function getEnemyPelletX(): f64 { return enemyPelletX(); }
export function getEnemyPelletY(): f64 { return enemyPelletY(); }
export function getEnemyPelletActive(): i32 { return enemyPelletActive(); }
export function getActiveShip(): i32 { return activeShipIndex(); }
export function getScoutAlive(): i32 { return isScoutAlive(); }
export function getLaserAlive(): i32 { return isLaserAlive(); }
export function getGameOver(): i32 { return isGameOver(); }
export function switchActiveShip(direction: i32): void { switchShip(direction); }
export function fireActiveLaser(): void { fireLaser(); }
