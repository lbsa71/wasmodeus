// src/core/counters.js
var COUNTER_WORDS = [
  "head",
  "tail",
  "popBudget",
  "emitted",
  "deposited",
  "dislodged",
  "undermined",
  "denied",
  "crowded",
  "stuck",
  "walking",
  "dug",
  "flowing",
  "drowned",
  "sank"
];
var COUNTERS_BYTES = 64;
function counterIndex(name) {
  const index = COUNTER_WORDS.indexOf(name);
  if (index < 0) throw new Error(`Unknown counter: ${name}`);
  return index;
}
function decodeCounters(words, capacity) {
  const decoded = {};
  COUNTER_WORDS.forEach((name, index) => {
    decoded[name] = name === "popBudget" ? words[index] | 0 : words[index] >>> 0;
  });
  const free = Math.min(capacity, decoded.tail - decoded.head >>> 0);
  const moving = Math.max(0, capacity - free);
  return (
    /** @type {CounterSnapshot} */
    {
      ...decoded,
      moving,
      free,
      capacity,
      utilisation: capacity > 0 ? moving / capacity : 0
    }
  );
}

// src/core/layout.js
var PARTICLE_STRIDE_BYTES = 20;
var STATE_BYTES = 4;
var MAX_REST = 7;
var PARAMS_BYTES = 144;
var U_WORLD_X = 0;
var U_WORLD_Y = 1;
var U_CAPACITY = 2;
var U_RING_MASK = 3;
var F_GRAVITY = 4;
var F_DT = 5;
var F_DAMPING = 6;
var F_RESTITUTION = 7;
var U_REST_THRESHOLD = 8;
var U_FRAME = 9;
var F_SLUMP_CHANCE = 10;
var F_SLIDE_SPEED = 11;
var F_DISLODGE_SPEED = 12;
var F_BLAST_X = 16;
var F_BLAST_Y = 17;
var F_BLAST_RADIUS = 18;
var F_BLAST_STRENGTH = 19;
var F_VIEWPORT_X = 20;
var F_VIEWPORT_Y = 21;
var F_CAMERA_X = 22;
var F_CAMERA_Y = 23;
var F_CAMERA_SCALE = 24;
var U_RUBBLE_BOND = 25;
var F_DRAG_X = 26;
var F_DRAG_Y = 27;
var U_AGENT_COUNT = 28;
var F_AGENT_SPEED = 29;
var F_AGENT_BOMB_CHANCE = 30;
var F_AGENT_BLAST = 31;
var F_FRAME_SECONDS = 32;
var F_WATER_SPREAD = 33;
function writeParams(target, params) {
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
  f[F_WATER_SPREAD] = params.waterSpread;
  return target;
}
function maxCapacityFor(limits) {
  const largest = Math.min(limits.maxStorageBufferBindingSize, limits.maxBufferSize);
  return Math.max(1, Math.floor(largest / PARTICLE_STRIDE_BYTES));
}
var WORKGROUP_SIZE = 256;
var COMPUTE_PASSES = [
  "prepare",
  "integrate",
  "advance",
  "settle",
  "step_agents",
  "emit",
  "splat",
  "draw_agents"
];
var AGENT_STRIDE_BYTES = 20;
var AGENT_CAPACITY = 4096;
function workgroupCount(items) {
  return Math.max(1, Math.ceil(items / WORKGROUP_SIZE));
}
var MAX_WORKGROUPS_PER_DIMENSION = 65535;
function dispatchGrid(items, maxPerDimension = MAX_WORKGROUPS_PER_DIMENSION) {
  const groups = workgroupCount(items);
  if (groups <= maxPerDimension) return { x: groups, y: 1 };
  const y = Math.ceil(groups / maxPerDimension);
  return { x: Math.ceil(groups / y), y };
}

// src/core/capacity.js
var DEFAULT_CAPACITY = 1e7;
function nextPowerOfTwo(value) {
  if (value <= 1) return 1;
  return 2 ** Math.ceil(Math.log2(value));
}
function ringSize(capacity) {
  return nextPowerOfTwo(Math.max(1, capacity));
}
function ringMask(capacity) {
  return ringSize(capacity) - 1;
}

// src/core/rest.js
var MIN_REST_THRESHOLD = 1;
var MAX_REST_THRESHOLD = MAX_REST;
var DEFAULT_REST_THRESHOLD = 1;
function clampRestThreshold(threshold) {
  return Math.min(MAX_REST_THRESHOLD, Math.max(MIN_REST_THRESHOLD, Math.round(threshold)));
}

// src/core/collision.js
var MIN_RESTITUTION = 0;
var MAX_RESTITUTION = 1;
function clampRestitution(restitution) {
  return Math.min(MAX_RESTITUTION, Math.max(MIN_RESTITUTION, restitution));
}

// src/core/agents.js
var MODE_WALK = 0;
var AGENT_TIMER_MASK = 255;
var AGENT_FACING_BIT = 256;
var AGENT_MODE_SHIFT = 9;
var AGENT_MODE_MASK = 1536;
var AGENT_ALIVE_BIT = 2048;
var MAX_AGENT_TIMER = 255;
function packAgent({ alive, mode, facing, timer }) {
  return ((alive ? AGENT_ALIVE_BIT : 0) | mode << AGENT_MODE_SHIFT & AGENT_MODE_MASK | (facing > 0 ? AGENT_FACING_BIT : 0) | Math.min(MAX_AGENT_TIMER, Math.max(0, Math.round(timer))) & AGENT_TIMER_MASK) >>> 0;
}
function timerFor(seed, shortest, longest) {
  const span = Math.max(0, longest - shortest);
  return Math.min(MAX_AGENT_TIMER, shortest + (span > 0 ? seed % (span + 1) : 0));
}

// src/core/prng.js
function hashU32(value) {
  let x = value >>> 0;
  x = (x ^ x >>> 16) >>> 0;
  x = Math.imul(x, 2146121005) >>> 0;
  x = (x ^ x >>> 15) >>> 0;
  x = Math.imul(x, 2221713035) >>> 0;
  x = (x ^ x >>> 16) >>> 0;
  return x;
}

// src/core/field-format.js
var EMPTY = 0;
var OCCUPIED_BIT = 16777216;
var BOND_SHIFT = 25;
var BOND_MASK = 503316480;
var MAX_BOND = 15;
var WATER_BOND = MAX_BOND;
var IMMOVABLE = 0;
function packCell(r, g, b, bond = IMMOVABLE) {
  return (OCCUPIED_BIT | Math.min(MAX_BOND, Math.max(0, bond)) << BOND_SHIFT >>> 0 | (b & 255) << 16 | (g & 255) << 8 | r & 255) >>> 0;
}
function cellBond(word) {
  return (word >>> 0 & BOND_MASK) >>> BOND_SHIFT;
}
function isOccupied(word) {
  return word >>> 0 !== EMPTY;
}

// src/core/palette.js
var RUBBLE_BOND = 3;

// src/core/world-gen.js
var DEFAULT_WORLD_WIDTH = 6144;
var DEFAULT_WORLD_HEIGHT = 3456;

// src/core/settings.js
function defaultSettings() {
  return {
    world: { width: DEFAULT_WORLD_WIDTH, height: DEFAULT_WORLD_HEIGHT },
    seed: 1,
    capacity: DEFAULT_CAPACITY,
    restThreshold: DEFAULT_REST_THRESHOLD,
    // Four substeps keep a fast pixel under about two cells per step, which is
    // what stops an explosion firing debris straight through a cave wall.
    substeps: 4,
    frameSeconds: 1 / 60,
    gravity: 500,
    damping: 0.999,
    // Elasticity of every impact, and the only thing that removes energy from
    // a collision. A striker that knocks a pixel loose keeps `(1-e)/2` of its
    // velocity and hands over `(1+e)/2`; one that hits immovable material
    // simply reflects at `-e`. See `src/core/collision.js`.
    restitution: 0.18,
    // Speed an impact needs to shake a *marginally held* cell loose. A cell
    // with support to spare needs this much again for every surplus neighbour,
    // so a surface splashes while buried material ignores the same blow.
    dislodgeSpeed: 110,
    // Once a cell's bond has let go, how eagerly it slumps sideways rather than
    // waiting. Cohesion decides whether material moves at all; this decides how
    // fluid it looks when it does. See `src/core/sand.js`.
    slumpChance: 0.6,
    // Debris settles with this bond, so a blasted bank behaves like gravel from
    // then on rather than re-freezing into the cliff it came from.
    rubbleBond: RUBBLE_BOND,
    // Sideways speed given to a pixel rolling off a heap. Fast enough to change
    // cell inside `restThreshold` frames, or it would settle before it moved.
    slideSpeed: 60,
    brushRadius: 90,
    // A blast fires material radially, which in a confined pocket mostly means
    // into the nearest wall. A smudge carries it along the drag instead, so it
    // is far gentler and needs a fraction of the speed.
    blastStrength: 700,
    smudgeStrength: 240,
    // Lemmings: how many walk the world, how fast, how readily one sits down
    // and lights a bomb, and how big a hole that leaves.
    agents: { count: 600, speed: 26, bombChance: 0.12, blastRadius: 20 },
    // How briskly water creeps sideways. Water is released every frame it has
    // anywhere to go, so this only has to be enough to carry a drop into the
    // next cell; a real shove would make it arc away like grit.
    waterSpread: 46
  };
}

// src/core/camera.js
var MAX_SCALE = 8;
function clamp(value, low, high) {
  return Math.min(high, Math.max(low, value));
}
function minScale(world, viewport) {
  if (world.width <= 0 || world.height <= 0) return MAX_SCALE;
  return Math.min(viewport.width / world.width, viewport.height / world.height);
}
function clampCamera(camera, world, viewport) {
  const scale = clamp(camera.scale, minScale(world, viewport), MAX_SCALE);
  const visibleWidth = viewport.width / scale;
  const visibleHeight = viewport.height / scale;
  const x = visibleWidth >= world.width ? (world.width - visibleWidth) / 2 : clamp(camera.x, 0, world.width - visibleWidth);
  const y = visibleHeight >= world.height ? (world.height - visibleHeight) / 2 : clamp(camera.y, 0, world.height - visibleHeight);
  return { x, y, scale };
}
function createCamera(world, viewport, start = {}) {
  const scale = start.scale ?? 1;
  return clampCamera({
    x: (start.x ?? world.width / 2) - viewport.width / (2 * scale),
    y: (start.y ?? world.height / 2) - viewport.height / (2 * scale),
    scale
  }, world, viewport);
}
function panCamera(camera, dx, dy, world, viewport) {
  return clampCamera({
    x: camera.x - dx / camera.scale,
    y: camera.y + dy / camera.scale,
    scale: camera.scale
  }, world, viewport);
}
function zoomCameraAt(camera, factor, screenX, screenY, world, viewport) {
  const anchor = worldFromScreen(camera, viewport, screenX, screenY);
  const scale = clamp(camera.scale * factor, minScale(world, viewport), MAX_SCALE);
  return clampCamera({
    x: anchor.x - screenX / scale,
    y: anchor.y - (viewport.height - screenY) / scale,
    scale
  }, world, viewport);
}
function worldFromScreen(camera, viewport, screenX, screenY) {
  return {
    x: camera.x + screenX / camera.scale,
    y: camera.y + (viewport.height - screenY) / camera.scale
  };
}

// src/gpu/device.js
async function acquireDevice(canvas2) {
  if (!navigator.gpu) throw new Error("WebGPU is required; this browser does not expose navigator.gpu.");
  const adapter = await navigator.gpu.requestAdapter({ powerPreference: "high-performance" });
  if (!adapter) throw new Error("No compatible WebGPU adapter was found.");
  const device = await adapter.requestDevice({
    requiredLimits: {
      maxBufferSize: adapter.limits.maxBufferSize,
      maxStorageBufferBindingSize: adapter.limits.maxStorageBufferBindingSize,
      maxComputeInvocationsPerWorkgroup: adapter.limits.maxComputeInvocationsPerWorkgroup
    }
  });
  const context = (
    /** @type {GPUCanvasContext|null} */
    canvas2.getContext("webgpu")
  );
  if (!context) throw new Error("Unable to create a WebGPU canvas context.");
  const format = navigator.gpu.getPreferredCanvasFormat();
  context.configure({ device, format, alphaMode: "opaque" });
  return { device, context, format };
}

