export const SCENE_UNIFORM_FLOATS = 40;
export const ROUTE_COUNT = 4;
export const INNER_ROUTE_RADIUS = 140;
export const OUTER_ROUTE_RADIUS = 560;
export const VIEW_RADIUS = 300;

/**
 * @param {{x: number, y: number, angle: number, heading?: number, radius: number, route: number, mode: number, activeShip?: number, transitionProgress?: number, time?: number, enemyX?: number, enemyY?: number, enemyMode?: number, enemyDetectionRadius?: number, goalX?: number, goalY?: number, goalReached?: boolean, laserOriginX?: number, laserOriginY?: number, laserTargetX?: number, laserTargetY?: number, asteroidX?: number, asteroidY?: number, laserCharge?: number, enemyAimStartX?: number, enemyAimStartY?: number, enemyAimTargetX?: number, enemyAimTargetY?: number, enemyPelletX?: number, enemyPelletY?: number, enemyPelletActive?: boolean, targetDestroyed?: boolean}} snapshot
 * @param {number} width
 * @param {number} height
 * @param {number} [timeSeconds]
 * @param {{x: number, y: number, rotation?: number, viewRadius?: number}} [camera]
 */
export function createSceneUniforms(snapshot, width, height, timeSeconds = 0, camera = { x: 0, y: 0 }) {
  const data = new Float32Array(SCENE_UNIFORM_FLOATS);
  data[0] = width / Math.max(1, height);
  data[1] = (camera.viewRadius ?? VIEW_RADIUS) / Math.min(1, data[0]);
  data[2] = 400;
  data[3] = INNER_ROUTE_RADIUS;
  data[4] = snapshot.x;
  data[5] = snapshot.y;
  data[6] = snapshot.heading ?? snapshot.angle;
  data[7] = snapshot.route;
  data[8] = OUTER_ROUTE_RADIUS;
  data[9] = snapshot.mode;
  data[10] = snapshot.time ?? timeSeconds;
  data[11] = snapshot.transitionProgress ?? 0;
  data[12] = camera.x;
  data[13] = camera.y;
  data[14] = camera.rotation ?? 0;
  data[15] = snapshot.activeShip ?? 0;
  data[16] = snapshot.enemyX ?? 0;
  data[17] = snapshot.enemyY ?? 0;
  data[18] = snapshot.enemyMode ?? 0;
  data[19] = snapshot.enemyDetectionRadius ?? 0;
  data[20] = snapshot.goalX ?? 0;
  data[21] = snapshot.goalY ?? 0;
  data[22] = snapshot.goalReached ? 1 : 0;
  data[24] = snapshot.laserOriginX ?? 0;
  data[25] = snapshot.laserOriginY ?? 0;
  data[26] = snapshot.laserTargetX ?? snapshot.goalX ?? 0;
  data[27] = snapshot.laserTargetY ?? snapshot.goalY ?? 0;
  data[28] = snapshot.asteroidX ?? 0;
  data[29] = snapshot.asteroidY ?? 0;
  data[30] = 26;
  data[31] = snapshot.laserCharge ?? 0;
  data[32] = snapshot.enemyAimStartX ?? 0;
  data[33] = snapshot.enemyAimStartY ?? 0;
  data[34] = snapshot.enemyAimTargetX ?? 0;
  data[35] = snapshot.enemyAimTargetY ?? 0;
  data[36] = snapshot.targetDestroyed ? 1 : 0;
  data[37] = snapshot.enemyPelletX ?? 0;
  data[38] = snapshot.enemyPelletY ?? 0;
  data[39] = snapshot.enemyPelletActive ? 1 : 0;
  return data;
}
