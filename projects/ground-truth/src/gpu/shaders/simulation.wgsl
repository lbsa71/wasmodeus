// Ground Truth — pixels move in and out of a static image.
//
// Frame order: prepare -> integrate -> settle -> emit -> splat -> composite.
// The free-slot ring is why the order matters: `settle` only ever pushes and
// `emit` only ever pops, so a slot can never be handed to two threads at once.

const OCCUPIED_BIT: u32 = 0x01000000u;
const DISLODGE_BIT: u32 = 0x80000000u;
const COLOR_MASK: u32   = 0x00ffffffu;
const SKY_CELL: u32     = 0xffffffffu;

const FLAG_ALIVE: u32   = 1u;
const FLAG_DEPOSIT: u32 = 2u;

const REASON_NONE: u32      = 0u;
const REASON_DISLODGE: u32  = 1u;
const REASON_UNDERMINE: u32 = 2u;
const REASON_INTAKE: u32    = 3u;
const REASON_BLAST: u32     = 4u;

const EDGE_EPSILON: f32 = 0.001;
const SKY_HEADROOM: f32 = 2.0;
// Upward kick given to a pixel that finds its cell taken, so it climbs out.
const ESCAPE_SPEED: f32 = 45.0;

struct Params {
  world: vec2u,
  capacity: u32,
  ring_mask: u32,
  gravity: f32,
  dt: f32,
  damping: f32,
  restitution: f32,
  rest_threshold: u32,
  frame: u32,
  intake_chance: f32,
  intake_rows: u32,
  fountain_x: f32,
  fountain_spread: f32,
  fountain_speed: f32,
  dislodge_speed: f32,
  blast: vec4f,
  viewport: vec2f,
};

struct Particle {
  pos: vec2f,
  vel: vec2f,
  color: u32,
  last_cell: u32,
  rest: u32,
  flags: u32,
};

struct Counters {
  head: atomic<u32>,
  tail: atomic<u32>,
  pop_budget: atomic<i32>,
  emitted: atomic<u32>,
  deposited: atomic<u32>,
  dislodged: atomic<u32>,
  undermined: atomic<u32>,
  denied: atomic<u32>,
};

@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var<storage, read_write> particles: array<Particle>;
@group(0) @binding(2) var<storage, read_write> field: array<atomic<u32>>;
@group(0) @binding(3) var<storage, read_write> overlay: array<atomic<u32>>;
@group(0) @binding(4) var<storage, read_write> free_ring: array<u32>;
@group(0) @binding(5) var<storage, read_write> counters: Counters;

fn hash_u32(value: u32) -> u32 {
  var x = value;
  x ^= x >> 16u;
  x *= 0x7feb352du;
  x ^= x >> 15u;
  x *= 0x846ca68bu;
  x ^= x >> 16u;
  return x;
}

fn rand01(seed: u32) -> f32 {
  return f32(hash_u32(seed) & 0x00ffffffu) / 16777216.0;
}

fn cell_index(x: i32, y: i32) -> u32 {
  return u32(y) * params.world.x + u32(x);
}

fn in_bounds(x: i32, y: i32) -> bool {
  return x >= 0 && y >= 0 && x < i32(params.world.x) && y < i32(params.world.y);
}

// Side walls and the floor are solid; the sky is open so a jet can overshoot.
fn blocked_at(x: i32, y: i32) -> bool {
  if (x < 0 || x >= i32(params.world.x)) { return true; }
  if (y < 0) { return true; }
  if (y >= i32(params.world.y)) { return false; }
  return atomicLoad(&field[cell_index(x, y)]) != 0u;
}

// Nothing writes `field` during `integrate`, so a load-then-or pair is safe.
fn mark_hit(x: i32, y: i32) {
  if (!in_bounds(x, y)) { return; }
  let c = cell_index(x, y);
  let value = atomicLoad(&field[c]);
  if (value == 0u || (value & DISLODGE_BIT) != 0u) { return; }
  atomicOr(&field[c], DISLODGE_BIT);
  atomicAdd(&counters.dislodged, 1u);
}