// src/gpu/shaders/simulation.wgsl
var simulation_default = '// Ground Truth \u2014 pixels move in and out of a static world.\r\n//\r\n// Frame order: prepare -> integrate xN -> advance -> settle -> emit -> splat.\r\n// The free-slot ring is why the order matters: `settle` only ever pushes and\r\n// `emit` only ever pops, so a slot can never be handed to two threads at once.\r\n\r\nconst OCCUPIED_BIT: u32  = 0x01000000u;\r\nconst DISLODGE_BIT: u32  = 0x80000000u;\r\nconst COLOR_MASK: u32    = 0x00ffffffu;\r\nconst MATERIAL_MASK: u32 = 0x1effffffu;\r\nconst BOND_SHIFT: u32    = 25u;\r\nconst BOND_MASK: u32     = 0x1e000000u;\r\nconst SKY_CELL: u32      = 0xffffffffu;\r\n\r\n// A live pixel\'s state word is a field word with ALIVE where OCCUPIED sits, so\r\n// colour and bond stay in the same bits and depositing needs no repacking.\r\nconst STATE_ALIVE_BIT: u32  = 0x01000000u;\r\nconst STATE_REST_SHIFT: u32 = 29u;\r\nconst STATE_REST_MASK: u32  = 0xe0000000u;\r\nconst MAX_REST: u32         = 7u;\r\n\r\nconst REASON_NONE: u32      = 0u;\r\nconst REASON_DISLODGE: u32  = 1u;\r\nconst REASON_UNDERMINE: u32 = 2u;\r\nconst REASON_SLUMP: u32     = 3u;\r\nconst REASON_BLAST: u32     = 4u;\r\nconst REASON_WATER: u32     = 5u;\r\n\r\n// Water. A bond of fifteen is one that eight neighbours can never meet, so\r\n// every "is this held?" in the simulation already answers no for water without\r\n// knowing anything about water. Only which way it goes needs a rule of its own.\r\nconst WATER_BOND: u32 = 15u;\r\n\r\n// How the three cells beneath a pixel hold it up. See `src/core/sand.js`.\r\nconst SUPPORT_FIRM: i32  = 0;\r\nconst SUPPORT_FALL: i32  = 1;\r\nconst SUPPORT_SLUMP: i32 = 2;\r\n\r\nconst EDGE_EPSILON: f32 = 0.001;\r\nconst SKY_HEADROOM: f32 = 2.0;\r\n// How far out a pixel whose cell was taken may look for somewhere to land.\r\n// Generous on purpose: a pixel the collapse built over is normally a few cells\r\n// from the crater it came out of, and searching radially keeps its matter where\r\n// it belongs. The search stops at the first free cell, so the usual cost is a\r\n// ring or two \u2014 only the genuinely entombed pay for the rest.\r\nconst RESCUE_RINGS: i32 = 3;\r\n// Furthest a buried pixel will ever look for somewhere to land.\r\nconst MAX_PROBE_RING: i32 = 32;\r\n// Most cells a pixel may cross in one substep. Bounds the sweep, and caps how\r\n// far anything can travel before it must stop and look where it is going.\r\nconst MAX_SWEEP_STEPS: u32 = 8u;\r\n// How much harder a cell is to shift for each neighbour it has beyond its\r\n// bond. At 1.0 even a pile surface needs a two-hundred-cell fall to splash;\r\n// this leaves ordinary settling harmless while a real drop still bites.\r\nconst IMPACT_RESISTANCE: f32 = 0.6;\r\n// Support a cell may have beyond its bond and still be draggable by the smudge.\r\n// Sand buried in a heap sits at about three; stone in a wall is far higher, so\r\n// the brush scrapes its surface instead of boring through it.\r\nconst SMUDGE_REACH: i32 = 3;\r\n// Fraction of blast speed still given to debris at the very rim.\r\nconst BLAST_RIM: f32 = 0.25;\r\n// Lemmings. See `src/core/agents.js` for the rules these mirror.\r\nconst MODE_WALK: u32 = 0u;\r\nconst MODE_DIG: u32  = 1u;\r\nconst MODE_FUSE: u32 = 2u;\r\nconst AGENT_TIMER_MASK: u32 = 0x000000ffu;\r\nconst AGENT_FACING_BIT: u32 = 0x00000100u;\r\nconst AGENT_MODE_SHIFT: u32 = 9u;\r\nconst AGENT_MODE_MASK: u32  = 0x00000600u;\r\nconst AGENT_ALIVE_BIT: u32  = 0x00000800u;\r\n// Half-width and height of the block a lemming is drawn as, and comes apart to.\r\nconst AGENT_HALF_W: i32 = 1;\r\nconst AGENT_HEIGHT: i32 = 4;\r\n// Speed a pixel must be doing to knock one apart.\r\nconst AGENT_SHATTER_SPEED: f32 = 240.0;\r\n// Frames before a lost lemming is replaced. Without this the population only\r\n// ever falls \u2014 bombs kill the bomber and the debris takes the neighbours \u2014 and\r\n// the world goes quiet after half a minute.\r\nconst AGENT_RESPAWN: u32 = 150u;\r\n\r\n// Two markers the overlay carries above its colour. `splat` flags a cell a\r\n// pixel is tearing through, so a lemming can tell a hurtling rock from settling\r\n// sand; `draw_agents` flags its own sprite, so a lemming does not read its own\r\n// body as something hitting it. Both sit above the colour bits, so atomicMax\r\n// keeps a fast pixel visible over an agent and an agent over ordinary material,\r\n// and the composite masks them off.\r\nconst OVERLAY_FAST: u32  = 0x40000000u;\r\nconst OVERLAY_AGENT: u32 = 0x20000000u;\r\n\r\n// Must match WORKGROUP_SIZE in src/core/layout.js.\r\nconst WORKGROUP_SIZE: u32 = 256u;\r\n\r\nstruct Params {\r\n  world: vec2u,\r\n  capacity: u32,\r\n  ring_mask: u32,\r\n  gravity: f32,\r\n  dt: f32,\r\n  damping: f32,\r\n  restitution: f32,\r\n  rest_threshold: u32,\r\n  frame: u32,\r\n  slump_chance: f32,\r\n  slide_speed: f32,\r\n  dislodge_speed: f32,\r\n  blast: vec4f,\r\n  viewport: vec2f,\r\n  camera_origin: vec2f,\r\n  camera_scale: f32,\r\n  rubble_bond: u32,\r\n  // Which way the pointer is being dragged, or zero for a radial blast. The\r\n  // brush position, radius and strength live in `blast`.\r\n  brush_drag: vec2f,\r\n  agent_count: u32,\r\n  agent_speed: f32,\r\n  agent_bomb_chance: f32,\r\n  agent_blast: f32,\r\n  // Agents step once a frame, not once a substep, so they need the whole tick.\r\n  frame_seconds: f32,\r\n  water_spread: f32,\r\n};\r\n\r\n// Scalars, not vec2f: a vec2f would align this to eight bytes and pad it to 24.\r\n// See PARTICLE_STRIDE_BYTES in src/core/layout.js.\r\nstruct Particle {\r\n  pos_x: f32,\r\n  pos_y: f32,\r\n  vel_x: f32,\r\n  vel_y: f32,\r\n  last_cell: u32,\r\n};\r\n\r\nstruct Agent {\r\n  pos_x: f32,\r\n  pos_y: f32,\r\n  vel_x: f32,\r\n  vel_y: f32,\r\n  state: u32,\r\n};\r\n\r\nstruct Counters {\r\n  head: atomic<u32>,\r\n  tail: atomic<u32>,\r\n  pop_budget: atomic<i32>,\r\n  emitted: atomic<u32>,\r\n  deposited: atomic<u32>,\r\n  dislodged: atomic<u32>,\r\n  undermined: atomic<u32>,\r\n  denied: atomic<u32>,\r\n  crowded: atomic<u32>,\r\n  stuck: atomic<u32>,\r\n  walking: atomic<u32>,\r\n  dug: atomic<u32>,\r\n  flowing: atomic<u32>,\r\n  drowned: atomic<u32>,\r\n  sank: atomic<u32>,\r\n};\r\n\r\n@group(0) @binding(0) var<uniform> params: Params;\r\n@group(0) @binding(1) var<storage, read_write> particles: array<Particle>;\r\n@group(0) @binding(2) var<storage, read_write> field: array<atomic<u32>>;\r\n@group(0) @binding(3) var<storage, read_write> overlay: array<atomic<u32>>;\r\n@group(0) @binding(4) var<storage, read_write> free_ring: array<u32>;\r\n@group(0) @binding(5) var<storage, read_write> counters: Counters;\r\n@group(0) @binding(6) var<storage, read_write> states: array<u32>;\r\n// Momentum handed to a cell by whatever struck it, waiting for `emit` to launch\r\n// it with. Two f16 packed into a word; non-zero only while DISLODGE_BIT is set.\r\n@group(0) @binding(7) var<storage, read_write> impulse: array<atomic<u32>>;\r\n@group(0) @binding(8) var<storage, read_write> agents: array<Agent>;\r\n\r\n// A dispatch wider than 65535 workgroups is illegal, so large grids are folded\r\n// into two dimensions and unfolded here. See `dispatchGrid` in core/layout.js.\r\nfn linear_index(gid: vec3u, groups: vec3u) -> u32 {\r\n  return gid.x + gid.y * groups.x * WORKGROUP_SIZE;\r\n}\r\n\r\nfn hash_u32(value: u32) -> u32 {\r\n  var x = value;\r\n  x ^= x >> 16u;\r\n  x *= 0x7feb352du;\r\n  x ^= x >> 15u;\r\n  x *= 0x846ca68bu;\r\n  x ^= x >> 16u;\r\n  return x;\r\n}\r\n\r\nfn rand01(seed: u32) -> f32 {\r\n  return f32(hash_u32(seed) & 0x00ffffffu) / 16777216.0;\r\n}\r\n\r\nfn cell_index(x: i32, y: i32) -> u32 {\r\n  return u32(y) * params.world.x + u32(x);\r\n}\r\n\r\nfn in_bounds(x: i32, y: i32) -> bool {\r\n  return x >= 0 && y >= 0 && x < i32(params.world.x) && y < i32(params.world.y);\r\n}\r\n\r\nfn rest_of(state: u32) -> u32 {\r\n  return (state & STATE_REST_MASK) >> STATE_REST_SHIFT;\r\n}\r\n\r\nfn with_rest(state: u32, rest: u32) -> u32 {\r\n  return (state & ~STATE_REST_MASK) | (min(rest, MAX_REST) << STATE_REST_SHIFT);\r\n}\r\n\r\nfn bond_of(word: u32) -> u32 {\r\n  return (word & BOND_MASK) >> BOND_SHIFT;\r\n}\r\n\r\n// Side walls and the floor are solid; the sky is open so debris can fly.\r\nfn blocked_at(x: i32, y: i32) -> bool {\r\n  if (x < 0 || x >= i32(params.world.x)) { return true; }\r\n  if (y < 0) { return true; }\r\n  if (y >= i32(params.world.y)) { return false; }\r\n  return atomicLoad(&field[cell_index(x, y)]) != 0u;\r\n}\r\n\r\n// The sand rule\'s view of a neighbour: nowhere outside the world counts as\r\n// somewhere a pixel could fall into.\r\nfn open_at(x: i32, y: i32) -> bool {\r\n  if (x < 0 || x >= i32(params.world.x) || y < 0) { return false; }\r\n  if (y >= i32(params.world.y)) { return true; }\r\n  return atomicLoad(&field[cell_index(x, y)]) == 0u;\r\n}\r\n\r\nfn is_water(word: u32) -> bool {\r\n  return bond_of(word) == WATER_BOND;\r\n}\r\n\r\n// Whether a neighbour holds this cell up. Outside the world counts: the floor\r\n// and the walls hold material in rather than letting the edges drain away.\r\n//\r\n// Water holds nothing up. It is occupied and it blocks movement, but it bears\r\n// no load, and that single exception is the whole of sinking: a grain resting\r\n// on a pool has three water cells beneath it, and counting those as support is\r\n// what made sand float on water like a raft. Discount them and the cohesion\r\n// test the grain already runs answers "not held" all by itself. Only what it\r\n// does next needed a rule \u2014 see `displaces_water`.\r\nfn solid_at(x: i32, y: i32) -> u32 {\r\n  if (x < 0 || x >= i32(params.world.x)) { return 1u; }\r\n  if (y < 0) { return 1u; }\r\n  if (y >= i32(params.world.y)) { return 0u; }\r\n  let word = atomicLoad(&field[cell_index(x, y)]);\r\n  if (word == 0u || is_water(word)) { return 0u; }\r\n  return 1u;\r\n}\r\n\r\n// Whether a cell\'s neighbours are enough to hold it. Outside the world counts\r\n// as solid, so the floor and walls hold material in instead of letting the\r\n// edges of the world quietly drain away.\r\n//\r\n// The four orthogonal neighbours come first and the diagonals are only paid for\r\n// when they might change the answer: most of a solid world is interior rock\r\n// whose bond the orthogonals already satisfy, and that is four loads per cell\r\n// per frame saved across twenty million of them.\r\nfn support_count(x: i32, y: i32) -> u32 {\r\n  return solid_at(x - 1, y) + solid_at(x + 1, y) + solid_at(x, y - 1) + solid_at(x, y + 1)\r\n    + solid_at(x - 1, y - 1) + solid_at(x + 1, y - 1)\r\n    + solid_at(x - 1, y + 1) + solid_at(x + 1, y + 1);\r\n}\r\n\r\nfn is_held(x: i32, y: i32, bond: u32) -> bool {\r\n  if (bond == 0u) { return true; }\r\n  let orthogonal = solid_at(x - 1, y) + solid_at(x + 1, y) + solid_at(x, y - 1) + solid_at(x, y + 1);\r\n  if (orthogonal >= bond) { return true; }\r\n  let diagonal = solid_at(x - 1, y - 1) + solid_at(x + 1, y - 1)\r\n    + solid_at(x - 1, y + 1) + solid_at(x + 1, y + 1);\r\n  return orthogonal + diagonal >= bond;\r\n}\r\n\r\n// Whether the smudge brush can take this cell. Bedrock never. Otherwise only\r\n// what the brush can actually reach: a cell with little support to spare, which\r\n// means a surface, or something bonded loosely enough to drag out of a heap.\r\n//\r\n// Sand comes away readily \u2014 buried grains have barely more support than their\r\n// bond asks for \u2014 while stone only gives up its surface, and erodes as the drag\r\n// exposes more of it. That difference is the whole feel of the tool.\r\nfn smudgeable(x: i32, y: i32, bond: u32) -> bool {\r\n  if (bond == 0u) { return false; }\r\n  return i32(support_count(x, y)) - i32(bond) <= SMUDGE_REACH;\r\n}\r\n\r\n// Where water goes next: straight down, then down-diagonally, then flat\r\n// sideways. The last is the whole difference between water and sand \u2014 sand\r\n// needs an opening *below* something before it will move, which is why it\r\n// heaps, while water walks along a level floor until the pool is level. With\r\n// nowhere to go it returns zero and stays exactly where it is, which is what\r\n// makes a still pool still instead of a permanent churn.\r\nfn water_flow(x: i32, y: i32, seed: u32) -> vec2i {\r\n  if (open_at(x, y - 1)) { return vec2i(0, -1); }\r\n  let down_left = open_at(x - 1, y - 1);\r\n  let down_right = open_at(x + 1, y - 1);\r\n  if (down_left || down_right) { return vec2i(choose_direction(down_left, down_right, seed), -1); }\r\n  let left = open_at(x - 1, y);\r\n  let right = open_at(x + 1, y);\r\n  if (left || right) { return vec2i(choose_direction(left, right, seed ^ 0x1b7u), 0); }\r\n  return vec2i(0, 0);\r\n}\r\n\r\n// Ties are broken by the seed, or every heap in the world would lean the same\r\n// way.\r\nfn choose_direction(left: bool, right: bool, seed: u32) -> i32 {\r\n  if (left && right) {\r\n    if (rand01(seed) < 0.5) { return -1; }\r\n    return 1;\r\n  }\r\n  if (left) { return -1; }\r\n  if (right) { return 1; }\r\n  return 0;\r\n}\r\n\r\n// Which way a released pixel goes. Held up by three cells, not one: nothing\r\n// below and it drops; solid below but an open diagonal and it slumps into the\r\n// gap, which is the difference between a heap and a stack of columns.\r\nfn support_at(x: i32, y: i32, seed: u32) -> vec2i {\r\n  if (open_at(x, y - 1)) { return vec2i(SUPPORT_FALL, 0); }\r\n  let left = open_at(x - 1, y - 1);\r\n  let right = open_at(x + 1, y - 1);\r\n  if (!left && !right) { return vec2i(SUPPORT_FIRM, 0); }\r\n  return vec2i(SUPPORT_SLUMP, choose_direction(left, right, seed));\r\n}\r\n\r\n// Whether this cell can trade places with water directly beneath it, which is\r\n// what sinking is: the grain takes the cell below and the water takes the one\r\n// it left, a cell a frame, both conserved.\r\n//\r\n// There is no new question of *whether*. Cohesion decides that, and because\r\n// `solid_at` discounts water the answer for anything resting on a pool is that\r\n// nothing was holding it \u2014 so a loose grain goes under while a rock ledge with\r\n// neighbours of its own stays put. Bedrock is asked for no neighbours at all,\r\n// so it is held by definition and stands in the water rather than sinking.\r\nfn displaces_water(x: i32, y: i32, word: u32) -> bool {\r\n  if (is_water(word)) { return false; }\r\n  if (y <= 0) { return false; }\r\n  if (!is_water(atomicLoad(&field[cell_index(x, y - 1)]))) { return false; }\r\n  return !is_held(x, y, bond_of(word));\r\n}\r\n\r\n// Claims one cell for a settling pixel, if it happens to be empty.\r\nfn deposit_into(x: i32, y: i32, value: u32) -> bool {\r\n  if (!in_bounds(x, y)) { return false; }\r\n  return atomicCompareExchangeWeak(&field[cell_index(x, y)], 0u, value).exchanged;\r\n}\r\n\r\n// Finds somewhere for a pixel whose own cell was taken. Rings outward from the\r\n// cell it is standing in, nearest first and downhill before uphill, so the\r\n// result is a one- or two-cell jostle rather than a jump. `bias` mirrors the\r\n// horizontal search so a jammed crowd does not all shuffle the same way.\r\nfn scan_ring(x: i32, y: i32, bias: i32, value: u32, ring: i32) -> bool {\r\n  for (var dy = -ring; dy <= ring; dy += 1) {\r\n    for (var dx = -ring; dx <= ring; dx += 1) {\r\n      if (max(abs(dx), abs(dy)) != ring) { continue; }\r\n      if (deposit_into(x + dx * bias, y + dy, value)) { return true; }\r\n    }\r\n  }\r\n  return false;\r\n}\r\n\r\n// Looks for somewhere to put a pixel whose own cell was taken.\r\n//\r\n// The near rings are searched every frame, which catches the ordinary case of\r\n// losing a race in a crowd. Beyond them the whole disc is far too much work to\r\n// repeat every frame for every buried pixel, so one further ring is probed per\r\n// frame and the ring advances \u2014 a pixel with nothing close sweeps steadily\r\n// outward instead, and reaches the edge of a filled crater within a second.\r\n//\r\n// Searching radially matters as much as searching far. Marching a buried pixel\r\n// to the surface finds space too, but a pixel built over just inside a crater\r\n// wall has open space two cells sideways and a quarter of a screen of rock\r\n// above it: it would surface hundreds of cells from where its matter belonged,\r\n// and the ground would appear to grow from underneath.\r\nfn rescue_deposit(x: i32, y: i32, bias: i32, value: u32, probe: i32) -> bool {\r\n  for (var ring = 1; ring <= RESCUE_RINGS; ring += 1) {\r\n    if (scan_ring(x, y, bias, value, ring)) { return true; }\r\n  }\r\n  return scan_ring(x, y, bias, value, probe);\r\n}\r\n\r\n// Bouncing off something that will not move. See `src/core/collision.js`.\r\nfn reflect_axis(velocity: f32) -> f32 {\r\n  return -velocity * params.restitution;\r\n}\r\n\r\n// An equal-mass collision: what the striker keeps, and what the target takes.\r\n// The two always sum to the incoming velocity, so momentum is handed over\r\n// rather than destroyed. Below a restitution of one the pair carries less\r\n// energy than arrived, which is what stops a disturbed pile bouncing for ever.\r\nfn striker_share(velocity: f32) -> f32 {\r\n  return velocity * (1.0 - params.restitution) * 0.5;\r\n}\r\n\r\nfn target_share(velocity: f32) -> f32 {\r\n  return velocity * (1.0 + params.restitution) * 0.5;\r\n}\r\n\r\n// A moving pixel strikes a cell and hands it momentum. Returns whether the cell\r\n// took it: bedrock, walls, empty space and anything too well buried do not, and\r\n// the striker reflects off those instead of sharing with them.\r\n//\r\n// Resistance scales with how much support a cell has beyond what its bond asks\r\n// for. Without that term every pixel that lands hard enough knocks the floor out\r\n// from under itself, each release drives the next one down, and a single impact\r\n// liquefies the pile in a chain reaction that never settles. Surface material\r\n// splashes; buried material does not notice.\r\nfn strike(x: i32, y: i32, speed: f32, momentum: vec2f) -> bool {\r\n  if (!in_bounds(x, y)) { return false; }\r\n  let c = cell_index(x, y);\r\n  let value = atomicLoad(&field[c]);\r\n  if (value == 0u) { return false; }\r\n  let bond = bond_of(value);\r\n  if (bond == 0u) { return false; }\r\n  // Already committed to moving. Later strikers bounce off it, they do not pile\r\n  // more momentum onto the same grain.\r\n  if ((value & DISLODGE_BIT) != 0u) { return false; }\r\n  let surplus = f32(max(0, i32(support_count(x, y)) - i32(bond)));\r\n  if (speed < params.dislodge_speed * (1.0 + surplus * IMPACT_RESISTANCE)) { return false; }\r\n  // Atomic test-and-set, so exactly one striker per frame gets to move this\r\n  // cell. Accumulating instead \u2014 every striker adding its share \u2014 launches one\r\n  // grain at a speed no single pixel ever had, and past the range of an f16 it\r\n  // becomes an infinity that turns the cell index to garbage. That was the\r\n  // source of the explosions that appeared out of nowhere.\r\n  let previous = atomicOr(&field[c], DISLODGE_BIT);\r\n  if ((previous & DISLODGE_BIT) != 0u) { return false; }\r\n  atomicAdd(&counters.dislodged, 1u);\r\n  atomicStore(&impulse[c], pack2x16float(momentum));\r\n  return true;\r\n}\r\n\r\n@compute @workgroup_size(1)\r\nfn prepare() {\r\n  // Snapshot the ring occupancy once so `emit` can pop against a fixed budget\r\n  // instead of racing head past tail.\r\n  let available = atomicLoad(&counters.tail) - atomicLoad(&counters.head);\r\n  atomicStore(&counters.pop_budget, i32(available));\r\n  atomicStore(&counters.emitted, 0u);\r\n  atomicStore(&counters.deposited, 0u);\r\n  atomicStore(&counters.dislodged, 0u);\r\n  atomicStore(&counters.undermined, 0u);\r\n  atomicStore(&counters.denied, 0u);\r\n  atomicStore(&counters.crowded, 0u);\r\n  atomicStore(&counters.stuck, 0u);\r\n  atomicStore(&counters.walking, 0u);\r\n  atomicStore(&counters.dug, 0u);\r\n  atomicStore(&counters.flowing, 0u);\r\n  atomicStore(&counters.drowned, 0u);\r\n}\r\n\r\n@compute @workgroup_size(256)\r\nfn integrate(@builtin(global_invocation_id) gid: vec3u, @builtin(num_workgroups) groups: vec3u) {\r\n  let i = linear_index(gid, groups);\r\n  if (i >= params.capacity) { return; }\r\n  // Four bytes decide whether the other twenty are worth reading.\r\n  if ((states[i] & STATE_ALIVE_BIT) == 0u) { return; }\r\n  var p = particles[i];\r\n\r\n  var v = vec2f(p.vel_x, p.vel_y);\r\n  v.y -= params.gravity * params.dt;\r\n  v *= params.damping;\r\n\r\n  let falling = v.y <= 0.0;\r\n  var pos = vec2f(p.pos_x, p.pos_y);\r\n\r\n  // Walk the step a cell at a time rather than testing only where the pixel\r\n  // would land. Testing the destination alone lets a fast one jump clean over\r\n  // whatever lies between \u2014 six cells a substep at blast speed \u2014 so pixels pass\r\n  // straight through other pixels, end up under floors, and pile up from below.\r\n  // Nothing may ever be skipped over.\r\n  var travel = v * params.dt;\r\n  let span = max(abs(travel.x), abs(travel.y));\r\n  // Cap the distance so no single step can span more than one cell even at the\r\n  // step limit; a pixel faster than that simply covers less ground this substep.\r\n  if (span > f32(MAX_SWEEP_STEPS)) { travel *= f32(MAX_SWEEP_STEPS) / span; }\r\n  let steps = max(1u, u32(ceil(min(span, f32(MAX_SWEEP_STEPS)))));\r\n  let stride = travel / f32(steps);\r\n\r\n  var landed = false;\r\n  for (var step = 0u; step < steps; step += 1u) {\r\n    let speed = length(v);\r\n    // Cheap pre-gate; `strike` applies the real, support-scaled threshold.\r\n    let hard = speed >= params.dislodge_speed;\r\n    // The cell a pixel is already standing in never blocks it. A pixel can be\r\n    // built over \u2014 a neighbour deposits into the very cell it is waiting in \u2014\r\n    // and without this exemption the destination of a short step is that same,\r\n    // now-solid, cell and it would be welded in place by its own position.\r\n    let home_x = i32(floor(pos.x));\r\n    let home_y = i32(floor(pos.y));\r\n    var hit = false;\r\n\r\n    let next_x = pos.x + stride.x;\r\n    let step_x = i32(floor(next_x));\r\n    if (step_x != home_x && blocked_at(step_x, home_y)) {\r\n      var absorbed = false;\r\n      if (hard) { absorbed = strike(step_x, home_y, speed, vec2f(target_share(v.x), 0.0)); }\r\n      // Knocked something loose: equal masses, so the striker slows. Hit\r\n      // something immovable: it reflects.\r\n      if (absorbed) { v.x = striker_share(v.x); } else { v.x = reflect_axis(v.x); }\r\n      hit = true;\r\n    } else {\r\n      pos.x = next_x;\r\n    }\r\n\r\n    let next_y = pos.y + stride.y;\r\n    let step_y = i32(floor(next_y));\r\n    let column = i32(floor(pos.x));\r\n    if ((step_y != home_y || column != home_x) && blocked_at(column, step_y)) {\r\n      var absorbed = false;\r\n      if (hard) { absorbed = strike(column, step_y, speed, vec2f(0.0, target_share(v.y))); }\r\n      if (absorbed) { v.y = striker_share(v.y); } else { v.y = reflect_axis(v.y); }\r\n      landed = true;\r\n      hit = true;\r\n    } else {\r\n      pos.y = next_y;\r\n    }\r\n\r\n    // The velocity has changed, so the rest of this stride points the wrong\r\n    // way. Stop at the contact and let the next substep use the new one.\r\n    if (hit) { break; }\r\n  }\r\n\r\n  // A pixel that has come to rest on a slope rolls off it rather than stacking\r\n  // into a needle. Only a pixel not already moving sideways faster is\r\n  // redirected, so blast debris keeps its momentum.\r\n  if (landed && falling && abs(v.x) < params.slide_speed) {\r\n    let ix = i32(floor(pos.x));\r\n    let iy = i32(floor(pos.y));\r\n    if (!open_at(ix, iy - 1)) {\r\n      let direction = choose_direction(open_at(ix - 1, iy - 1), open_at(ix + 1, iy - 1), i ^ params.frame);\r\n      if (direction != 0) { v.x = f32(direction) * params.slide_speed; }\r\n    }\r\n  }\r\n\r\n  pos.x = clamp(pos.x, 0.0, f32(params.world.x) - EDGE_EPSILON);\r\n  pos.y = clamp(pos.y, 0.0, f32(params.world.y) * SKY_HEADROOM);\r\n\r\n  p.pos_x = pos.x;\r\n  p.pos_y = pos.y;\r\n  p.vel_x = v.x;\r\n  p.vel_y = v.y;\r\n  particles[i] = p;\r\n}\r\n\r\n// Rest bookkeeping runs once per rendered frame, after every physics substep,\r\n// so `rest_threshold` stays denominated in frames however finely the\r\n// integrator is stepped.\r\n@compute @workgroup_size(256)\r\nfn advance(@builtin(global_invocation_id) gid: vec3u, @builtin(num_workgroups) groups: vec3u) {\r\n  let i = linear_index(gid, groups);\r\n  if (i >= params.capacity) { return; }\r\n  let state = states[i];\r\n  if ((state & STATE_ALIVE_BIT) == 0u) { return; }\r\n  var p = particles[i];\r\n\r\n  // Rest is measured in cells, not speed: a pixel that has not changed cell\r\n  // for `rest_threshold` frames is considered part of the world again.\r\n  var cell = SKY_CELL;\r\n  if (p.pos_y < f32(params.world.y)) {\r\n    cell = cell_index(i32(floor(p.pos_x)), i32(floor(p.pos_y)));\r\n  }\r\n  if (cell != SKY_CELL && cell == p.last_cell) {\r\n    states[i] = with_rest(state, rest_of(state) + 1u);\r\n  } else {\r\n    states[i] = with_rest(state, 0u);\r\n    p.last_cell = cell;\r\n    particles[i] = p;\r\n  }\r\n}\r\n\r\n@compute @workgroup_size(256)\r\nfn settle(@builtin(global_invocation_id) gid: vec3u, @builtin(num_workgroups) groups: vec3u) {\r\n  let i = linear_index(gid, groups);\r\n  if (i >= params.capacity) { return; }\r\n  let state = states[i];\r\n  if ((state & STATE_ALIVE_BIT) == 0u) { return; }\r\n  if (rest_of(state) < params.rest_threshold) { return; }\r\n  var p = particles[i];\r\n  if (p.last_cell == SKY_CELL) {\r\n    states[i] = with_rest(state, 0u);\r\n    return;\r\n  }\r\n\r\n  let x = i32(p.last_cell % params.world.x);\r\n  let y = i32(p.last_cell / params.world.x);\r\n  // One last look at what is underneath before committing. A pixel comes to\r\n  // rest *on* something, and "has not changed cell" is not enough on its own:\r\n  // at the apex of an arc a pixel barely moves from one frame to the next, so\r\n  // it would settle in mid-air. Several arriving together then form a clump\r\n  // whose interior satisfies its own bond, and the clump hangs there for good.\r\n  // Smudging upward launches a whole brushful of pixels that reach their apex\r\n  // at the same moment, which is why it froze them in the sky.\r\n  // A pixel comes to rest *on* something, and "has not changed cell" is not\r\n  // enough on its own: at the apex of an arc a pixel barely moves from one frame\r\n  // to the next, so it would settle in mid-air. Several arriving together then\r\n  // form a clump whose interior satisfies its own bond, and the clump hangs\r\n  // there for good.\r\n  //\r\n  // Water is exempt. It has no bond to satisfy, so a drop that stops in mid-air\r\n  // is released again next frame anyway \u2014 and requiring a floor would stop a\r\n  // column of water ever filling a shaft from the bottom up.\r\n  if (!is_water(state) && open_at(x, y - 1)) {\r\n    states[i] = with_rest(state, 0u);\r\n    return;\r\n  }\r\n\r\n  // Anything that has been airborne comes back down as rubble: blasted stone\r\n  // does not re-freeze into cliff face that holds a ceiling up again. Water is\r\n  // the exception and has to be \u2014 settle it as rubble and a drop turns to sand\r\n  // the first time it lands, and a river silts up into a sandbank.\r\n  var landed_bond = params.rubble_bond;\r\n  if (is_water(state)) { landed_bond = WATER_BOND; }\r\n  let deposit = ((state & MATERIAL_MASK) & ~BOND_MASK)\r\n    | (landed_bond << BOND_SHIFT)\r\n    | OCCUPIED_BIT;\r\n  let claimed = atomicCompareExchangeWeak(&field[p.last_cell], 0u, deposit);\r\n  if (claimed.exchanged) {\r\n    states[i] = 0u;\r\n    // Push only \u2014 `emit` is the only pass that pops, and it runs after this.\r\n    let slot = atomicAdd(&counters.tail, 1u);\r\n    free_ring[slot & params.ring_mask] = i;\r\n    atomicAdd(&counters.deposited, 1u);\r\n  } else {\r\n    // Lost the race. Nothing stops two pixels sharing a cell \u2014 positions are\r\n    // floats \u2014 so when one wins the deposit the other is left standing inside\r\n    // solid material, and in a collapsing pile that happens tens of thousands\r\n    // of times a frame.\r\n    //\r\n    // Hand it to the nearest empty neighbour: a one-cell jostle is what a\r\n    // crowded pile actually does. The previous answer, launching it upward with\r\n    // collision switched off so it could climb out, is what put pixels on\r\n    // screen rising through solid rock \u2014 and sinking back down through it once\r\n    // gravity turned them round.\r\n    atomicAdd(&counters.crowded, 1u);\r\n    let bias = select(-1, 1, rand01(i ^ params.frame) < 0.5);\r\n    // One further ring each frame, advancing, so a pixel with no space close by\r\n    // sweeps outward over about half a second rather than searching the whole\r\n    // disc every frame for every buried pixel.\r\n    let probe = RESCUE_RINGS + 1 + i32((params.frame + i) % u32(MAX_PROBE_RING - RESCUE_RINGS));\r\n    if (rescue_deposit(x, y, bias, deposit, probe)) {\r\n      states[i] = 0u;\r\n      let slot = atomicAdd(&counters.tail, 1u);\r\n      free_ring[slot & params.ring_mask] = i;\r\n      atomicAdd(&counters.deposited, 1u);\r\n      return;\r\n    }\r\n    // Buried with no free cell within reach. It waits here and tries again next\r\n    // frame; a pile is dynamic and space usually opens within a frame or two.\r\n    //\r\n    // It must not travel. Marching it up to the surface a cell a frame \u2014 the\r\n    // previous answer \u2014 conserves matter but relocates it hundreds of cells: a\r\n    // pixel built over just inside a crater wall has open space two cells\r\n    // sideways and a quarter of a screen of solid rock above it. It would climb\r\n    // all of that and surface far from where its matter belonged, which is why\r\n    // the ground appeared to grow from underneath and to gain material.\r\n    atomicAdd(&counters.stuck, 1u);\r\n    states[i] = with_rest(state, 0u);\r\n    p.vel_x = 0.0;\r\n    p.vel_y = 0.0;\r\n    particles[i] = p;\r\n  }\r\n}\r\n\r\n@compute @workgroup_size(256)\r\nfn emit(@builtin(global_invocation_id) gid: vec3u, @builtin(num_workgroups) groups: vec3u) {\r\n  let c = linear_index(gid, groups);\r\n  if (c >= params.world.x * params.world.y) { return; }\r\n  // The overlay is cleared here so the splat pass has a blank slate and the\r\n  // grid is only walked once per frame.\r\n  atomicStore(&overlay[c], 0u);\r\n\r\n  let value = atomicLoad(&field[c]);\r\n  if (value == 0u) { return; }\r\n\r\n  let x = i32(c % params.world.x);\r\n  let y = i32(c / params.world.x);\r\n  let centre = vec2f(f32(x) + 0.5, f32(y) + 0.5);\r\n  let offset = centre - params.blast.xy;\r\n  let seed = hash_u32(c * 2654435761u + params.frame * 40503u);\r\n  let smudging = dot(params.brush_drag, params.brush_drag) > 0.0;\r\n\r\n  var reason = REASON_NONE;\r\n  var direction = 0;\r\n  if ((value & DISLODGE_BIT) != 0u) {\r\n    reason = REASON_DISLODGE;\r\n  } else if (params.blast.z > 0.0 && dot(offset, offset) < params.blast.z * params.blast.z\r\n      && (!smudging || smudgeable(x, y, bond_of(value)))) {\r\n    // The pointer brush. An explosion breaks anything, however well bonded. A\r\n    // smudge only takes what it can reach: material at a surface, and material\r\n    // loosely enough bonded to drag out of a heap. Releasing everything under\r\n    // the brush instead \u2014 which is what this did first \u2014 liquefies solid rock\r\n    // for as long as the pointer is held down, far faster than any of it can\r\n    // settle, and buries an order of magnitude more than a blast does.\r\n    reason = REASON_BLAST;\r\n  } else if (is_water(value)) {\r\n    // Water is held by nothing, so the only question is whether it has anywhere\r\n    // to go. A cell walled in by rock and its own kind is a cell at rest.\r\n    let flow = water_flow(x, y, seed);\r\n    if (flow.x != 0 || flow.y != 0) {\r\n      reason = REASON_WATER;\r\n      direction = flow.x;\r\n    }\r\n  } else if (displaces_water(x, y, value)) {\r\n    // Sand sinks through water by simply swapping with it. No pool slot is\r\n    // needed and none is taken: nothing here goes into motion, two cells just\r\n    // exchange contents, so sinking carries on working in a world whose pool\r\n    // has run dry.\r\n    //\r\n    // This is the one place anything writes a cell that is not its own, so the\r\n    // cell below is claimed rather than stored into: its own invocation may be\r\n    // releasing it in this same pass, and exactly one of the two may have it.\r\n    // Losing the claim costs nothing \u2014 the water left, so next frame this cell\r\n    // simply falls into the space instead.\r\n    let below = cell_index(x, y - 1);\r\n    let under = atomicLoad(&field[below]);\r\n    if (is_water(under) && atomicCompareExchangeWeak(&field[below], under, value).exchanged) {\r\n      // Our own cell has no other writer, so the water can go straight in. It\r\n      // sheds any dislodge mark on the way: whatever struck it left its\r\n      // momentum in the cell below, and the water is not going that way now.\r\n      atomicStore(&field[c], under & ~DISLODGE_BIT);\r\n      atomicAdd(&counters.sank, 1u);\r\n    }\r\n    return;\r\n  } else if (!is_held(x, y, bond_of(value))) {\r\n    // Its neighbours are no longer enough to hold it. Which way it goes is the\r\n    // three-cell test; whether it goes at all was the bond.\r\n    let support = support_at(x, y, seed);\r\n    if (support.x == SUPPORT_FALL) {\r\n      reason = REASON_UNDERMINE;\r\n    } else if (support.x == SUPPORT_SLUMP && rand01(seed ^ 0x5bd1u) < params.slump_chance) {\r\n      reason = REASON_SLUMP;\r\n      direction = support.y;\r\n    }\r\n  }\r\n  if (reason == REASON_NONE) { return; }\r\n\r\n  // Claim the cell before spending anything. A water cell may also be claimed\r\n  // this frame by the cell above it trading places, and only one of the two may\r\n  // win; a loser that had already popped a slot would have to give it back, and\r\n  // only `settle` is allowed to push to the ring.\r\n  if (!atomicCompareExchangeWeak(&field[c], value, 0u).exchanged) { return; }\r\n\r\n  let budget = atomicSub(&counters.pop_budget, 1);\r\n  if (budget <= 0) {\r\n    // The pool is full. Drop the dislodge mark so the cell is reconsidered\r\n    // next frame rather than staying flagged forever, and drop the momentum\r\n    // with it so a cell struck repeatedly under starvation cannot bank an\r\n    // arbitrarily large launch.\r\n    atomicStore(&field[c], value & ~DISLODGE_BIT);\r\n    atomicStore(&impulse[c], 0u);\r\n    atomicAdd(&counters.denied, 1u);\r\n    return;\r\n  }\r\n  let slot = free_ring[atomicAdd(&counters.head, 1u) & params.ring_mask];\r\n\r\n  var vel = vec2f(0.0, -0.5);\r\n  if (reason == REASON_DISLODGE) {\r\n    // Leave with the momentum whatever hit this cell handed over, so an impact\r\n    // splashes in the direction it came from instead of dropping limply.\r\n    vel = unpack2x16float(atomicExchange(&impulse[c], 0u));\r\n  } else if (reason == REASON_BLAST) {\r\n    let distance = max(length(offset), EDGE_EPSILON);\r\n    let falloff = 1.0 - distance / params.blast.z;\r\n    if (smudging) {\r\n      // Carried the way the pointer went, with a soft edge so the brush drags a\r\n      // smear of material rather than cutting a disc out of the world.\r\n      //\r\n      // This is the difference between a smudge and a blast, and it is not\r\n      // merely that it is gentler. A blast fires everything radially, which\r\n      // inside a pocket means into the crater wall a few cells away, where most\r\n      // of it is far too well bonded to break. The debris reflects, comes\r\n      // straight back inward, and mills about in a closed space until the\r\n      // collapse buries it. A drag sends material somewhere it can actually go.\r\n      vel = params.brush_drag * params.blast.w\r\n        * (0.35 + 0.65 * falloff)\r\n        * (0.7 + 0.6 * rand01(seed ^ 0x9e37u));\r\n    } else {\r\n      // The falloff keeps a floor: at the rim a linear taper reaches zero, and\r\n      // debris that does not move is still sitting there when the crater\r\n      // collapses back in on top of it.\r\n      vel = (offset / distance) * params.blast.w\r\n        * (BLAST_RIM + (1.0 - BLAST_RIM) * falloff)\r\n        * (0.6 + 0.8 * rand01(seed ^ 0x9e37u));\r\n    }\r\n    atomicAdd(&counters.dislodged, 1u);\r\n  } else if (reason == REASON_WATER) {\r\n    // Sideways along a floor, or down and along. Gently: water creeps, and a\r\n    // drop given a real shove would arc away like grit.\r\n    vel = vec2f(f32(direction) * params.water_spread, -params.water_spread * 0.5);\r\n    atomicAdd(&counters.flowing, 1u);\r\n  } else if (reason == REASON_SLUMP) {\r\n    vel = vec2f(f32(direction) * params.slide_speed, -0.5);\r\n    atomicAdd(&counters.undermined, 1u);\r\n  } else if (reason == REASON_UNDERMINE) {\r\n    atomicAdd(&counters.undermined, 1u);\r\n  }\r\n\r\n  particles[slot] = Particle(centre.x, centre.y, vel.x, vel.y, SKY_CELL);\r\n  states[slot] = (value & MATERIAL_MASK) | STATE_ALIVE_BIT;\r\n  atomicAdd(&counters.emitted, 1u);\r\n}\r\n\r\n@compute @workgroup_size(256)\r\nfn splat(@builtin(global_invocation_id) gid: vec3u, @builtin(num_workgroups) groups: vec3u) {\r\n  let i = linear_index(gid, groups);\r\n  if (i >= params.capacity) { return; }\r\n  let state = states[i];\r\n  if ((state & STATE_ALIVE_BIT) == 0u) { return; }\r\n  let p = particles[i];\r\n  let x = i32(floor(p.pos_x));\r\n  let y = i32(floor(p.pos_y));\r\n  if (!in_bounds(x, y)) { return; }\r\n  // A buried pixel is inside solid material, and the field already draws that\r\n  // cell. Drawing the pixel too would show something moving through rock.\r\n  if (!open_at(x, y)) { return; }\r\n  var mark = (state & COLOR_MASK) | OCCUPIED_BIT;\r\n  // Flag the cell if this pixel is moving fast enough to break a lemming.\r\n  if (length(vec2f(p.vel_x, p.vel_y)) >= AGENT_SHATTER_SPEED) { mark |= OVERLAY_FAST; }\r\n  atomicMax(&overlay[cell_index(x, y)], mark);\r\n}\r\n\r\n// Whether anything is tearing through the block a lemming occupies. Reads the\r\n// overlay, which at this point in the frame still holds the previous frame\'s\r\n// moving pixels \u2014 a frame stale, which is plenty for "is something hitting me".\r\nfn struck_by_debris(x: i32, y: i32) -> bool {\r\n  for (var dy = 0; dy < AGENT_HEIGHT; dy += 1) {\r\n    for (var dx = -AGENT_HALF_W; dx <= AGENT_HALF_W; dx += 1) {\r\n      if (!in_bounds(x + dx, y + dy)) { continue; }\r\n      if ((atomicLoad(&overlay[cell_index(x + dx, y + dy)]) & OVERLAY_FAST) != 0u) { return true; }\r\n    }\r\n  }\r\n  return false;\r\n}\r\n\r\n// Whether any part of a lemming is in the water.\r\nfn touches_water(x: i32, y: i32) -> bool {\r\n  for (var dy = 0; dy < AGENT_HEIGHT; dy += 1) {\r\n    for (var dx = -AGENT_HALF_W; dx <= AGENT_HALF_W; dx += 1) {\r\n      if (!in_bounds(x + dx, y + dy)) { continue; }\r\n      if (is_water(atomicLoad(&field[cell_index(x + dx, y + dy)]))) { return true; }\r\n    }\r\n  }\r\n  return false;\r\n}\r\n\r\n// Releases one cell into the pool with a velocity. Returns whether a slot was\r\n// free; a lemming that cannot dig this frame simply waits.\r\nfn release_cell(x: i32, y: i32, vel: vec2f) -> bool {\r\n  if (!in_bounds(x, y)) { return false; }\r\n  let c = cell_index(x, y);\r\n  let value = atomicLoad(&field[c]);\r\n  if (value == 0u || bond_of(value) == 0u) { return false; }\r\n  let budget = atomicSub(&counters.pop_budget, 1);\r\n  if (budget <= 0) { return false; }\r\n  let slot = free_ring[atomicAdd(&counters.head, 1u) & params.ring_mask];\r\n  atomicStore(&field[c], 0u);\r\n  particles[slot] = Particle(f32(x) + 0.5, f32(y) + 0.5, vel.x, vel.y, SKY_CELL);\r\n  states[slot] = (value & MATERIAL_MASK) | STATE_ALIVE_BIT;\r\n  atomicAdd(&counters.emitted, 1u);\r\n  return true;\r\n}\r\n\r\n// A lemming coming apart into its own pixels. Its body is not part of the\r\n// field, so this is the one place matter enters the world; the amount is\r\n// bounded by the number of lemmings times the size of the block.\r\nfn shatter(index: u32, x: i32, y: i32, colour: u32) {\r\n  for (var dy = 0; dy < AGENT_HEIGHT; dy += 1) {\r\n    for (var dx = -AGENT_HALF_W; dx <= AGENT_HALF_W; dx += 1) {\r\n      let budget = atomicSub(&counters.pop_budget, 1);\r\n      if (budget <= 0) { return; }\r\n      let slot = free_ring[atomicAdd(&counters.head, 1u) & params.ring_mask];\r\n      let seed = hash_u32(index * 7919u + u32((dy + 1) * 8 + dx + 4));\r\n      particles[slot] = Particle(\r\n        f32(x + dx) + 0.5, f32(y + dy) + 0.5,\r\n        (rand01(seed) - 0.5) * 200.0, 60.0 + rand01(seed ^ 0x51u) * 140.0,\r\n        SKY_CELL,\r\n      );\r\n      states[slot] = (colour & COLOR_MASK) | (params.rubble_bond << BOND_SHIFT) | STATE_ALIVE_BIT;\r\n      atomicAdd(&counters.emitted, 1u);\r\n    }\r\n  }\r\n}\r\n\r\n// Walks the lemmings, and lets them dig and detonate. One thread apiece, and\r\n// there are few of them, so this is the cheapest pass in the frame.\r\n//\r\n// It runs before `emit` so a lemming digging or blowing up competes for free\r\n// slots on the same budget the world does, rather than on top of it.\r\n@compute @workgroup_size(256)\r\nfn step_agents(@builtin(global_invocation_id) gid: vec3u, @builtin(num_workgroups) groups: vec3u) {\r\n  let i = linear_index(gid, groups);\r\n  if (i >= params.agent_count) { return; }\r\n  var a = agents[i];\r\n  if ((a.state & AGENT_ALIVE_BIT) == 0u) {\r\n    // Gone, and counting down to a replacement. The timer bits are reused: a\r\n    // dead slot has no mode or facing to remember.\r\n    let waiting = a.state & AGENT_TIMER_MASK;\r\n    if (waiting > 1u) {\r\n      agents[i] = Agent(a.pos_x, a.pos_y, 0.0, 0.0, waiting - 1u);\r\n      return;\r\n    }\r\n    let born = hash_u32(i * 40503u + params.frame);\r\n    var packed = AGENT_ALIVE_BIT | (MODE_WALK << AGENT_MODE_SHIFT) | (40u + (born % 140u));\r\n    if ((born & 1u) == 1u) { packed |= AGENT_FACING_BIT; }\r\n    agents[i] = Agent(\r\n      rand01(born ^ 0x77u) * f32(params.world.x),\r\n      f32(params.world.y) * 0.97,\r\n      0.0, 0.0, packed,\r\n    );\r\n    return;\r\n  }\r\n\r\n  let x = i32(floor(a.pos_x));\r\n  let y = i32(floor(a.pos_y));\r\n  let colour = 0x00e8d0u;\r\n\r\n  // Anything hurtling through takes it apart: the same bargain the rest of the\r\n  // world makes, hold together until something hits hard enough.\r\n  // Water is fatal on contact. A lemming caught by a flood does not decohere\r\n  // into a spray of its own pixels the way one crushed by rock does \u2014 it simply\r\n  // goes under, so there is nothing to release.\r\n  if (touches_water(x, y)) {\r\n    atomicAdd(&counters.drowned, 1u);\r\n    agents[i] = Agent(a.pos_x, a.pos_y, 0.0, 0.0,\r\n      AGENT_RESPAWN + (hash_u32(i ^ params.frame) % 100u));\r\n    return;\r\n  }\r\n\r\n  if (struck_by_debris(x, y)) {\r\n    shatter(i, x, y, colour);\r\n    agents[i] = Agent(a.pos_x, a.pos_y, 0.0, 0.0,\r\n      AGENT_RESPAWN + (hash_u32(i ^ params.frame) % 100u));\r\n    return;\r\n  }\r\n\r\n  atomicAdd(&counters.walking, 1u);\r\n  var timer = a.state & AGENT_TIMER_MASK;\r\n  var mode = (a.state & AGENT_MODE_MASK) >> AGENT_MODE_SHIFT;\r\n  var facing = -1;\r\n  if ((a.state & AGENT_FACING_BIT) != 0u) { facing = 1; }\r\n  let seed = hash_u32(i * 2654435761u + params.frame);\r\n\r\n  // Nothing underfoot beats everything else: a lemming whose floor has been dug\r\n  // away or blown out falls, whatever it was doing.\r\n  if (!blocked_at(x, y - 1)) {\r\n    a.vel_y -= params.gravity * params.frame_seconds;\r\n    let next = a.pos_y + a.vel_y * params.frame_seconds;\r\n    if (blocked_at(x, i32(floor(next)))) {\r\n      a.vel_y = 0.0;\r\n    } else {\r\n      a.pos_y = clamp(next, 0.0, f32(params.world.y) - EDGE_EPSILON);\r\n    }\r\n    agents[i] = Agent(a.pos_x, a.pos_y, 0.0, a.vel_y, a.state);\r\n    return;\r\n  }\r\n  a.vel_y = 0.0;\r\n\r\n  if (mode == MODE_FUSE && timer <= 1u) {\r\n    // The bomb. Everything within the radius leaves with momentum pointing\r\n    // away, and the lemming goes with it.\r\n    let r = i32(params.agent_blast);\r\n    for (var dy = -r; dy <= r; dy += 1) {\r\n      for (var dx = -r; dx <= r; dx += 1) {\r\n        let d = sqrt(f32(dx * dx + dy * dy));\r\n        if (d > f32(r)) { continue; }\r\n        let away = vec2f(f32(dx), f32(dy)) / max(d, 1.0);\r\n        release_cell(x + dx, y + dy, away * params.blast.w * (1.0 - d / f32(r)) * 0.5);\r\n      }\r\n    }\r\n    shatter(i, x, y, colour);\r\n    agents[i] = Agent(a.pos_x, a.pos_y, 0.0, 0.0,\r\n      AGENT_RESPAWN + (hash_u32(i ^ params.frame) % 100u));\r\n    return;\r\n  }\r\n\r\n  if (mode == MODE_DIG) {\r\n    // Chews the cell ahead and the one above it, so the tunnel is tall enough\r\n    // to walk back through.\r\n    let low = release_cell(x + facing, y, vec2f(f32(facing) * 40.0, 10.0));\r\n    let high = release_cell(x + facing, y + 1, vec2f(f32(facing) * 40.0, 30.0));\r\n    if (low || high) { atomicAdd(&counters.dug, 1u); }\r\n    if (low) {\r\n      a.pos_x = clamp(a.pos_x + f32(facing) * 0.7, 0.0, f32(params.world.x) - EDGE_EPSILON);\r\n    }\r\n  } else {\r\n    // Walking. Clear ahead and it walks on; a single cell in the way and it\r\n    // steps up; anything taller and it turns round.\r\n    let ahead = blocked_at(x + facing, y);\r\n    if (!ahead) {\r\n      a.pos_x = clamp(a.pos_x + f32(facing) * params.agent_speed * params.frame_seconds,\r\n        0.0, f32(params.world.x) - EDGE_EPSILON);\r\n    } else if (!blocked_at(x + facing, y + 1)) {\r\n      a.pos_x = clamp(a.pos_x + f32(facing) * 0.6, 0.0, f32(params.world.x) - EDGE_EPSILON);\r\n      a.pos_y = clamp(a.pos_y + 1.0, 0.0, f32(params.world.y) - EDGE_EPSILON);\r\n    } else {\r\n      facing = -facing;\r\n    }\r\n  }\r\n\r\n  if (timer > 1u) {\r\n    timer -= 1u;\r\n  } else if (mode != MODE_WALK) {\r\n    mode = MODE_WALK;\r\n    timer = 60u + (seed % 120u);\r\n  } else if (rand01(seed ^ 0x2f1cu) < params.agent_bomb_chance) {\r\n    mode = MODE_FUSE;\r\n    timer = 70u + (seed % 90u);\r\n  } else {\r\n    mode = MODE_DIG;\r\n    timer = 25u + (seed % 70u);\r\n  }\r\n\r\n  var packed = AGENT_ALIVE_BIT | (mode << AGENT_MODE_SHIFT) | timer;\r\n  if (facing > 0) { packed |= AGENT_FACING_BIT; }\r\n  agents[i] = Agent(a.pos_x, a.pos_y, 0.0, 0.0, packed);\r\n}\r\n\r\n// Draws the lemmings, after `emit` has cleared the overlay and `splat` has\r\n// filled it with this frame\'s moving pixels.\r\n@compute @workgroup_size(256)\r\nfn draw_agents(@builtin(global_invocation_id) gid: vec3u, @builtin(num_workgroups) groups: vec3u) {\r\n  let i = linear_index(gid, groups);\r\n  if (i >= params.agent_count) { return; }\r\n  let a = agents[i];\r\n  if ((a.state & AGENT_ALIVE_BIT) == 0u) { return; }\r\n  // A lit fuse blinks, faster as it runs down, so you can see one coming.\r\n  var colour = 0x00e8d0u;\r\n  if (((a.state & AGENT_MODE_MASK) >> AGENT_MODE_SHIFT) == MODE_FUSE) {\r\n    let timer = a.state & AGENT_TIMER_MASK;\r\n    if (((params.frame / (timer / 10u + 1u)) & 1u) == 0u) { colour = 0x3040ffu; }\r\n  }\r\n  let x = i32(floor(a.pos_x));\r\n  let y = i32(floor(a.pos_y));\r\n  for (var dy = 0; dy < AGENT_HEIGHT; dy += 1) {\r\n    for (var dx = -AGENT_HALF_W; dx <= AGENT_HALF_W; dx += 1) {\r\n      if (!in_bounds(x + dx, y + dy)) { continue; }\r\n      atomicMax(&overlay[cell_index(x + dx, y + dy)], colour | OCCUPIED_BIT | OVERLAY_AGENT);\r\n    }\r\n  }\r\n}\r\n\r\n// Clears stored momentum across the grid. Only needed on reset: in steady state\r\n// a cell\'s impulse is consumed by `emit` the moment it is released.\r\n@compute @workgroup_size(256)\r\nfn clear_impulse(@builtin(global_invocation_id) gid: vec3u, @builtin(num_workgroups) groups: vec3u) {\r\n  let c = linear_index(gid, groups);\r\n  if (c >= params.world.x * params.world.y) { return; }\r\n  atomicStore(&impulse[c], 0u);\r\n}\r\n\r\n// Rebuilds the pool in place. Run over `ring_mask + 1` invocations; the CPU\r\n// resets head/tail alongside it, so no slot is ever live twice.\r\n@compute @workgroup_size(256)\r\nfn init_pool(@builtin(global_invocation_id) gid: vec3u, @builtin(num_workgroups) groups: vec3u) {\r\n  let i = linear_index(gid, groups);\r\n  if (i > params.ring_mask) { return; }\r\n  free_ring[i] = i;\r\n  if (i < params.capacity) {\r\n    particles[i] = Particle(0.0, 0.0, 0.0, 0.0, SKY_CELL);\r\n    states[i] = 0u;\r\n  }\r\n}\r\n';

