export const CAPTURED: i32 = 0;
export const FLIGHT: i32 = 1;
export const ROUTE_COUNT: i32 = 4;
export const OBSTACLE_COUNT: i32 = 4;
export const ENEMY_SCANNING: i32 = 0;
export const ENEMY_CHASING: i32 = 1;
export const SCOUT: i32 = 0;
export const LASER_SHIP: i32 = 1;

const GRAVITY_PARAMETER: f64 = 2_800_000.0;
const OUTWARD_LAUNCH_SPEED: f64 = 190.0;
const OUTWARD_HOLD_GRAVITY: f64 = 106.0;
const OUTWARD_RELEASE_GRAVITY: f64 = 260.0;
const INWARD_FALL_SPEED: f64 = 105.0;
const INWARD_FALL_EASING: f64 = 600.0;
const COLLISION_RADIUS: f64 = 16.0;
const PURSUER_COLLISION_RADIUS: f64 = 18.0;
const ENEMY_DETECTION_RADIUS: f64 = 180.0;
const LASER_ANGLE: f64 = 1.0;
const LASER_RADIUS: f64 = 140.0;
const TARGET_RADIUS: f64 = 560.0;
const ASTEROID_RADIUS: f64 = 26.0;
const ASTEROID_START_RADIUS: f64 = 350.0;
const ASTEROID_PUSH_SPEED: f64 = 180.0;
const ASTEROID_DAMPING: f64 = 1.8;
const ENEMY_FIRE_INTERVAL: f64 = 2.4;
const ENEMY_AIM_DURATION: f64 = 0.9;
const ENEMY_SHOT_DURATION: f64 = 0.16;
const ENEMY_PELLET_SPEED: f64 = 440.0;
const ENEMY_PELLET_RADIUS: f64 = 8.0;
const LASER_FIRE_DURATION: f64 = 0.22;
const MAX_STEP_SECONDS: f64 = 0.02;

let innerRadius: f64 = 140.0;
let outerRadius: f64 = 560.0;
let ship = new OrbitalActor(1, 0.0);
let enemy = new OrbitalActor(2, 0.0);
let enemyMode: i32 = ENEMY_SCANNING;
let enemyTarget: i32 = SCOUT;
let scoutAlive: bool = true;
let laserAlive: bool = true;
let activeShip: i32 = SCOUT;
let gameOver: bool = false;
let asteroidPositionX: f64 = 0.0;
let asteroidPositionY: f64 = 0.0;
let asteroidVelocityX: f64 = 0.0;
let asteroidVelocityY: f64 = 0.0;
let enemyFireCooldown: f64 = 0.0;
let enemyAimTimer: f64 = 0.0;
let enemyShotTimer: f64 = 0.0;
let lockedAimOriginX: f64 = 0.0;
let lockedAimOriginY: f64 = 0.0;
let lockedAimTargetX: f64 = 0.0;
let lockedAimTargetY: f64 = 0.0;
let pelletActive: bool = false;
let pelletPositionX: f64 = 0.0;
let pelletPositionY: f64 = 0.0;
let pelletVelocityX: f64 = 0.0;
let pelletVelocityY: f64 = 0.0;
let laserCharge: f64 = 0.0;
let laserFireTimer: f64 = 0.0;
let targetDestroyed: bool = false;
let enemyDestroyed: bool = false;
let simulationTime: f64 = 0.0;
let crashCount: i32 = 0;

class OrbitalActor {
  radius: f64;
  angle: f64;
  radialSpeed: f64;
  capturedRoute: i32;
  activeThrust: f64;
  departureRoute: i32;
  inwardFall: bool;
  outwardHeld: bool;

  constructor(route: i32, angle: f64) {
    this.radius = routeRadius(route);
    this.angle = angle;
    this.radialSpeed = 0.0;
    this.capturedRoute = route;
    this.activeThrust = 0.0;
    this.departureRoute = route;
    this.inwardFall = false;
    this.outwardHeld = false;
  }

  x(): f64 { return Math.cos(this.angle) * this.radius; }
  y(): f64 { return Math.sin(this.angle) * this.radius; }
  speed(): f64 {
    const tangentialSpeed = circularSpeedAtRadius(this.radius);
    return Math.sqrt(tangentialSpeed * tangentialSpeed + this.radialSpeed * this.radialSpeed);
  }

