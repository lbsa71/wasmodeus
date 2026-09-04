/**
 * View onto a world far larger than the screen.
 *
 * The camera is an origin plus a scale: `x, y` are the world coordinates at the
 * bottom-left corner of the viewport, and `scale` is device pixels per world
 * pixel. Everything is in device pixels, matching what the composite shader
 * gets in `@builtin(position)`.
 */

/** Zoomed all the way in, one world pixel covers this many device pixels. */
export const MAX_SCALE = 8;

/**
 * @typedef {{ x: number, y: number, scale: number }} Camera
 * @typedef {{ width: number, height: number }} Size
 */

/** @param {number} value @param {number} low @param {number} high @returns {number} */
function clamp(value, low, high) {
  return Math.min(high, Math.max(low, value));
}

/**
 * The most zoomed-out the camera may go: the whole world just fits.
 *
 * @param {Size} world @param {Size} viewport
 * @returns {number}
 */
export function minScale(world, viewport) {
  if (world.width <= 0 || world.height <= 0) return MAX_SCALE;
  return Math.min(viewport.width / world.width, viewport.height / world.height);
}

/**
 * Keeps the view over the world: clamped while the world is bigger than the
 * view, centred once it is not.
 *
 * @param {Camera} camera @param {Size} world @param {Size} viewport
 * @returns {Camera}
 */
export function clampCamera(camera, world, viewport) {
  const scale = clamp(camera.scale, minScale(world, viewport), MAX_SCALE);
  const visibleWidth = viewport.width / scale;
  const visibleHeight = viewport.height / scale;
  const x = visibleWidth >= world.width
    ? (world.width - visibleWidth) / 2
    : clamp(camera.x, 0, world.width - visibleWidth);
  const y = visibleHeight >= world.height
    ? (world.height - visibleHeight) / 2
    : clamp(camera.y, 0, world.height - visibleHeight);
  return { x, y, scale };
}

/**
 * @param {Size} world @param {Size} viewport
 * @param {{ x?: number, y?: number, scale?: number }} [start] world point to centre on
 * @returns {Camera}
 */
export function createCamera(world, viewport, start = {}) {
  const scale = start.scale ?? 1;
  return clampCamera({
    x: (start.x ?? world.width / 2) - viewport.width / (2 * scale),
    y: (start.y ?? world.height / 2) - viewport.height / (2 * scale),
    scale,
  }, world, viewport);
}

/**
 * Drag-to-pan. The world follows the pointer, so dragging right reveals what
 * is to the left.
 *
 * @param {Camera} camera @param {number} dx @param {number} dy device pixels
 * @param {Size} world @param {Size} viewport
 * @returns {Camera}
 */
export function panCamera(camera, dx, dy, world, viewport) {
  // Screen y runs down and world y runs up, so the vertical term is not negated.
  return clampCamera({
    x: camera.x - dx / camera.scale,
    y: camera.y + dy / camera.scale,
    scale: camera.scale,
  }, world, viewport);
}

/**
 * Zooms about a screen point, keeping the world pixel under it pinned.
 *
 * @param {Camera} camera @param {number} factor
 * @param {number} screenX @param {number} screenY device pixels
 * @param {Size} world @param {Size} viewport
 * @returns {Camera}
 */
export function zoomCameraAt(camera, factor, screenX, screenY, world, viewport) {
  const anchor = worldFromScreen(camera, viewport, screenX, screenY);
  // Clamp the scale before re-deriving the origin, or the anchor drifts at the
  // limits instead of simply stopping.
  const scale = clamp(camera.scale * factor, minScale(world, viewport), MAX_SCALE);
  return clampCamera({
    x: anchor.x - screenX / scale,
    y: anchor.y - (viewport.height - screenY) / scale,
    scale,
  }, world, viewport);
}

/**
 * @param {Camera} camera @param {Size} viewport
 * @param {number} screenX @param {number} screenY device pixels, y down
 * @returns {{ x: number, y: number }} world coordinates, y up
 */
export function worldFromScreen(camera, viewport, screenX, screenY) {
  return {
    x: camera.x + screenX / camera.scale,
    y: camera.y + (viewport.height - screenY) / camera.scale,
  };
}

/**
 * @param {Camera} camera @param {Size} viewport
 * @returns {{ x: number, y: number, width: number, height: number }} world rect on screen
 */
export function visibleWorldRect(camera, viewport) {
  return {
    x: camera.x,
    y: camera.y,
    width: viewport.width / camera.scale,
    height: viewport.height / camera.scale,
  };
}

/**
 * @param {number} scale
 * @returns {string} a readable zoom, e.g. `2.0x` or `1:4`
 */
export function formatScale(scale) {
  return scale >= 1 ? `${scale.toFixed(1)}x` : `1:${(1 / scale).toFixed(1)}`;
}