// src/gpu/shaders/composite.wgsl
var composite_default = "// Composites the two layers the simulation maintains: `field` is the static\r\n// world, `overlay` is this frame's moving pixels. Both are read-only here, so\r\n// they are bound without atomics.\r\n\r\nconst COLOR_MASK: u32 = 0x00ffffffu;\r\n/** Cap on the supersample box when zoomed out, per axis. */\r\nconst MAX_TAPS: i32 = 3;\r\n\r\nstruct Params {\r\n  world: vec2u,\r\n  capacity: u32,\r\n  ring_mask: u32,\r\n  gravity: f32,\r\n  dt: f32,\r\n  damping: f32,\r\n  restitution: f32,\r\n  rest_threshold: u32,\r\n  frame: u32,\r\n  slump_chance: f32,\r\n  slide_speed: f32,\r\n  dislodge_speed: f32,\r\n  blast: vec4f,\r\n  viewport: vec2f,\r\n  camera_origin: vec2f,\r\n  camera_scale: f32,\r\n  rubble_bond: u32,\r\n  // Which way the pointer is being dragged, or zero for a radial blast. The\r\n  // brush position, radius and strength live in `blast`.\r\n  brush_drag: vec2f,\r\n  agent_count: u32,\r\n  agent_speed: f32,\r\n  agent_bomb_chance: f32,\r\n  agent_blast: f32,\r\n  frame_seconds: f32,\r\n  water_spread: f32,\r\n};\r\n\r\n@group(0) @binding(0) var<uniform> params: Params;\r\n@group(0) @binding(1) var<storage, read> field: array<u32>;\r\n@group(0) @binding(2) var<storage, read> overlay: array<u32>;\r\n\r\nconst VOID = vec3f(0.016, 0.018, 0.026);\r\nconst SKY = vec3f(0.035, 0.040, 0.055);\r\n\r\n@vertex\r\nfn vertex_main(@builtin(vertex_index) index: u32) -> @builtin(position) vec4f {\r\n  // One oversized triangle covering the viewport.\r\n  var corners = array<vec2f, 3>(vec2f(-1.0, -1.0), vec2f(3.0, -1.0), vec2f(-1.0, 3.0));\r\n  return vec4f(corners[index], 0.0, 1.0);\r\n}\r\n\r\nfn unpack(word: u32) -> vec3f {\r\n  return vec3f(\r\n    f32(word & 255u),\r\n    f32((word >> 8u) & 255u),\r\n    f32((word >> 16u) & 255u),\r\n  ) / 255.0;\r\n}\r\n\r\n// Colour of one world cell: a moving pixel wins over the settled world.\r\nfn sample_cell(x: i32, y: i32) -> vec3f {\r\n  if (x < 0 || y < 0 || x >= i32(params.world.x) || y >= i32(params.world.y)) { return VOID; }\r\n  let cell = u32(y) * params.world.x + u32(x);\r\n  let moving = overlay[cell];\r\n  if (moving != 0u) { return unpack(moving & COLOR_MASK); }\r\n  let settled = field[cell];\r\n  if (settled != 0u) { return unpack(settled & COLOR_MASK); }\r\n  return SKY;\r\n}\r\n\r\n@fragment\r\nfn fragment_main(@builtin(position) frag: vec4f) -> @location(0) vec4f {\r\n  // Screen space is y-down and the world is y-up; `camera_origin` is the world\r\n  // coordinate at the bottom-left of the viewport.\r\n  let world_x = params.camera_origin.x + frag.x / params.camera_scale;\r\n  let world_y = params.camera_origin.y + (params.viewport.y - frag.y) / params.camera_scale;\r\n  let x = i32(floor(world_x));\r\n  let y = i32(floor(world_y));\r\n  if (x < 0 || y < 0 || x >= i32(params.world.x) || y >= i32(params.world.y)) {\r\n    return vec4f(VOID, 1.0);\r\n  }\r\n\r\n  // Zoomed out, one fragment covers several cells. Point sampling would drop\r\n  // most of them, and a stream of moving pixels would strobe in and out of\r\n  // existence, so average a small box instead.\r\n  let taps = clamp(i32(ceil(1.0 / params.camera_scale)), 1, MAX_TAPS);\r\n  if (taps == 1) { return vec4f(sample_cell(x, y), 1.0); }\r\n\r\n  var total = vec3f(0.0);\r\n  for (var dy = 0; dy < taps; dy += 1) {\r\n    for (var dx = 0; dx < taps; dx += 1) {\r\n      total += sample_cell(\r\n        x + i32(f32(dx) / (params.camera_scale * f32(taps))),\r\n        y + i32(f32(dy) / (params.camera_scale * f32(taps))),\r\n      );\r\n    }\r\n  }\r\n  return vec4f(total / f32(taps * taps), 1.0);\r\n}\r\n";