  land(route: i32, angle: f64): void {
    this.radius = routeRadius(route);
    this.angle = angle;
    this.radialSpeed = 0.0;
    this.capturedRoute = route;
    this.activeThrust = 0.0;
    this.departureRoute = route;
    this.inwardFall = false;
    this.outwardHeld = false;
  }

  advance(command: f64, dt: f64): void {
    this.outwardHeld = command > 0.0;
    if (this.capturedRoute >= 0 && command != 0.0) this.beginAction(command);
    if (this.capturedRoute >= 0) this.advanceCaptured(dt);
    else if (this.inwardFall) this.advanceInwardFall(dt);
    else this.advanceOutwardJump(dt);
  }

  private beginAction(direction: f64): void {
    if (direction > 0.0) {
      if (this.capturedRoute >= ROUTE_COUNT - 1) return;
      this.departureRoute = this.capturedRoute;
      this.inwardFall = false;
      this.activeThrust = 1.0;
      this.radialSpeed = OUTWARD_LAUNCH_SPEED;
      this.capturedRoute = -1;
    } else {
      if (this.capturedRoute <= 0) return;
      this.departureRoute = this.capturedRoute;
      this.inwardFall = true;
      this.activeThrust = -1.0;
      this.radialSpeed = 0.0;
      this.capturedRoute = -1;
    }
  }

  private advanceCaptured(dt: f64): void {
    this.angle += circularSpeedAtRadius(this.radius) / this.radius * dt;
  }

  private advanceOutwardJump(dt: f64): void {
    const previousRadius = this.radius;
    if (this.radialSpeed > 0.0) this.radialSpeed -= (this.outwardHeld ? OUTWARD_HOLD_GRAVITY : OUTWARD_RELEASE_GRAVITY) * dt;
    else this.radialSpeed -= OUTWARD_RELEASE_GRAVITY * dt;
    this.radius += this.radialSpeed * dt;
    this.angle += circularSpeedAtRadius(this.radius) / max(this.radius, 1.0) * dt;
    if (this.radialSpeed <= 0.0) this.captureFirstRingOnDescent(previousRadius);
  }

  private advanceInwardFall(dt: f64): void {
    const previousRadius = this.radius;
    this.radialSpeed = approach(this.radialSpeed, -INWARD_FALL_SPEED, INWARD_FALL_EASING * dt);
    this.radius += this.radialSpeed * dt;
    this.angle += circularSpeedAtRadius(this.radius) / max(this.radius, 1.0) * dt;
    const targetRoute = this.departureRoute - 1;
    const targetRadius = routeRadius(targetRoute);
    if (previousRadius > targetRadius && this.radius <= targetRadius) this.land(targetRoute, this.angle);
  }

  private captureFirstRingOnDescent(previousRadius: f64): void {
    for (let route = ROUTE_COUNT - 1; route >= 0; route -= 1) {
      const ringRadius = routeRadius(route);
      if (previousRadius > ringRadius && this.radius <= ringRadius) {
        this.land(route, this.angle);
        return;
      }
    }
  }
}

export function configureRoutes(inner: f64, outer: f64): void {
  assert(inner > 0.0, "The innermost route radius must be positive.");
  assert(outer > inner, "The outermost route must be beyond the innermost route.");
  innerRadius = inner;
  outerRadius = outer;
  simulationTime = 0.0;
  crashCount = 0;
  ship.land(1, 0.0);
  resetEnemy();
  resetPuzzle();
}

export function resetMotion(startAngle: f64, route: i32): void {
  assert(route >= 0 && route < ROUTE_COUNT, "A ship must start on a valid route.");
  ship.land(route, startAngle);
  crashCount = 0;
  resetEnemy();
  resetPuzzle();
}

export function advanceMotion(thrustIntent: f64, elapsedSeconds: f64): void {
  let remaining = clamp(elapsedSeconds, 0.0, 0.1);
  const command = thrustIntent > 0.15 ? 1.0 : thrustIntent < -0.15 ? -1.0 : 0.0;
  while (remaining > 0.0) {
    const dt = min(remaining, MAX_STEP_SECONDS);
    if (scoutAlive) ship.advance(activeShip == SCOUT ? command : 0.0, dt);
    advanceEnemy(dt);
    advancePuzzle(dt);
    simulationTime += dt;
    if (touchesPursuer()) destroyShip(enemyTarget);
    else if (scoutAlive && ship.capturedRoute >= 0 && touchesObstacle()) destroyShip(SCOUT);
    remaining -= dt;
  }
}

