/**
 * Byte layout of the GPU buffers. These constants are duplicated structurally
 * in `src/gpu/shaders/simulation.wgsl`; `test/wgsl-contract.test.js` fails if
 * the two ever drift.
 */

/** `pos: vec2f, vel: vec2f, color: u32, last_cell: u32, rest: u32, flags: u32`. */
export const PARTICLE_STRIDE_BYTES = 32;
export const PARTICLE_POS_X = 0;
export const PARTICLE_VEL_X = 2;
export const PARTICLE_COLOR = 4;
export const PARTICLE_LAST_CELL = 5;
export const PARTICLE_REST = 6;
export const PARTICLE_FLAGS = 7;

export const FLAG_ALIVE = 1;
export const FLAG_DEPOSIT = 2;

/** `Params` is 24 words; the trailing pair pads it to a 16-byte multiple. */
export const PARAMS_BYTES = 96;

/** Word indices into the `Params` uniform. `U_` is `u32`, `F_` is `f32`. */
export const U_WORLD_X = 0;
export const U_WORLD_Y = 1;
export const U_CAPACITY = 2;
export const U_RING_MASK = 3;
export const F_GRAVITY = 4;
export const F_DT = 5;
export const F_DAMPING = 6;
export const F_RESTITUTION = 7;
export const U_REST_THRESHOLD = 8;
export const U_FRAME = 9;
export const F_INTAKE_CHANCE = 10;
export const U_INTAKE_ROWS = 11;
export const F_FOUNTAIN_X = 12;
export const F_FOUNTAIN_SPREAD = 13;
export const F_FOUNTAIN_SPEED = 14;
export const F_DISLODGE_SPEED = 15;
// `blast: vec4f` needs 16-byte alignment, which word 16 already satisfies.
export const F_BLAST_X = 16;
export const F_BLAST_Y = 17;
export const F_BLAST_RADIUS = 18;
export const F_BLAST_STRENGTH = 19;
export const F_VIEWPORT_X = 20;
export const F_VIEWPORT_Y = 21;

/**
 * @typedef {{
 *   world: { width: number, height: number },
 *   capacity: number, ringMask: number,
 *   gravity: number, dt: number, damping: number, restitution: number,
 *   restThreshold: number, frame: number,
 *   intakeChance: number, intakeRows: number,
 *   fountain: { x: number, spread: number, speed: number },
 *   dislodgeSpeed: number,
 *   blast: { x: number, y: number, radius: number, strength: number },
 *   viewport: { width: number, height: number }
 * }} SimulationParams
 */

/**
 * Fills a `PARAMS_BYTES` buffer from a plain parameter object.
 *
 * @param {ArrayBuffer} target
 * @param {SimulationParams} params
 * @returns {ArrayBuffer} the same buffer, for chaining
 */
export function writeParams(target, params) {
  if (target.byteLength < PARAMS_BYTES) {
    throw new Error(`Params buffer must be at least ${PARAMS_BYTES} bytes.`);
  }
  const u = new Uint32Array(target);
  const f = new Float32Array(target);
  u[U_WORLD_X] = params.world.width;
  u[U_WORLD_Y] = params.world.height;
  u[U_CAPACITY] = params.capacity;
  u[U_RING_MASK] = params.ringMask;
  f[F_GRAVITY] = params.gravity;
  f[F_DT] = params.dt;
  f[F_DAMPING] = params.damping;
  f[F_RESTITUTION] = params.restitution;
  u[U_REST_THRESHOLD] = params.restThreshold;
  u[U_FRAME] = params.frame;
  f[F_INTAKE_CHANCE] = params.intakeChance;
  u[U_INTAKE_ROWS] = params.intakeRows;
  f[F_FOUNTAIN_X] = params.fountain.x;
  f[F_FOUNTAIN_SPREAD] = params.fountain.spread;
  f[F_FOUNTAIN_SPEED] = params.fountain.speed;
  f[F_DISLODGE_SPEED] = params.dislodgeSpeed;
  f[F_BLAST_X] = params.blast.x;
  f[F_BLAST_Y] = params.blast.y;
  f[F_BLAST_RADIUS] = params.blast.radius;
  f[F_BLAST_STRENGTH] = params.blast.strength;
  f[F_VIEWPORT_X] = params.viewport.width;
  f[F_VIEWPORT_Y] = params.viewport.height;
  return target;
}

/** Workgroup size shared by every compute entry point. */
export const WORKGROUP_SIZE = 256;

/**
 * Compute entry points, in dispatch order. `integrate` runs once per physics
 * substep; every other pass runs once per rendered frame.
 */
export const COMPUTE_PASSES = ["prepare", "integrate", "advance", "settle", "emit", "splat"];

/**
 * @param {number} items
 * @returns {number} workgroup count needed to cover `items` invocations
 */
export function workgroupCount(items) {
  return Math.max(1, Math.ceil(items / WORKGROUP_SIZE));
}