// src/gpu/pipelines.js
function createPipelines(device, format) {
  const computeLayout = device.createBindGroupLayout({
    entries: [
      { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: "uniform" } },
      { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: "storage" } },
      { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: "storage" } },
      { binding: 3, visibility: GPUShaderStage.COMPUTE, buffer: { type: "storage" } },
      { binding: 4, visibility: GPUShaderStage.COMPUTE, buffer: { type: "storage" } },
      { binding: 5, visibility: GPUShaderStage.COMPUTE, buffer: { type: "storage" } },
      { binding: 6, visibility: GPUShaderStage.COMPUTE, buffer: { type: "storage" } },
      { binding: 7, visibility: GPUShaderStage.COMPUTE, buffer: { type: "storage" } },
      { binding: 8, visibility: GPUShaderStage.COMPUTE, buffer: { type: "storage" } }
    ]
  });
  const compositeLayout = device.createBindGroupLayout({
    entries: [
      { binding: 0, visibility: GPUShaderStage.FRAGMENT, buffer: { type: "uniform" } },
      { binding: 1, visibility: GPUShaderStage.FRAGMENT, buffer: { type: "read-only-storage" } },
      { binding: 2, visibility: GPUShaderStage.FRAGMENT, buffer: { type: "read-only-storage" } }
    ]
  });
  const simulation = device.createShaderModule({ code: simulation_default, label: "ground-truth-simulation" });
  const composite = device.createShaderModule({ code: composite_default, label: "ground-truth-composite" });
  const computePipelineLayout = device.createPipelineLayout({ bindGroupLayouts: [computeLayout] });
  const computePipeline = (entryPoint) => device.createComputePipeline({
    label: `ground-truth-${entryPoint}`,
    layout: computePipelineLayout,
    compute: { module: simulation, entryPoint }
  });
  const compute = {};
  for (const pass of COMPUTE_PASSES) compute[pass] = computePipeline(pass);
  return {
    computeLayout,
    compositeLayout,
    compute,
    initPool: computePipeline("init_pool"),
    clearImpulse: computePipeline("clear_impulse"),
    composite: device.createRenderPipeline({
      label: "ground-truth-composite",
      layout: device.createPipelineLayout({ bindGroupLayouts: [compositeLayout] }),
      vertex: { module: composite, entryPoint: "vertex_main" },
      fragment: { module: composite, entryPoint: "fragment_main", targets: [{ format }] },
      primitive: { topology: "triangle-list" }
    })
  };
}