export function shipX(): f64 { return activeShip == SCOUT ? ship.x() : laserOriginX(); }
export function shipY(): f64 { return activeShip == SCOUT ? ship.y() : laserOriginY(); }
export function shipAngle(): f64 { return activeShip == SCOUT ? ship.angle : LASER_ANGLE; }
export function shipRadius(): f64 { return activeShip == SCOUT ? ship.radius : LASER_RADIUS; }
export function shipSpeed(): f64 { return activeShip == SCOUT ? ship.speed() : 0.0; }
export function radialVelocity(): f64 { return activeShip == SCOUT ? ship.radialSpeed : 0.0; }
export function programmedThrust(): f64 { return activeShip == SCOUT ? ship.activeThrust : 0.0; }
export function circularSpeed(route: i32): f64 { assert(route >= 0 && route < ROUTE_COUNT, "Route index is out of range."); return circularSpeedAtRadius(routeRadius(route)); }
export function shipCapturedRoute(): i32 { return activeShip == SCOUT ? ship.capturedRoute : 0; }
export function shipMotionMode(): i32 { return activeShip == SCOUT && ship.capturedRoute < 0 ? FLIGHT : CAPTURED; }
export function transitionProgress(): f64 { return activeShip == SCOUT && ship.capturedRoute < 0 ? clamp(Math.abs(ship.radius - routeRadius(ship.departureRoute)) / routeSpacing(), 0.0, 1.0) : 0.0; }
export function elapsedTime(): f64 { return simulationTime; }
export function crashes(): i32 { return crashCount; }
export function routeCount(): i32 { return ROUTE_COUNT; }
export function obstacleCount(): i32 { return OBSTACLE_COUNT; }
export function obstacleAngle(index: i32): f64 { assert(index >= 0 && index < OBSTACLE_COUNT, "Obstacle index is out of range."); return wrapAngle(obstacleBaseAngle(index) - obstacleAngularSpeed(index) * simulationTime); }
export function enemyX(): f64 { return enemy.x(); }
export function enemyY(): f64 { return enemy.y(); }
export function enemyMotionMode(): i32 { return enemyDestroyed ? 2 : enemyMode; }
export function enemyCapturedRoute(): i32 { return enemy.capturedRoute; }
export function enemyDetectionRadius(): f64 { return ENEMY_DETECTION_RADIUS; }
export function goalX(): f64 { return laserTargetX(); }
export function goalY(): f64 { return laserTargetY(); }
export function isGoalReached(): i32 { return targetDestroyed ? 1 : 0; }
export function goalsCompleted(): i32 { return targetDestroyed ? 1 : 0; }
export function asteroidX(): f64 { return asteroidPositionX; }
export function asteroidY(): f64 { return asteroidPositionY; }
export function laserOriginX(): f64 { return Math.cos(LASER_ANGLE) * LASER_RADIUS; }
export function laserOriginY(): f64 { return Math.sin(LASER_ANGLE) * LASER_RADIUS; }
export function laserTargetX(): f64 { return Math.cos(LASER_ANGLE) * TARGET_RADIUS; }
export function laserTargetY(): f64 { return Math.sin(LASER_ANGLE) * TARGET_RADIUS; }
export function laserChargeLevel(): f64 { return laserCharge; }
export function isTargetDestroyed(): i32 { return targetDestroyed ? 1 : 0; }
export function enemyShotLevel(): f64 { return enemyShotTimer / ENEMY_SHOT_DURATION; }
export function enemyAimLevel(): f64 { return enemyAimTimer / ENEMY_AIM_DURATION; }
export function enemyAimStartX(): f64 { return lockedAimOriginX; }
export function enemyAimStartY(): f64 { return lockedAimOriginY; }
export function enemyAimTargetX(): f64 { return lockedAimTargetX; }
export function enemyAimTargetY(): f64 { return lockedAimTargetY; }
export function enemyPelletX(): f64 { return pelletPositionX; }
export function enemyPelletY(): f64 { return pelletPositionY; }
export function enemyPelletActive(): i32 { return pelletActive ? 1 : 0; }
export function activeShipIndex(): i32 { return activeShip; }
export function isScoutAlive(): i32 { return scoutAlive ? 1 : 0; }
export function isLaserAlive(): i32 { return laserAlive ? 1 : 0; }
export function isGameOver(): i32 { return gameOver ? 1 : 0; }
export function switchShip(direction: i32): void {
  if (gameOver) return;
  if (direction != 0 && ((activeShip == SCOUT && laserAlive) || (activeShip == LASER_SHIP && scoutAlive))) activeShip = activeShip == SCOUT ? LASER_SHIP : SCOUT;
}
export function fireLaser(): void {
  if (!laserAlive || activeShip != LASER_SHIP || enemyDestroyed) return;
  laserFireTimer = LASER_FIRE_DURATION;
  laserCharge = 1.0;
  if (laserPathBlocked()) return;
  if (pointHitsSegment(enemy.x(), enemy.y(), laserOriginX(), laserOriginY(), laserTargetX(), laserTargetY(), PURSUER_COLLISION_RADIUS)) { enemyDestroyed = true; targetDestroyed = true; }
}

