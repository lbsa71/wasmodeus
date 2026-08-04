export const MIN_ZOOM_PARSECS = 1e-12;
export const MAX_ZOOM_PARSECS = 128_000;
const WHEEL_ZOOM_SENSITIVITY = 0.004;

/** @param {number} aspect @param {number} [zoomParsecs] */
export function createGalaxyCamera(aspect, zoomParsecs = 16_000) {
  return withMatrix({ positionParsecs: [0, 0, 0], zoomParsecs, aspect });
}

/** @param {{ positionParsecs: number[], zoomParsecs: number, aspect: number }} camera */
function withMatrix(camera) {
  return { ...camera, viewProjection: new Float32Array([1 / (camera.zoomParsecs * camera.aspect), 0, 0, 0, 0, 1 / camera.zoomParsecs, 0, 0, 0, 0, 1 / 128_000, 0, 0, 0, 0, 1]) };
}

/** @param {{ positionParsecs: number[], zoomParsecs: number, aspect: number }} camera @param {number} deltaXParsecs @param {number} deltaYParsecs */
export function panCamera(camera, deltaXParsecs, deltaYParsecs) {
  return withMatrix({ ...camera, positionParsecs: [camera.positionParsecs[0] - deltaXParsecs, camera.positionParsecs[1] - deltaYParsecs, camera.positionParsecs[2]] });
}

/** @param {{ positionParsecs: number[], zoomParsecs: number, aspect: number }} camera @param {number} wheelDelta */
export function zoomCamera(camera, wheelDelta) {
  return zoomCameraAt(camera, wheelDelta, 0, 0);
}

/**
 * Changes magnification while preserving the world point beneath a normalized
 * cursor.  x/y are clip-space coordinates (-1..1), with y positive upwards.
 * @param {{ positionParsecs: number[], zoomParsecs: number, aspect: number }} camera
 * @param {number} wheelDelta
 * @param {number} normalizedX
 * @param {number} normalizedY
 */
export function zoomCameraAt(camera, wheelDelta, normalizedX, normalizedY) {
  const zoomParsecs = Math.max(MIN_ZOOM_PARSECS, Math.min(MAX_ZOOM_PARSECS, camera.zoomParsecs * Math.exp(-wheelDelta * WHEEL_ZOOM_SENSITIVITY)));
  const zoomChange = camera.zoomParsecs - zoomParsecs;
  return withMatrix({
    ...camera,
    positionParsecs: [
      camera.positionParsecs[0] + (normalizedX * camera.aspect * zoomChange),
      camera.positionParsecs[1] + (normalizedY * zoomChange),
      camera.positionParsecs[2],
    ],
    zoomParsecs,
  });
}

/** @param {{ positionParsecs: number[], zoomParsecs: number }} camera @param {number} aspect */
export function resizeCamera(camera, aspect) { return withMatrix({ ...camera, aspect }); }