// src/gpu/resources.js
var READBACK_DEPTH = 3;
var SimulationResources = class {
  /**
   * @param {GPUDevice} device
   * @param {{ width: number, height: number }} world
   */
  constructor(device, world) {
    this.device = device;
    this.world = world;
    this.cellCount = world.width * world.height;
    this.capacity = 0;
    this.ringSize = 0;
    this.params = device.createBuffer({
      label: "params",
      size: PARAMS_BYTES,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
    });
    this.field = device.createBuffer({
      label: "field",
      size: this.cellCount * 4,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC
    });
    this.overlay = device.createBuffer({
      label: "overlay",
      size: this.cellCount * 4,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC
    });
    this.impulse = device.createBuffer({
      label: "impulse",
      size: this.cellCount * 4,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC
    });
    this.agents = device.createBuffer({
      label: "agents",
      size: AGENT_CAPACITY * AGENT_STRIDE_BYTES,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC
    });
    this.counters = device.createBuffer({
      label: "counters",
      size: COUNTERS_BYTES,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC
    });
    this.particles = null;
    this.states = null;
    this.freeRing = null;
    this.computeBindGroup = null;
    this.compositeBindGroup = null;
    this.readback = new CounterReadback(device, COUNTERS_BYTES);
  }
  /**
   * (Re)allocates the pool. Existing motion is discarded: the caller is
   * expected to reset the field alongside it.
   *
   * @param {number} capacity
   * @param {GPUBindGroupLayout} computeLayout
   * @param {GPUBindGroupLayout} compositeLayout
   */
  allocatePool(capacity, computeLayout, compositeLayout) {
    this.particles?.destroy();
    this.states?.destroy();
    this.freeRing?.destroy();
    this.capacity = capacity;
    this.ringSize = ringSize(capacity);
    this.particles = this.device.createBuffer({
      label: "particles",
      size: capacity * PARTICLE_STRIDE_BYTES,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC
    });
    this.states = this.device.createBuffer({
      label: "states",
      size: capacity * STATE_BYTES,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC
    });
    this.freeRing = this.device.createBuffer({
      label: "free-ring",
      size: this.ringSize * 4,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC
    });
    this.computeBindGroup = this.device.createBindGroup({
      layout: computeLayout,
      entries: [
        { binding: 0, resource: { buffer: this.params } },
        { binding: 1, resource: { buffer: this.particles } },
        { binding: 2, resource: { buffer: this.field } },
        { binding: 3, resource: { buffer: this.overlay } },
        { binding: 4, resource: { buffer: this.freeRing } },
        { binding: 5, resource: { buffer: this.counters } },
        { binding: 6, resource: { buffer: this.states } },
        { binding: 7, resource: { buffer: this.impulse } },
        { binding: 8, resource: { buffer: this.agents } }
      ]
    });
    this.compositeBindGroup = this.device.createBindGroup({
      layout: compositeLayout,
      entries: [
        { binding: 0, resource: { buffer: this.params } },
        { binding: 1, resource: { buffer: this.field } },
        { binding: 2, resource: { buffer: this.overlay } }
      ]
    });
  }
  /** @param {import("../core/field-format.js").Field} sourceField */
  uploadField(sourceField) {
    this.device.queue.writeBuffer(this.field, 0, sourceField);
    this.device.queue.writeBuffer(this.overlay, 0, new ArrayBuffer(this.cellCount * 4));
  }
  /**
   * Resets the ring indices so the whole pool reads as free. Must be paired
   * with the `init_pool` dispatch that refills the ring contents.
   *
   * @param {number} capacity
   */
  resetCounters(capacity) {
    const block = new ArrayBuffer(COUNTERS_BYTES);
    const words = new Uint32Array(block);
    words[counterIndex("head")] = 0;
    words[counterIndex("tail")] = capacity;
    this.device.queue.writeBuffer(this.counters, 0, block);
  }
  destroy() {
    this.particles?.destroy();
    this.states?.destroy();
    this.freeRing?.destroy();
    this.field.destroy();
    this.overlay.destroy();
    this.impulse.destroy();
    this.agents.destroy();
    this.counters.destroy();
    this.params.destroy();
    this.readback.destroy();
  }
};
var CounterReadback = class {
  /** @param {GPUDevice} device @param {number} byteLength */
  constructor(device, byteLength) {
    this.device = device;
    this.byteLength = byteLength;
    this.slots = Array.from({ length: READBACK_DEPTH }, () => ({
      buffer: device.createBuffer({ size: byteLength, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST }),
      busy: false
    }));
    this.latest = new Uint32Array(byteLength / 4);
  }
  /**
   * Queues a copy of `source` into a free slot.
   *
   * @param {GPUCommandEncoder} encoder
   * @param {GPUBuffer} source
   * @returns {{ buffer: GPUBuffer, busy: boolean }|null} the slot to map after submit
   */
  request(encoder, source) {
    const slot = this.slots.find((candidate) => !candidate.busy);
    if (!slot) return null;
    slot.busy = true;
    encoder.copyBufferToBuffer(source, 0, slot.buffer, 0, this.byteLength);
    return slot;
  }
  /**
   * Maps a slot previously handed out by {@link request}. Call after submit.
   *
   * @param {{ buffer: GPUBuffer, busy: boolean }|null} slot
   */
  collect(slot) {
    if (!slot) return;
    slot.buffer.mapAsync(GPUMapMode.READ).then(() => {
      this.latest = new Uint32Array(slot.buffer.getMappedRange().slice(0));
      slot.buffer.unmap();
      slot.busy = false;
    }).catch(() => {
      slot.busy = true;
    });
  }
  destroy() {
    for (const slot of this.slots) slot.buffer.destroy();
  }
};