function advanceEnemy(dt: f64): void {
  if (enemyDestroyed) return;
  const detected = detectedShip();
  const withinDetection = detected >= 0;
  if (enemyMode == ENEMY_SCANNING) {
    if (!withinDetection) {
      enemy.advance(0.0, dt);
      return;
    }
    enemyTarget = detected;
    enemyMode = ENEMY_CHASING;
  } else if (!withinDetection || !isShipAlive(enemyTarget)) {
    enemyMode = ENEMY_SCANNING;
    enemy.advance(0.0, dt);
    return;
  }
  enemy.advance(enemyCommand(), dt);
}

function advancePuzzle(dt: f64): void {
  advanceEnemyWeapon(dt);
  advanceEnemyPellet(dt);
  asteroidPositionX += asteroidVelocityX * dt;
  asteroidPositionY += asteroidVelocityY * dt;
  const damping = max(0.0, 1.0 - ASTEROID_DAMPING * dt);
  asteroidVelocityX *= damping;
  asteroidVelocityY *= damping;
  advanceLaser(dt);
}

function advanceEnemyWeapon(dt: f64): void {
  enemyShotTimer = max(0.0, enemyShotTimer - dt);
  enemyFireCooldown = max(0.0, enemyFireCooldown - dt);
  if (enemyDestroyed) {
    enemyAimTimer = 0.0;
    return;
  }
  if (!scoutAlive) {
    enemyAimTimer = 0.0;
    return;
  }
  if (enemyAimTimer > 0.0) {
    enemyAimTimer = max(0.0, enemyAimTimer - dt);
    if (enemyAimTimer > 0.0) return;
    fireEnemyShot(lockedAimOriginX, lockedAimOriginY, lockedAimTargetX, lockedAimTargetY);
    return;
  }
  if (segmentHitsAsteroid(enemy.x(), enemy.y(), targetX(), targetY())) {
    fireEnemyShot(enemy.x(), enemy.y(), targetX(), targetY());
    return;
  }
  if (enemyFireCooldown > 0.0) return;
  lockedAimOriginX = enemy.x();
  lockedAimOriginY = enemy.y();
  lockedAimTargetX = targetX();
  lockedAimTargetY = targetY();
  enemyAimTimer = ENEMY_AIM_DURATION;
}

function fireEnemyShot(originX: f64, originY: f64, targetX: f64, targetY: f64): void {
  enemyShotTimer = ENEMY_SHOT_DURATION;
  enemyFireCooldown = 1.1 + Math.abs(Math.sin(simulationTime * 1.73)) * (ENEMY_FIRE_INTERVAL - 1.1);
  lockedAimOriginX = originX;
  lockedAimOriginY = originY;
  lockedAimTargetX = targetX;
  lockedAimTargetY = targetY;
  const deltaX = targetX - originX;
  const deltaY = targetY - originY;
  const length = max(Math.sqrt(deltaX * deltaX + deltaY * deltaY), 0.001);
  pelletPositionX = originX;
  pelletPositionY = originY;
  pelletVelocityX = deltaX / length * ENEMY_PELLET_SPEED;
  pelletVelocityY = deltaY / length * ENEMY_PELLET_SPEED;
  pelletActive = true;
}

