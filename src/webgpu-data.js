export const SCENE_UNIFORM_BYTES = 48;

/**
 * Pack values in the exact layout shared by both WGSL pipelines.
 * @param {{
 *   centerX: number,
 *   centerY: number,
 *   pixelRatio: number,
 *   roadHalfWidth: number,
 *   roadTileCount: number,
 *   viewportHeight: number,
 *   viewportWidth: number,
 *   worldSize: number,
 *   zoom: number,
 * }} scene
 */
export function createSceneUniform(scene) {
  return new Float32Array([
    scene.viewportWidth * scene.pixelRatio,
    scene.viewportHeight * scene.pixelRatio,
    scene.centerX,
    scene.centerY,
    scene.zoom * scene.pixelRatio,
    scene.worldSize,
    scene.roadHalfWidth,
    scene.roadTileCount,
    scene.pixelRatio,
    scene.zoom,
    0,
    0,
  ]);
}

/** @param {number} carCount */
export function carStorageByteLength(carCount) {
  return Math.max(4, Math.max(0, Math.floor(carCount)) * Float32Array.BYTES_PER_ELEMENT);
}

/** @param {number} tileCount */
export function tileStorageByteLength(tileCount) {
  const bytes = Math.max(0, Math.floor(tileCount));
  return Math.max(4, Math.ceil(bytes / 4) * 4);
}

/**
 * Resolve a crisp canvas resolution without exceeding the GPU texture limit.
 * @param {number} cssWidth
 * @param {number} cssHeight
 * @param {number} requestedPixelRatio
 * @param {number} maximumDimension
 */
export function preferredCanvasSize(
  cssWidth,
  cssHeight,
  requestedPixelRatio,
  maximumDimension,
) {
  const safeWidth = Math.max(1, cssWidth);
  const safeHeight = Math.max(1, cssHeight);
  const pixelRatio = Math.min(
    Math.max(1, requestedPixelRatio),
    maximumDimension / safeWidth,
    maximumDimension / safeHeight,
  );

  return {
    height: Math.round(safeHeight * pixelRatio),
    pixelRatio,
    width: Math.round(safeWidth * pixelRatio),
  };
}
