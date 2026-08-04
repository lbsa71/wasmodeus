import { createStarRenderBuffer, writeStarRecord } from "../render/star-data.js";

export const DEFAULT_STAR_SNAPSHOT_LIMIT = 16_384;
/** Record flag consumed by the shader to draw a leaf-sector outline. */
export const SECTOR_GRID_FLAG = 1;
/** Record flag for a physical-radius planet disk. */
export const PLANET_DISK_FLAG = 2;

/** @param {number} temperatureKelvin */
export function packStarColor(temperatureKelvin) {
  const normalized = Math.max(0, Math.min(1, (temperatureKelvin - 2_600) / 5_800));
  const red = Math.round(255 * (1 - (0.2 * normalized)));
  const green = Math.round(120 + (125 * normalized));
  const blue = Math.round(80 + (175 * normalized));
  return ((255 << 24) | (blue << 16) | (green << 8) | red) >>> 0;
}

/** @param {number} apparentPixelRadius */
export function shouldSubdivideOctreeNode(apparentPixelRadius) {
  return apparentPixelRadius > 4;
}

/** @param {Array<{ position: number[], apparentFlux: number, color: number, pickHandle: number, flags?: number, radius?: number }>} stars */
export function encodeStarSnapshot(stars) {
  const buffer = createStarRenderBuffer(stars.length);
  stars.forEach((star, index) => writeStarRecord(buffer, index, { ...star, flags: star.flags ?? 0, radius: star.radius ?? 1 }));
  return buffer;
}