@compute @workgroup_size(1)
fn prepare() {
  // Snapshot the ring occupancy once so `emit` can pop against a fixed budget
  // instead of racing head past tail.
  let available = atomicLoad(&counters.tail) - atomicLoad(&counters.head);
  atomicStore(&counters.pop_budget, i32(available));
  atomicStore(&counters.emitted, 0u);
  atomicStore(&counters.deposited, 0u);
  atomicStore(&counters.dislodged, 0u);
  atomicStore(&counters.undermined, 0u);
  atomicStore(&counters.denied, 0u);
}

@compute @workgroup_size(256)
fn integrate(@builtin(global_invocation_id) gid: vec3u) {
  let i = gid.x;
  if (i >= params.capacity) { return; }
  var p = particles[i];
  if ((p.flags & FLAG_ALIVE) == 0u) { return; }

  var v = p.vel;
  v.y -= params.gravity * params.dt;
  v *= params.damping;

  let hard = length(v) >= params.dislodge_speed;
  var pos = p.pos;

  let next_x = pos.x + v.x * params.dt;
  if (blocked_at(i32(floor(next_x)), i32(floor(pos.y)))) {
    if (hard) { mark_hit(i32(floor(next_x)), i32(floor(pos.y))); }
    v.x = -v.x * params.restitution;
  } else {
    pos.x = next_x;
  }

  let next_y = pos.y + v.y * params.dt;
  if (blocked_at(i32(floor(pos.x)), i32(floor(next_y)))) {
    if (hard) { mark_hit(i32(floor(pos.x)), i32(floor(next_y))); }
    v.y = -v.y * params.restitution;
  } else {
    pos.y = next_y;
  }

  pos.x = clamp(pos.x, 0.0, f32(params.world.x) - EDGE_EPSILON);
  pos.y = clamp(pos.y, 0.0, f32(params.world.y) * SKY_HEADROOM);

  p.pos = pos;
  p.vel = v;
  particles[i] = p;
}

// Rest bookkeeping runs once per rendered frame, after every physics substep,
// so `rest_threshold` stays denominated in frames however finely the
// integrator is stepped.
@compute @workgroup_size(256)
fn advance(@builtin(global_invocation_id) gid: vec3u) {
  let i = gid.x;
  if (i >= params.capacity) { return; }
  var p = particles[i];
  if ((p.flags & FLAG_ALIVE) == 0u) { return; }

  // Rest is measured in cells, not speed: a pixel that has not changed cell
  // for `rest_threshold` frames is considered part of the image again.
  var cell = SKY_CELL;
  if (p.pos.y < f32(params.world.y)) {
    cell = cell_index(i32(floor(p.pos.x)), i32(floor(p.pos.y)));
  }
  if (cell != SKY_CELL && cell == p.last_cell) {
    p.rest += 1u;
  } else {
    p.rest = 0u;
    p.last_cell = cell;
  }
  if (p.rest >= params.rest_threshold) { p.flags |= FLAG_DEPOSIT; }
  particles[i] = p;
}

@compute @workgroup_size(256)
fn settle(@builtin(global_invocation_id) gid: vec3u) {
  let i = gid.x;
  if (i >= params.capacity) { return; }
  var p = particles[i];
  if ((p.flags & (FLAG_ALIVE | FLAG_DEPOSIT)) != (FLAG_ALIVE | FLAG_DEPOSIT)) { return; }
  p.flags &= ~FLAG_DEPOSIT;
  if (p.last_cell == SKY_CELL) {
    p.rest = 0u;
    particles[i] = p;
    return;
  }

  let claimed = atomicCompareExchangeWeak(&field[p.last_cell], 0u, (p.color & COLOR_MASK) | OCCUPIED_BIT);
  if (claimed.exchanged) {
    p.flags = 0u;
    particles[i] = p;
    // Push only — `emit` is the only pass that pops, and it runs after this.
    let slot = atomicAdd(&counters.tail, 1u);
    free_ring[slot & params.ring_mask] = i;
    atomicAdd(&counters.deposited, 1u);
  } else {
    // Another pixel claimed the cell first. Push this one clear rather than
    // letting it retry in place: a pixel stuck inside occupied material would
    // never deposit and never return its slot to the ring.
    p.rest = 0u;
    p.vel = vec2f((rand01(i ^ params.frame) - 0.5) * 20.0, ESCAPE_SPEED);
    particles[i] = p;
  }
}