function advanceEnemyPellet(dt: f64): void {
  if (!pelletActive) return;
  pelletPositionX += pelletVelocityX * dt;
  pelletPositionY += pelletVelocityY * dt;
  const asteroidDx = pelletPositionX - asteroidPositionX;
  const asteroidDy = pelletPositionY - asteroidPositionY;
  const asteroidHitRadius = ASTEROID_RADIUS + ENEMY_PELLET_RADIUS;
  if (asteroidDx * asteroidDx + asteroidDy * asteroidDy <= asteroidHitRadius * asteroidHitRadius) {
    asteroidVelocityX = -Math.sin(LASER_ANGLE) * ASTEROID_PUSH_SPEED;
    asteroidVelocityY = Math.cos(LASER_ANGLE) * ASTEROID_PUSH_SPEED;
    pelletActive = false;
    return;
  }
  const shipDx = pelletPositionX - targetX();
  const shipDy = pelletPositionY - targetY();
  const shipHitRadius = ENEMY_PELLET_RADIUS + 10.0;
  if (shipDx * shipDx + shipDy * shipDy <= shipHitRadius * shipHitRadius) {
    destroyShip(enemyTarget);
    return;
  }
  if (Math.abs(pelletPositionX) > outerRadius * 1.4 || Math.abs(pelletPositionY) > outerRadius * 1.4) pelletActive = false;
}

function advanceLaser(dt: f64): void {
  laserFireTimer = max(0.0, laserFireTimer - dt);
  laserCharge = laserFireTimer / LASER_FIRE_DURATION;
}

function laserPathBlocked(): bool { return segmentHitsAsteroid(laserOriginX(), laserOriginY(), laserTargetX(), laserTargetY()); }
function segmentHitsAsteroid(startX: f64, startY: f64, endX: f64, endY: f64): bool {
  return pointHitsSegment(asteroidPositionX, asteroidPositionY, startX, startY, endX, endY, ASTEROID_RADIUS);
}

function pointHitsSegment(pointX: f64, pointY: f64, startX: f64, startY: f64, endX: f64, endY: f64, radius: f64): bool {
  const deltaX = endX - startX;
  const deltaY = endY - startY;
  const lengthSquared = max(deltaX * deltaX + deltaY * deltaY, 0.001);
  const along = clamp(((pointX - startX) * deltaX + (pointY - startY) * deltaY) / lengthSquared, 0.0, 1.0);
  const closestX = startX + deltaX * along;
  const closestY = startY + deltaY * along;
  const dx = pointX - closestX;
  const dy = pointY - closestY;
  return dx * dx + dy * dy <= radius * radius;
}

function enemyCommand(): f64 {
  if (enemy.capturedRoute < 0) {
    if (!enemy.inwardFall && enemy.radialSpeed > 0.0 && desiredEnemyRoute() > enemy.departureRoute) return 1.0;
    return 0.0;
  }
  const desiredRoute = desiredEnemyRoute();
  if (desiredRoute > enemy.capturedRoute) return 1.0;
  if (desiredRoute < enemy.capturedRoute) return -1.0;
  const angularDifference = signedAngularDelta(enemy.angle, ship.angle);
  if (angularDifference > 0.16 && enemy.capturedRoute > 0) return -1.0;
  return 0.0;
}

function desiredEnemyRoute(): i32 {
  if (enemyTarget == LASER_SHIP) return 0;
  if (ship.capturedRoute >= 0) return ship.capturedRoute;
  return nearestRoute(ship.radius);
}

function nearestRoute(radius: f64): i32 {
  let nearest = 0;
  let nearestDistance = Math.abs(radius - routeRadius(0));
  for (let route = 1; route < ROUTE_COUNT; route += 1) {
    const distance = Math.abs(radius - routeRadius(route));
    if (distance < nearestDistance) { nearest = route; nearestDistance = distance; }
  }
  return nearest;
}