// src/engine.js
var GroundTruthEngine = class _GroundTruthEngine {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {GPUDevice} device
   * @param {GPUCanvasContext} context
   * @param {ReturnType<typeof createPipelines>} pipelines
   * @param {import("./core/settings.js").Settings} settings
   */
  constructor(canvas2, device, context, pipelines, settings) {
    this.canvas = canvas2;
    this.device = device;
    this.context = context;
    this.pipelines = pipelines;
    this.settings = settings;
    this.frame = 0;
    this.paused = false;
    this.ready = false;
    this.onDeviceError = null;
    device.addEventListener("uncapturederror", (event) => {
      const error = (
        /** @type {GPUUncapturedErrorEvent} */
        event.error
      );
      this.#report(error.message);
    });
    device.lost.then((info) => {
      this.ready = false;
      this.#report(`The GPU device was lost: ${info.message || info.reason}`);
    });
    this.blast = { x: 0, y: 0, radius: 0, strength: 0 };
    this.drag = { x: 0, y: 0 };
    this.paramsData = new ArrayBuffer(PARAMS_BYTES);
    this.sourceField = null;
    this.resources = new SimulationResources(device, settings.world);
    this.settings.capacity = Math.min(settings.capacity, maxCapacityFor(device.limits));
    this.stats = decodeCounters(new Uint32Array(COUNTERS_BYTES / 4), this.settings.capacity);
    this.camera = createCamera(settings.world, this.viewport, {
      y: settings.world.height * 0.8,
      scale: 1
    });
    this.reportedError = null;
    this.maxWorkgroups = device.limits.maxComputeWorkgroupsPerDimension;
    this.maxCapacity = maxCapacityFor(device.limits);
  }
  /** @param {HTMLCanvasElement} canvas @returns {Promise<GroundTruthEngine>} */
  static async create(canvas2) {
    const { device, context, format } = await acquireDevice(canvas2);
    const pipelines = createPipelines(device, format);
    return new _GroundTruthEngine(canvas2, device, context, pipelines, defaultSettings());
  }
  /** @returns {{ width: number, height: number }} the drawing buffer, in device pixels */
  get viewport() {
    return { width: this.canvas.width, height: this.canvas.height };
  }
  /**
   * Adopts a freshly generated world and starts simulating it.
   *
   * @param {import("./core/field-format.js").Field} field
   */
  loadWorld(field) {
    const { width, height } = this.settings.world;
    if (field.length !== width * height) {
      throw new Error(`Expected a ${width} x ${height} world, got ${field.length} cells.`);
    }
    this.sourceField = field;
    this.ready = true;
    this.camera = clampCamera(this.camera, this.settings.world, this.viewport);
    this.reset();
  }
  /**
   * Restores the untouched world and rebuilds the pool.
   *
   * @param {number} [capacity]
   */
  reset(capacity = this.settings.capacity) {
    this.settings.capacity = Math.max(1, Math.min(this.maxCapacity, Math.round(capacity)));
    capacity = this.settings.capacity;
    this.frame = 0;
    this.blast = { x: 0, y: 0, radius: 0, strength: 0 };
    this.drag = { x: 0, y: 0 };
    this.resources.allocatePool(capacity, this.pipelines.computeLayout, this.pipelines.compositeLayout);
    if (this.sourceField) this.resources.uploadField(this.sourceField);
    this.resources.resetCounters(capacity);
    this.#writeParams();
    const encoder = this.device.createCommandEncoder({ label: "init-pool" });
    const pass = encoder.beginComputePass();
    pass.setPipeline(this.pipelines.initPool);
    pass.setBindGroup(0, this.#computeBindGroup());
    const init = dispatchGrid(this.resources.ringSize, this.maxWorkgroups);
    pass.dispatchWorkgroups(init.x, init.y);
    const cells = dispatchGrid(this.resources.cellCount, this.maxWorkgroups);
    pass.setPipeline(this.pipelines.clearImpulse);
    pass.dispatchWorkgroups(cells.x, cells.y);
    pass.end();
    this.device.queue.submit([encoder.finish()]);
    if (this.sourceField) this.populate();
    this.stats = decodeCounters(new Uint32Array(COUNTERS_BYTES / 4), capacity);
  }
  /** @param {number} threshold frames a pixel may sit still before settling */
  setRestThreshold(threshold) {
    this.settings.restThreshold = clampRestThreshold(threshold);
  }
  /** @param {number} chance per-frame probability that a diagonally-unsupported pixel lets go */
  setSlumpChance(chance) {
    this.settings.slumpChance = Math.min(1, Math.max(0, chance));
  }
  /**
   * Coefficient of restitution: the elasticity of every impact. At 1 no energy
   * leaves the system on collision and a disturbed pile trades it back and
   * forth indefinitely.
   *
   * @param {number} restitution
   */
  setRestitution(restitution) {
    this.settings.restitution = clampRestitution(restitution);
  }
  /**
   * Scatters lemmings across the surface of the world. They fall to whatever is
   * under them, so the exact drop height does not matter.
   *
   * @param {number} [count]
   */
  populate(count = this.settings.agents.count) {
    const { width, height } = this.settings.world;
    this.settings.agents.count = Math.max(0, Math.min(AGENT_CAPACITY, Math.round(count)));
    const data = new ArrayBuffer(Math.max(1, this.settings.agents.count) * AGENT_STRIDE_BYTES);
    const floats = new Float32Array(data);
    const words = new Uint32Array(data);
    const stride = AGENT_STRIDE_BYTES / 4;
    for (let i = 0; i < this.settings.agents.count; i += 1) {
      floats[i * stride] = (i + 0.5) / this.settings.agents.count * width;
      floats[i * stride + 1] = height * 0.95;
      words[i * stride + 4] = packAgent({
        alive: true,
        mode: MODE_WALK,
        facing: i % 2 === 0 ? 1 : -1,
        timer: timerFor(hashU32(i), 30, 150)
      });
    }
    this.device.queue.writeBuffer(this.resources.agents, 0, data);
  }
  /** @param {number} radius world pixels */
  setBrushRadius(radius) {
    this.settings.brushRadius = Math.max(1, radius);
  }
  /** Re-clamps the camera after the drawing buffer changes size. */
  resize() {
    this.camera = clampCamera(this.camera, this.settings.world, this.viewport);
  }
  /** @param {number} dx @param {number} dy device pixels */
  pan(dx, dy) {
    this.camera = panCamera(this.camera, dx, dy, this.settings.world, this.viewport);
  }
  /** @param {number} factor @param {number} screenX @param {number} screenY device pixels */
  zoomAt(factor, screenX, screenY) {
    this.camera = zoomCameraAt(this.camera, factor, screenX, screenY, this.settings.world, this.viewport);
  }
  /**
   * @param {number} screenX @param {number} screenY device pixels
   * @returns {{ x: number, y: number }} world coordinates
   */
  worldFromScreen(screenX, screenY) {
    return worldFromScreen(this.camera, this.viewport, screenX, screenY);
  }
  /**
   * Drags everything under the brush along `dx, dy` — the smudge.
   *
   * Gentler than a blast, and better behaved for a reason worth knowing: a
   * blast fires material radially, which inside a pocket means into the nearest
   * wall, where most of it is too well bonded to break. The debris reflects,
   * comes back inward, and mills about until the collapse buries it. A drag
   * sends material somewhere it can actually go.
   *
   * @param {number} x @param {number} y world coordinates
   * @param {number} dx @param {number} dy drag direction, any length
   */
  smudgeAt(x, y, dx, dy) {
    const length = Math.hypot(dx, dy);
    if (length < 1e-6) return;
    this.blast = { x, y, radius: this.settings.brushRadius, strength: this.settings.smudgeStrength };
    this.drag = { x: dx / length, y: dy / length };
  }
  /**
   * Blows a crater. Unlike every other rule in the simulation this one ignores
   * a cell's bond entirely, so it is the only thing that shifts bedrock.
   *
   * @param {number} x @param {number} y world coordinates
   */
  explodeAt(x, y) {
    this.blast = { x, y, radius: this.settings.brushRadius, strength: this.settings.blastStrength };
    this.drag = { x: 0, y: 0 };
  }
  /** Advances one frame and presents it. */
  step() {
    if (!this.ready) return;
    if (!this.paused) this.frame += 1;
    this.#writeParams();
    const encoder = this.device.createCommandEncoder({ label: `frame-${this.frame}` });
    const pool = dispatchGrid(this.settings.capacity, this.maxWorkgroups);
    const cells = dispatchGrid(this.resources.cellCount, this.maxWorkgroups);
    const compute = encoder.beginComputePass({ label: "simulate" });
    compute.setBindGroup(0, this.#computeBindGroup());
    if (!this.paused) {
      compute.setPipeline(this.pipelines.compute.prepare);
      compute.dispatchWorkgroups(1);
      compute.setPipeline(this.pipelines.compute.integrate);
      for (let substep = 0; substep < this.settings.substeps; substep += 1) {
        compute.dispatchWorkgroups(pool.x, pool.y);
      }
      compute.setPipeline(this.pipelines.compute.advance);
      compute.dispatchWorkgroups(pool.x, pool.y);
      compute.setPipeline(this.pipelines.compute.settle);
      compute.dispatchWorkgroups(pool.x, pool.y);
      const agents = dispatchGrid(this.settings.agents.count, this.maxWorkgroups);
      compute.setPipeline(this.pipelines.compute.step_agents);
      compute.dispatchWorkgroups(agents.x, agents.y);
      compute.setPipeline(this.pipelines.compute.emit);
      compute.dispatchWorkgroups(cells.x, cells.y);
      compute.setPipeline(this.pipelines.compute.splat);
      compute.dispatchWorkgroups(pool.x, pool.y);
      compute.setPipeline(this.pipelines.compute.draw_agents);
      compute.dispatchWorkgroups(agents.x, agents.y);
    }
    compute.end();
    const render = encoder.beginRenderPass({
      label: "composite",
      colorAttachments: [{
        view: this.context.getCurrentTexture().createView(),
        clearValue: { r: 0.016, g: 0.018, b: 0.026, a: 1 },
        loadOp: "clear",
        storeOp: "store"
      }]
    });
    render.setPipeline(this.pipelines.composite);
    render.setBindGroup(0, this.#compositeBindGroup());
    render.draw(3);
    render.end();
    const slot = this.resources.readback.request(encoder, this.resources.counters);
    this.device.queue.submit([encoder.finish()]);
    this.resources.readback.collect(slot);
    this.stats = decodeCounters(this.resources.readback.latest, this.settings.capacity);
    this.blast = { x: 0, y: 0, radius: 0, strength: 0 };
    this.drag = { x: 0, y: 0 };
  }
  /** @param {string} message */
  #report(message) {
    if (this.reportedError) return;
    this.reportedError = message;
    this.onDeviceError?.(message);
  }
  #computeBindGroup() {
    const group = this.resources.computeBindGroup;
    if (!group) throw new Error("The particle pool has not been allocated.");
    return group;
  }
  #compositeBindGroup() {
    const group = this.resources.compositeBindGroup;
    if (!group) throw new Error("The particle pool has not been allocated.");
    return group;
  }
  #writeParams() {
    const settings = this.settings;
    writeParams(this.paramsData, {
      world: settings.world,
      capacity: settings.capacity,
      ringMask: ringMask(settings.capacity),
      gravity: settings.gravity,
      dt: settings.frameSeconds / settings.substeps,
      damping: settings.damping,
      restitution: settings.restitution,
      restThreshold: settings.restThreshold,
      frame: this.frame,
      slumpChance: settings.slumpChance,
      slideSpeed: settings.slideSpeed,
      dislodgeSpeed: settings.dislodgeSpeed,
      blast: this.blast,
      viewport: this.viewport,
      camera: this.camera,
      rubbleBond: settings.rubbleBond,
      drag: this.drag,
      agents: settings.agents,
      frameSeconds: settings.frameSeconds,
      waterSpread: settings.waterSpread
    });
    this.device.queue.writeBuffer(this.resources.params, 0, this.paramsData);
  }
};