@compute @workgroup_size(256)
fn emit(@builtin(global_invocation_id) gid: vec3u) {
  let c = gid.x;
  if (c >= params.world.x * params.world.y) { return; }
  // The overlay is cleared here so the splat pass has a blank slate and the
  // grid is only walked once per frame.
  atomicStore(&overlay[c], 0u);

  let value = atomicLoad(&field[c]);
  if (value == 0u) { return; }

  let x = i32(c % params.world.x);
  let y = i32(c / params.world.x);
  let centre = vec2f(f32(x) + 0.5, f32(y) + 0.5);
  let offset = centre - params.blast.xy;

  var reason = REASON_NONE;
  if ((value & DISLODGE_BIT) != 0u) {
    reason = REASON_DISLODGE;
  } else if (y > 0 && atomicLoad(&field[c - params.world.x]) == 0u) {
    // Nothing underneath: the image cannot hold this pixel up any longer.
    reason = REASON_UNDERMINE;
  } else if (y < i32(params.intake_rows) && rand01(c ^ hash_u32(params.frame)) < params.intake_chance) {
    reason = REASON_INTAKE;
  } else if (params.blast.z > 0.0 && dot(offset, offset) < params.blast.z * params.blast.z) {
    reason = REASON_BLAST;
  }
  if (reason == REASON_NONE) { return; }

  let budget = atomicSub(&counters.pop_budget, 1);
  if (budget <= 0) {
    // The pool is full. Drop the dislodge mark so the cell is reconsidered
    // next frame rather than staying flagged forever.
    atomicStore(&field[c], value & ~DISLODGE_BIT);
    atomicAdd(&counters.denied, 1u);
    return;
  }
  let slot = free_ring[atomicAdd(&counters.head, 1u) & params.ring_mask];
  atomicStore(&field[c], 0u);

  let seed = hash_u32(c * 2654435761u + params.frame * 40503u);
  var pos = centre;
  var vel = vec2f(0.0, -0.5);
  if (reason == REASON_INTAKE) {
    // Taken from the bottom of the world and relaunched from the nozzle.
    let angle = (rand01(seed ^ 0x1234u) - 0.5) * 0.55;
    let speed = params.fountain_speed * (0.7 + 0.6 * rand01(seed ^ 0xabcdu));
    pos = vec2f(
      params.fountain_x + (rand01(seed) - 0.5) * params.fountain_spread,
      1.0 + rand01(seed ^ 0x9e37u) * 2.0
    );
    vel = vec2f(sin(angle) * speed, cos(angle) * speed);
  } else if (reason == REASON_BLAST) {
    let distance = max(length(offset), EDGE_EPSILON);
    vel = (offset / distance) * params.blast.w * (1.0 - distance / params.blast.z);
    atomicAdd(&counters.dislodged, 1u);
  } else if (reason == REASON_UNDERMINE) {
    atomicAdd(&counters.undermined, 1u);
  }

  particles[slot] = Particle(pos, vel, value & COLOR_MASK, SKY_CELL, 0u, FLAG_ALIVE);
  atomicAdd(&counters.emitted, 1u);
}

@compute @workgroup_size(256)
fn splat(@builtin(global_invocation_id) gid: vec3u) {
  let i = gid.x;
  if (i >= params.capacity) { return; }
  let p = particles[i];
  if ((p.flags & FLAG_ALIVE) == 0u) { return; }
  let x = i32(floor(p.pos.x));
  let y = i32(floor(p.pos.y));
  if (!in_bounds(x, y)) { return; }
  atomicMax(&overlay[cell_index(x, y)], (p.color & COLOR_MASK) | OCCUPIED_BIT);
}

// Rebuilds the pool in place. Run over `ring_mask + 1` invocations; the CPU
// resets head/tail alongside it, so no slot is ever live twice.
@compute @workgroup_size(256)
fn init_pool(@builtin(global_invocation_id) gid: vec3u) {
  let i = gid.x;
  if (i > params.ring_mask) { return; }
  free_ring[i] = i;
  if (i < params.capacity) {
    particles[i] = Particle(vec2f(0.0, 0.0), vec2f(0.0, 0.0), 0u, SKY_CELL, 0u, 0u);
  }
}
