/**
 * Byte layout of the GPU buffers. These constants are duplicated structurally
 * in `src/gpu/shaders/simulation.wgsl`; `test/wgsl-contract.test.js` fails if
 * the two ever drift.
 */

/**
 * `pos_x: f32, pos_y: f32, vel_x: f32, vel_y: f32, last_cell: u32`.
 *
 * Scalars rather than `vec2f` on purpose: a `vec2f` would align the struct to
 * eight bytes and pad it back up to 24. At twenty bytes a two-gigabyte storage
 * binding — the most WebGPU allows — holds 107 million pixels, which is what
 * puts nine figures within reach of the slider at all.
 */
export const PARTICLE_STRIDE_BYTES = 20;
export const PARTICLE_POS_X = 0;
export const PARTICLE_POS_Y = 1;
export const PARTICLE_VEL_X = 2;
export const PARTICLE_VEL_Y = 3;
export const PARTICLE_LAST_CELL = 4;

/**
 * Per-pixel state lives in its own `array<u32>` rather than in the struct.
 * Every pass begins by asking whether a slot is alive, and with a pool that is
 * mostly idle — which is the whole point of a hundred-million ceiling — that
 * question should cost four bytes, not twenty.
 *
 * Bits 0-23 are colour and 25-28 are the bond, in the same places as a field
 * word, so `state & MATERIAL_MASK` is what a pixel carries and what it deposits.
 * Bit 24 is `ALIVE` here where a field word has `OCCUPIED`.
 */
export const STATE_BYTES = 4;
export const STATE_ALIVE_BIT = 0x01000000;
export const STATE_REST_SHIFT = 29;
export const STATE_REST_MASK = 0xe0000000;
/** Three bits of rest, so a pixel may sit still at most this many frames. */
export const MAX_REST = 7;

/** `Params` runs to word 32 and rounds up to the struct's 16-byte alignment. */
export const PARAMS_BYTES = 144;

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
export const F_SLUMP_CHANCE = 10;
export const F_SLIDE_SPEED = 11;
export const F_DISLODGE_SPEED = 12;
// Words 13-15 are the padding WGSL inserts to put `blast: vec4f` on a 16-byte
// boundary. Nothing writes them.
export const F_BLAST_X = 16;
export const F_BLAST_Y = 17;
export const F_BLAST_RADIUS = 18;
export const F_BLAST_STRENGTH = 19;
export const F_VIEWPORT_X = 20;
export const F_VIEWPORT_Y = 21;
export const F_CAMERA_X = 22;
export const F_CAMERA_Y = 23;
export const F_CAMERA_SCALE = 24;
export const U_RUBBLE_BOND = 25;
// `brush_drag: vec2f` needs 8-byte alignment, which word 26 already satisfies.
export const F_DRAG_X = 26;
export const F_DRAG_Y = 27;
export const U_AGENT_COUNT = 28;
export const F_AGENT_SPEED = 29;
export const F_AGENT_BOMB_CHANCE = 30;
export const F_AGENT_BLAST = 31;
export const F_FRAME_SECONDS = 32;

/**
 * @typedef {{
 *   world: { width: number, height: number },
 *   capacity: number, ringMask: number,
 *   gravity: number, dt: number, damping: number, restitution: number,
 *   restThreshold: number, frame: number,
 *   slumpChance: number, slideSpeed: number, dislodgeSpeed: number,
 *   blast: { x: number, y: number, radius: number, strength: number },
 *   viewport: { width: number, height: number },
 *   camera: { x: number, y: number, scale: number },
 *   rubbleBond: number,
 *   drag: { x: number, y: number },
 *   agents: { count: number, speed: number, bombChance: number, blastRadius: number },
 *   frameSeconds: number
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
  f[F_SLUMP_CHANCE] = params.slumpChance;
  f[F_SLIDE_SPEED] = params.slideSpeed;
  f[F_DISLODGE_SPEED] = params.dislodgeSpeed;
  f[F_BLAST_X] = params.blast.x;
  f[F_BLAST_Y] = params.blast.y;
  f[F_BLAST_RADIUS] = params.blast.radius;
  f[F_BLAST_STRENGTH] = params.blast.strength;
  f[F_VIEWPORT_X] = params.viewport.width;
  f[F_VIEWPORT_Y] = params.viewport.height;
  f[F_CAMERA_X] = params.camera.x;
  f[F_CAMERA_Y] = params.camera.y;
  f[F_CAMERA_SCALE] = params.camera.scale;
  u[U_RUBBLE_BOND] = params.rubbleBond;
  f[F_DRAG_X] = params.drag.x;
  f[F_DRAG_Y] = params.drag.y;
  u[U_AGENT_COUNT] = params.agents.count;
  f[F_AGENT_SPEED] = params.agents.speed;
  f[F_AGENT_BOMB_CHANCE] = params.agents.bombChance;
  f[F_AGENT_BLAST] = params.agents.blastRadius;
  f[F_FRAME_SECONDS] = params.frameSeconds;
  return target;
}

/**
 * Largest pool the device can hold, set by the biggest storage buffer it will
 * bind. The particle array is the constraint; the state array and the free ring
 * are a fifth of its size each.
 *
 * @param {{ maxStorageBufferBindingSize: number, maxBufferSize: number }} limits
 * @returns {number}
 */
export function maxCapacityFor(limits) {
  const largest = Math.min(limits.maxStorageBufferBindingSize, limits.maxBufferSize);
  return Math.max(1, Math.floor(largest / PARTICLE_STRIDE_BYTES));
}

/** Workgroup size shared by every compute entry point. */
export const WORKGROUP_SIZE = 256;

/**
 * Compute entry points, in dispatch order. `integrate` runs once per physics
 * substep; every other pass runs once per rendered frame.
 */
export const COMPUTE_PASSES = [
  "prepare", "integrate", "advance", "settle", "step_agents", "emit", "splat", "draw_agents",
];
/** Bytes per lemming: position, velocity and a packed state word. */
export const AGENT_STRIDE_BYTES = 20;
/** Most lemmings the buffer holds. A rounding error next to the field. */
export const AGENT_CAPACITY = 4096;

/**
 * @param {number} items
 * @returns {number} workgroup count needed to cover `items` invocations
 */
export function workgroupCount(items) {
  return Math.max(1, Math.ceil(items / WORKGROUP_SIZE));
}

/** WebGPU's default cap on workgroups per dispatch dimension. */
export const MAX_WORKGROUPS_PER_DIMENSION = 65535;

/**
 * Splits a dispatch across two dimensions.
 *
 * A world of twenty million cells needs more than eighty thousand workgroups,
 * which overflows the per-dimension cap: the dispatch is rejected, the whole
 * command buffer with it, and the frame silently renders nothing. Folding the
 * excess into y keeps every dimension legal. The shaders undo the fold with
 * `num_workgroups`.
 *
 * @param {number} items
 * @param {number} [maxPerDimension] from `device.limits.maxComputeWorkgroupsPerDimension`
 * @returns {{ x: number, y: number }}
 */
export function dispatchGrid(items, maxPerDimension = MAX_WORKGROUPS_PER_DIMENSION) {
  const groups = workgroupCount(items);
  if (groups <= maxPerDimension) return { x: groups, y: 1 };
  // Split as evenly as the cap allows, so few invocations are launched only to
  // fall straight out of the bounds check.
  const y = Math.ceil(groups / maxPerDimension);
  return { x: Math.ceil(groups / y), y };
}