function touchesObstacle(): bool {
  const collisionRadiusSquared = COLLISION_RADIUS * COLLISION_RADIUS;
  for (let index = 0; index < OBSTACLE_COUNT; index += 1) {
    if (index != ship.capturedRoute) continue;
    const obstacleRadius = routeRadius(index);
    const obstaclePosX = Math.cos(obstacleAngle(index)) * obstacleRadius;
    const obstaclePosY = Math.sin(obstacleAngle(index)) * obstacleRadius;
    const dx = ship.x() - obstaclePosX;
    const dy = ship.y() - obstaclePosY;
    if (dx * dx + dy * dy <= collisionRadiusSquared) return true;
  }
  return false;
}

function touchesPursuer(): bool {
  if (enemyDestroyed) return false;
  const dx = targetX() - enemy.x();
  const dy = targetY() - enemy.y();
  return dx * dx + dy * dy <= PURSUER_COLLISION_RADIUS * PURSUER_COLLISION_RADIUS;
}

function detectedShip(): i32 {
  if (scoutAlive && distanceSquared(ship.x(), ship.y(), enemy.x(), enemy.y()) <= ENEMY_DETECTION_RADIUS * ENEMY_DETECTION_RADIUS) return SCOUT;
  return -1;
}
function targetX(): f64 { return enemyTarget == SCOUT ? ship.x() : laserOriginX(); }
function targetY(): f64 { return enemyTarget == SCOUT ? ship.y() : laserOriginY(); }
function isShipAlive(index: i32): bool { return index == SCOUT ? scoutAlive : laserAlive; }
function distanceSquared(ax: f64, ay: f64, bx: f64, by: f64): f64 { const dx = ax - bx; const dy = ay - by; return dx * dx + dy * dy; }

function recoverFromCollision(): void { destroyShip(activeShip); }
function destroyShip(index: i32): void {
  if (!isShipAlive(index)) return;
  if (index == SCOUT) scoutAlive = false;
  else laserAlive = false;
  crashCount += 1;
  pelletActive = false;
  if (enemyTarget == index) enemyMode = ENEMY_SCANNING;
  if (activeShip == index) {
    if (scoutAlive) activeShip = SCOUT;
    else if (laserAlive) activeShip = LASER_SHIP;
    else gameOver = true;
  }
}
function resetEnemy(): void {
  enemy.land(2, 1.08);
  enemyMode = ENEMY_SCANNING;
}
function resetPuzzle(): void {
  asteroidPositionX = Math.cos(LASER_ANGLE) * ASTEROID_START_RADIUS;
  asteroidPositionY = Math.sin(LASER_ANGLE) * ASTEROID_START_RADIUS;
  asteroidVelocityX = 0.0;
  asteroidVelocityY = 0.0;
  enemyFireCooldown = 0.0;
  enemyAimTimer = 0.0;
  enemyShotTimer = 0.0;
  lockedAimOriginX = 0.0;
  lockedAimOriginY = 0.0;
  lockedAimTargetX = 0.0;
  lockedAimTargetY = 0.0;
  pelletActive = false;
  pelletPositionX = 0.0;
  pelletPositionY = 0.0;
  pelletVelocityX = 0.0;
  pelletVelocityY = 0.0;
  laserCharge = 0.0;
  laserFireTimer = 0.0;
  targetDestroyed = false;
  enemyDestroyed = false;
  scoutAlive = true;
  laserAlive = true;
  activeShip = SCOUT;
  gameOver = false;
  enemyTarget = SCOUT;
}
function circularSpeedAtRadius(value: f64): f64 { return Math.sqrt(GRAVITY_PARAMETER / value); }
function routeSpacing(): f64 { return (outerRadius - innerRadius) / <f64>(ROUTE_COUNT - 1); }
function routeRadius(route: i32): f64 { return innerRadius + routeSpacing() * <f64>route; }
function obstacleBaseAngle(route: i32): f64 { return 0.8 + <f64>route * 2.03; }
function obstacleAngularSpeed(route: i32): f64 { return 0.32 + <f64>route * 0.04; }
function signedAngularDelta(from: f64, to: f64): f64 { return wrapAngle(to - from + Math.PI) - Math.PI; }
function wrapAngle(value: f64): f64 { let wrapped = value % (Math.PI * 2.0); if (wrapped < 0.0) wrapped += Math.PI * 2.0; return wrapped; }
function approach(current: f64, target: f64, amount: f64): f64 { return current < target ? min(current + amount, target) : max(current - amount, target); }
function clamp(value: f64, low: f64, high: f64): f64 { return min(max(value, low), high); }
