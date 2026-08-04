export const STAR_RECORD_BYTES = 32;

/** @param {number} count */
export function createStarRenderBuffer(count) {
  return new ArrayBuffer(count * STAR_RECORD_BYTES);
}

/** @param {ArrayBuffer} buffer @param {number} index @param {{ position: number[], apparentFlux: number, color: number, pickHandle: number, flags: number, radius: number }} star */
export function writeStarRecord(buffer, index, star) {
  const offset = index * STAR_RECORD_BYTES;
  const floats = new Float32Array(buffer, offset, 4);
  const integers = new Uint32Array(buffer, offset + 16, 4);
  floats.set([star.position[0], star.position[1], star.position[2], star.apparentFlux]);
  integers.set([star.color >>> 0, star.pickHandle >>> 0, star.flags >>> 0]);
  new Float32Array(buffer, offset + 28, 1)[0] = star.radius;
}