// smoke-entry.js
var say = (t) => fetch("/result", { method: "POST", body: t });
var canvas = document.querySelector("#world");
canvas.width = 900;
canvas.height = 506;
var wait = () => new Promise((r) => requestAnimationFrame(r));
var run = async (e, n) => {
  for (let i = 0; i < n; i += 1) {
    e.step();
    await wait();
  }
};
var capture = async (name) => fetch(`/shot/${name}`, { method: "POST", body: await new Promise((r) => canvas.toBlob(r, "image/png")) });
var lines = [];
try {
  const engine = await GroundTruthEngine.create(canvas);
  engine.onDeviceError = (m) => lines.push(`GPU ERROR: ${m.slice(0, 300)}`);
  const { width, height } = engine.settings.world;
  const BEDROCK = packCell(70, 70, 76, 0);
  const WATER = packCell(58, 132, 208, WATER_BOND);
  const SAND = packCell(206, 184, 126, 3);
  const world = new Uint32Array(new ArrayBuffer(width * height * 4));
  const at = (x, y) => y * width + x;
  const FLOOR = 100;
  const W = 90;
  const DEEP = 70;
  const WALL = 3;
  const tank = (x0, load) => {
    for (let y = FLOOR - WALL; y < FLOOR + DEEP + 40; y += 1) {
      for (let t = 1; t <= WALL; t += 1) {
        world[at(x0 - t, y)] = BEDROCK;
        world[at(x0 + W - 1 + t, y)] = BEDROCK;
      }
    }
    for (let t = 1; t <= WALL; t += 1) {
      for (let x = x0 - WALL; x < x0 + W + WALL; x += 1) world[at(x, FLOOR - t)] = BEDROCK;
    }
    for (let y = FLOOR; y < FLOOR + DEEP; y += 1) for (let x = x0; x < x0 + W; x += 1) world[at(x, y)] = WATER;
    load(x0, FLOOR + DEEP);
  };
  const SLAB = 600;
  tank(SLAB, (x0, surface) => {
    for (let y = surface; y < surface + 8; y += 1) for (let x = x0; x < x0 + W; x += 1) world[at(x, y)] = SAND;
  });
  const SCATTER = 900;
  tank(SCATTER, (x0, surface) => {
    for (let y = surface; y < surface + 24; y += 1) {
      for (let x = x0; x < x0 + W; x += 1) {
        if ((x * 7 + y * 13) % 10 < 3) world[at(x, y)] = SAND;
      }
    }
  });
  engine.reset(2e6);
  engine.loadWorld(world);
  const bytes = width * height * 4;
  const stage = engine.device.createBuffer({ size: bytes, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST });
  const readField = async () => {
    const enc = engine.device.createCommandEncoder();
    enc.copyBufferToBuffer(engine.resources.field, 0, stage, 0, bytes);
    engine.device.queue.submit([enc.finish()]);
    await stage.mapAsync(GPUMapMode.READ);
    const copy = new Uint32Array(stage.getMappedRange().slice(0));
    stage.unmap();
    return copy;
  };
  const census = (field, x0) => {
    let sand = 0;
    let sandY = 0;
    let water = 0;
    let waterY = 0;
    let inverted = 0;
    for (let y = FLOOR; y < FLOOR + DEEP + 40; y += 1) {
      for (let x = x0; x < x0 + W; x += 1) {
        const word = field[at(x, y)];
        if (!isOccupied(word)) continue;
        if (cellBond(word) === WATER_BOND) {
          water += 1;
          waterY += y;
          continue;
        }
        if (cellBond(word) === 0) continue;
        sand += 1;
        sandY += y;
        if (y > FLOOR && cellBond(field[at(x, y - 1)]) === WATER_BOND && isOccupied(field[at(x, y - 1)])) inverted += 1;
      }
    }
    return {
      sand,
      water,
      inverted,
      sandHeight: sand ? sandY / sand : 0,
      waterHeight: water ? waterY / water : 0
    };
  };
  const report = (label, field) => {
    for (const [name, x0] of [["slab", SLAB], ["scatter", SCATTER]]) {
      const c = census(field, x0);
      lines.push(`${label} ${name}: sand=${c.sand} at y=${c.sandHeight.toFixed(1)} water=${c.water} at y=${c.waterHeight.toFixed(1)} sand-on-water=${c.inverted}`);
    }
    return [census(field, SLAB), census(field, SCATTER)];
  };
  const before = report("start ", world);
  await run(engine, 600);
  const settled = await readField();
  const after = report("f600  ", settled);
  lines.push(`sank/f=${engine.stats.sank} moving=${engine.stats.moving}`);
  const view = engine.worldFromScreen(canvas.width / 2, canvas.height / 2);
  engine.pan((view.x - (SLAB + W + 100)) * engine.camera.scale, -(view.y - (FLOOR + DEEP / 2)) * engine.camera.scale);
  engine.zoomAt(2.2, canvas.width / 2, canvas.height / 2);
  await run(engine, 3);
  await capture("sink-tanks");
  before.forEach((start, i) => {
    const name = ["slab", "scatter"][i];
    const end = after[i];
    if (end.sand !== start.sand) lines.push(`PROBLEM: ${name} sand ${start.sand} -> ${end.sand}, not conserved`);
    if (end.water !== start.water) lines.push(`PROBLEM: ${name} water ${start.water} -> ${end.water}, not conserved`);
    if (end.sandHeight >= end.waterHeight) {
      lines.push(`PROBLEM: ${name} sand sits at ${end.sandHeight.toFixed(1)}, water at ${end.waterHeight.toFixed(1)}: it has not sunk`);
    }
  });
  const bad = lines.some((x) => x.includes("PROBLEM") || x.startsWith("GPU"));
  say(`DONE ${bad ? "PROBLEMS" : "OK"}
${lines.join("\n")}`);
} catch (error) {
  say(`DONE FATAL ${error && error.stack}
${lines.join("\n")}`);
}
