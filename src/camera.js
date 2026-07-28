export class Camera {
  /**
   * @param {number} viewportWidth
   * @param {number} viewportHeight
   * @param {{ minZoom?: number, maxZoom?: number, worldSize?: number }} options
   */
  constructor(viewportWidth, viewportHeight, options = {}) {
    this.viewportWidth = viewportWidth;
    this.viewportHeight = viewportHeight;
    this.minZoom = options.minZoom ?? 0.5;
    this.maxZoom = options.maxZoom ?? 32;
    this.worldSize = options.worldSize ?? 1_000;
    this.zoom = 1;
    this.centerX = this.worldSize / 2;
    this.centerY = this.worldSize / 2;
  }

  /** @param {number} width @param {number} height */
  resize(width, height) {
    this.viewportWidth = width;
    this.viewportHeight = height;
  }

  /** @param {number} worldX @param {number} worldY */
  centerOn(worldX, worldY) {
    this.centerX = worldX;
    this.centerY = worldY;
    this.#clampCenter();
  }

  /** @param {number} worldX @param {number} worldY */
  worldToScreen(worldX, worldY) {
    return {
      x: (worldX - this.centerX) * this.zoom + this.viewportWidth / 2,
      y: (worldY - this.centerY) * this.zoom + this.viewportHeight / 2,
    };
  }

  /** @param {number} screenX @param {number} screenY */
  screenToWorld(screenX, screenY) {
    return {
      x: (screenX - this.viewportWidth / 2) / this.zoom + this.centerX,
      y: (screenY - this.viewportHeight / 2) / this.zoom + this.centerY,
    };
  }

  /**
   * Zoom by a multiplier while preserving the location under the cursor.
   * @param {number} factor
   * @param {number} screenX
   * @param {number} screenY
   */
  zoomAt(factor, screenX, screenY) {
    const anchorBefore = this.screenToWorld(screenX, screenY);
    this.zoom = Math.min(
      this.maxZoom,
      Math.max(this.minZoom, this.zoom * factor),
    );
    const anchorAfter = this.screenToWorld(screenX, screenY);
    this.centerX += anchorBefore.x - anchorAfter.x;
    this.centerY += anchorBefore.y - anchorAfter.y;
    this.#clampCenter();
  }

  /**
   * Pan by a screen-space drag delta.
   * @param {number} deltaX
   * @param {number} deltaY
   */
  panBy(deltaX, deltaY) {
    this.centerX -= deltaX / this.zoom;
    this.centerY -= deltaY / this.zoom;
    this.#clampCenter();
  }

  visibleBounds() {
    return {
      left: this.centerX - this.viewportWidth / (2 * this.zoom),
      right: this.centerX + this.viewportWidth / (2 * this.zoom),
      top: this.centerY - this.viewportHeight / (2 * this.zoom),
      bottom: this.centerY + this.viewportHeight / (2 * this.zoom),
    };
  }

  #clampCenter() {
    this.centerX = Math.min(this.worldSize, Math.max(0, this.centerX));
    this.centerY = Math.min(this.worldSize, Math.max(0, this.centerY));
  }
}
