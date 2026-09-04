// Ground Truth — pixels move in and out of a static world.
//
// Frame order: prepare -> integrate xN -> advance -> settle -> emit -> splat.
// The free-slot ring is why the order matters: `settle` only ever pushes and
// `emit` only ever pops, so a slot can never be handed to two threads at once.

const OCCUPIED_BIT: u32  = 0x01000000u;
const DISLODGE_BIT: u32  = 0x80000000u;
const COLOR_MASK: u32    = 0x00ffffffu;
const MATERIAL_MASK: u32 = 0x1effffffu;
const BOND_SHIFT: u32    = 25u;
const BOND_MASK: u32     = 0x1e000000u;
const SKY_CELL: u32      = 0xffffffffu;

// A live pixel's state word is a field word with ALIVE where OCCUPIED sits, so
// colour and bond stay in the same bits and depositing needs no repacking.
const STATE_ALIVE_BIT: u32  = 0x01000000u;
const STATE_REST_SHIFT: u32 = 29u;
const STATE_REST_MASK: u32  = 0xe0000000u;
const MAX_REST: u32         = 7u;

const REASON_NONE: u32      = 0u;
const REASON_DISLODGE: u32  = 1u;
const REASON_UNDERMINE: u32 = 2u;
const REASON_SLUMP: u32     = 3u;
const REASON_BLAST: u32     = 4u;

// How the three cells beneath a pixel hold it up. See `src/core/sand.js`.
const SUPPORT_FIRM: i32  = 0;
const SUPPORT_FALL: i32  = 1;
const SUPPORT_SLUMP: i32 = 2;

const EDGE_EPSILON: f32 = 0.001;
const SKY_HEADROOM: f32 = 2.0;
// How far out a pixel whose cell was taken may look for somewhere to land.
// Generous on purpose: a pixel the collapse built over is normally a few cells
// from the crater it came out of, and searching radially keeps its matter where
// it belongs. The search stops at the first free cell, so the usual cost is a
// ring or two — only the genuinely entombed pay for the rest.
const RESCUE_RINGS: i32 = 3;
// Furthest a buried pixel will ever look for somewhere to land.
const MAX_PROBE_RING: i32 = 32;
// Most cells a pixel may cross in one substep. Bounds the sweep, and caps how
// far anything can travel before it must stop and look where it is going.
const MAX_SWEEP_STEPS: u32 = 8u;
// How much harder a cell is to shift for each neighbour it has beyond its
// bond. At 1.0 even a pile surface needs a two-hundred-cell fall to splash;
// this leaves ordinary settling harmless while a real drop still bites.
const IMPACT_RESISTANCE: f32 = 0.6;
// Support a cell may have beyond its bond and still be draggable by the smudge.
// Sand buried in a heap sits at about three; stone in a wall is far higher, so
// the brush scrapes its surface instead of boring through it.
const SMUDGE_REACH: i32 = 3;
// Fraction of blast speed still given to debris at the very rim.
const BLAST_RIM: f32 = 0.25;
// Must match WORKGROUP_SIZE in src/core/layout.js.
const WORKGROUP_SIZE: u32 = 256u;

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
  slump_chance: f32,
  slide_speed: f32,
  dislodge_speed: f32,
  blast: vec4f,
  viewport: vec2f,
  camera_origin: vec2f,
  camera_scale: f32,
  rubble_bond: u32,
  // Which way the pointer is being dragged, or zero for a radial blast. The
  // brush position, radius and strength live in `blast`.
  brush_drag: vec2f,
};

// Scalars, not vec2f: a vec2f would align this to eight bytes and pad it to 24.
// See PARTICLE_STRIDE_BYTES in src/core/layout.js.
struct Particle {
  pos_x: f32,
  pos_y: f32,
  vel_x: f32,
  vel_y: f32,
  last_cell: u32,
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
  crowded: atomic<u32>,
  stuck: atomic<u32>,
};

@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var<storage, read_write> particles: array<Particle>;
@group(0) @binding(2) var<storage, read_write> field: array<atomic<u32>>;
@group(0) @binding(3) var<storage, read_write> overlay: array<atomic<u32>>;
@group(0) @binding(4) var<storage, read_write> free_ring: array<u32>;
@group(0) @binding(5) var<storage, read_write> counters: Counters;
@group(0) @binding(6) var<storage, read_write> states: array<u32>;
// Momentum handed to a cell by whatever struck it, waiting for `emit` to launch
// it with. Two f16 packed into a word; non-zero only while DISLODGE_BIT is set.
@group(0) @binding(7) var<storage, read_write> impulse: array<atomic<u32>>;

// A dispatch wider than 65535 workgroups is illegal, so large grids are folded
// into two dimensions and unfolded here. See `dispatchGrid` in core/layout.js.
fn linear_index(gid: vec3u, groups: vec3u) -> u32 {
  return gid.x + gid.y * groups.x * WORKGROUP_SIZE;
}

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

fn rest_of(state: u32) -> u32 {
  return (state & STATE_REST_MASK) >> STATE_REST_SHIFT;
}

fn with_rest(state: u32, rest: u32) -> u32 {
  return (state & ~STATE_REST_MASK) | (min(rest, MAX_REST) << STATE_REST_SHIFT);
}

fn bond_of(word: u32) -> u32 {
  return (word & BOND_MASK) >> BOND_SHIFT;
}

// Side walls and the floor are solid; the sky is open so debris can fly.
fn blocked_at(x: i32, y: i32) -> bool {
  if (x < 0 || x >= i32(params.world.x)) { return true; }
  if (y < 0) { return true; }
  if (y >= i32(params.world.y)) { return false; }
  return atomicLoad(&field[cell_index(x, y)]) != 0u;
}

// The sand rule's view of a neighbour: nowhere outside the world counts as
// somewhere a pixel could fall into.
fn open_at(x: i32, y: i32) -> bool {
  if (x < 0 || x >= i32(params.world.x) || y < 0) { return false; }
  if (y >= i32(params.world.y)) { return true; }
  return atomicLoad(&field[cell_index(x, y)]) == 0u;
}

fn solid_at(x: i32, y: i32) -> u32 {
  if (blocked_at(x, y)) { return 1u; }
  return 0u;
}

// Whether a cell's neighbours are enough to hold it. Outside the world counts
// as solid, so the floor and walls hold material in instead of letting the
// edges of the world quietly drain away.
//
// The four orthogonal neighbours come first and the diagonals are only paid for
// when they might change the answer: most of a solid world is interior rock
// whose bond the orthogonals already satisfy, and that is four loads per cell
// per frame saved across twenty million of them.
fn support_count(x: i32, y: i32) -> u32 {
  return solid_at(x - 1, y) + solid_at(x + 1, y) + solid_at(x, y - 1) + solid_at(x, y + 1)
    + solid_at(x - 1, y - 1) + solid_at(x + 1, y - 1)
    + solid_at(x - 1, y + 1) + solid_at(x + 1, y + 1);
}

fn is_held(x: i32, y: i32, bond: u32) -> bool {
  if (bond == 0u) { return true; }
  let orthogonal = solid_at(x - 1, y) + solid_at(x + 1, y) + solid_at(x, y - 1) + solid_at(x, y + 1);
  if (orthogonal >= bond) { return true; }
  let diagonal = solid_at(x - 1, y - 1) + solid_at(x + 1, y - 1)
    + solid_at(x - 1, y + 1) + solid_at(x + 1, y + 1);
  return orthogonal + diagonal >= bond;
}

// Whether the smudge brush can take this cell. Bedrock never. Otherwise only
// what the brush can actually reach: a cell with little support to spare, which
// means a surface, or something bonded loosely enough to drag out of a heap.
//
// Sand comes away readily — buried grains have barely more support than their
// bond asks for — while stone only gives up its surface, and erodes as the drag
// exposes more of it. That difference is the whole feel of the tool.
fn smudgeable(x: i32, y: i32, bond: u32) -> bool {
  if (bond == 0u) { return false; }
  return i32(support_count(x, y)) - i32(bond) <= SMUDGE_REACH;
}

// Ties are broken by the seed, or every heap in the world would lean the same
// way.
fn choose_direction(left: bool, right: bool, seed: u32) -> i32 {
  if (left && right) {
    if (rand01(seed) < 0.5) { return -1; }
    return 1;
  }
  if (left) { return -1; }
  if (right) { return 1; }
  return 0;
}

// Which way a released pixel goes. Held up by three cells, not one: nothing
// below and it drops; solid below but an open diagonal and it slumps into the
// gap, which is the difference between a heap and a stack of columns.
fn support_at(x: i32, y: i32, seed: u32) -> vec2i {
  if (open_at(x, y - 1)) { return vec2i(SUPPORT_FALL, 0); }
  let left = open_at(x - 1, y - 1);
  let right = open_at(x + 1, y - 1);
  if (!left && !right) { return vec2i(SUPPORT_FIRM, 0); }
  return vec2i(SUPPORT_SLUMP, choose_direction(left, right, seed));
}

// Claims one cell for a settling pixel, if it happens to be empty.
fn deposit_into(x: i32, y: i32, value: u32) -> bool {
  if (!in_bounds(x, y)) { return false; }
  return atomicCompareExchangeWeak(&field[cell_index(x, y)], 0u, value).exchanged;
}

// Finds somewhere for a pixel whose own cell was taken. Rings outward from the
// cell it is standing in, nearest first and downhill before uphill, so the
// result is a one- or two-cell jostle rather than a jump. `bias` mirrors the
// horizontal search so a jammed crowd does not all shuffle the same way.
fn scan_ring(x: i32, y: i32, bias: i32, value: u32, ring: i32) -> bool {
  for (var dy = -ring; dy <= ring; dy += 1) {
    for (var dx = -ring; dx <= ring; dx += 1) {
      if (max(abs(dx), abs(dy)) != ring) { continue; }
      if (deposit_into(x + dx * bias, y + dy, value)) { return true; }
    }
  }
  return false;
}

// Looks for somewhere to put a pixel whose own cell was taken.
//
// The near rings are searched every frame, which catches the ordinary case of
// losing a race in a crowd. Beyond them the whole disc is far too much work to
// repeat every frame for every buried pixel, so one further ring is probed per
// frame and the ring advances — a pixel with nothing close sweeps steadily
// outward instead, and reaches the edge of a filled crater within a second.
//
// Searching radially matters as much as searching far. Marching a buried pixel
// to the surface finds space too, but a pixel built over just inside a crater
// wall has open space two cells sideways and a quarter of a screen of rock
// above it: it would surface hundreds of cells from where its matter belonged,
// and the ground would appear to grow from underneath.
fn rescue_deposit(x: i32, y: i32, bias: i32, value: u32, probe: i32) -> bool {
  for (var ring = 1; ring <= RESCUE_RINGS; ring += 1) {
    if (scan_ring(x, y, bias, value, ring)) { return true; }
  }
  return scan_ring(x, y, bias, value, probe);
}

// Bouncing off something that will not move. See `src/core/collision.js`.
fn reflect_axis(velocity: f32) -> f32 {
  return -velocity * params.restitution;
}

// An equal-mass collision: what the striker keeps, and what the target takes.
// The two always sum to the incoming velocity, so momentum is handed over
// rather than destroyed. Below a restitution of one the pair carries less
// energy than arrived, which is what stops a disturbed pile bouncing for ever.
fn striker_share(velocity: f32) -> f32 {
  return velocity * (1.0 - params.restitution) * 0.5;
}

fn target_share(velocity: f32) -> f32 {
  return velocity * (1.0 + params.restitution) * 0.5;
}

// A moving pixel strikes a cell and hands it momentum. Returns whether the cell
// took it: bedrock, walls, empty space and anything too well buried do not, and
// the striker reflects off those instead of sharing with them.
//
// Resistance scales with how much support a cell has beyond what its bond asks
// for. Without that term every pixel that lands hard enough knocks the floor out
// from under itself, each release drives the next one down, and a single impact
// liquefies the pile in a chain reaction that never settles. Surface material
// splashes; buried material does not notice.
fn strike(x: i32, y: i32, speed: f32, momentum: vec2f) -> bool {
  if (!in_bounds(x, y)) { return false; }
  let c = cell_index(x, y);
  let value = atomicLoad(&field[c]);
  if (value == 0u) { return false; }
  let bond = bond_of(value);
  if (bond == 0u) { return false; }
  // Already committed to moving. Later strikers bounce off it, they do not pile
  // more momentum onto the same grain.
  if ((value & DISLODGE_BIT) != 0u) { return false; }
  let surplus = f32(max(0, i32(support_count(x, y)) - i32(bond)));
  if (speed < params.dislodge_speed * (1.0 + surplus * IMPACT_RESISTANCE)) { return false; }
  // Atomic test-and-set, so exactly one striker per frame gets to move this
  // cell. Accumulating instead — every striker adding its share — launches one
  // grain at a speed no single pixel ever had, and past the range of an f16 it
  // becomes an infinity that turns the cell index to garbage. That was the
  // source of the explosions that appeared out of nowhere.
  let previous = atomicOr(&field[c], DISLODGE_BIT);
  if ((previous & DISLODGE_BIT) != 0u) { return false; }
  atomicAdd(&counters.dislodged, 1u);
  atomicStore(&impulse[c], pack2x16float(momentum));
  return true;
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
  atomicStore(&counters.crowded, 0u);
  atomicStore(&counters.stuck, 0u);
}

@compute @workgroup_size(256)
fn integrate(@builtin(global_invocation_id) gid: vec3u, @builtin(num_workgroups) groups: vec3u) {
  let i = linear_index(gid, groups);
  if (i >= params.capacity) { return; }
  // Four bytes decide whether the other twenty are worth reading.
  if ((states[i] & STATE_ALIVE_BIT) == 0u) { return; }
  var p = particles[i];

  var v = vec2f(p.vel_x, p.vel_y);
  v.y -= params.gravity * params.dt;
  v *= params.damping;

  let falling = v.y <= 0.0;
  var pos = vec2f(p.pos_x, p.pos_y);

  // Walk the step a cell at a time rather than testing only where the pixel
  // would land. Testing the destination alone lets a fast one jump clean over
  // whatever lies between — six cells a substep at blast speed — so pixels pass
  // straight through other pixels, end up under floors, and pile up from below.
  // Nothing may ever be skipped over.
  var travel = v * params.dt;
  let span = max(abs(travel.x), abs(travel.y));
  // Cap the distance so no single step can span more than one cell even at the
  // step limit; a pixel faster than that simply covers less ground this substep.
  if (span > f32(MAX_SWEEP_STEPS)) { travel *= f32(MAX_SWEEP_STEPS) / span; }
  let steps = max(1u, u32(ceil(min(span, f32(MAX_SWEEP_STEPS)))));
  let stride = travel / f32(steps);

  var landed = false;
  for (var step = 0u; step < steps; step += 1u) {
    let speed = length(v);
    // Cheap pre-gate; `strike` applies the real, support-scaled threshold.
    let hard = speed >= params.dislodge_speed;
    // The cell a pixel is already standing in never blocks it. A pixel can be
    // built over — a neighbour deposits into the very cell it is waiting in —
    // and without this exemption the destination of a short step is that same,
    // now-solid, cell and it would be welded in place by its own position.
    let home_x = i32(floor(pos.x));
    let home_y = i32(floor(pos.y));
    var hit = false;

    let next_x = pos.x + stride.x;
    let step_x = i32(floor(next_x));
    if (step_x != home_x && blocked_at(step_x, home_y)) {
      var absorbed = false;
      if (hard) { absorbed = strike(step_x, home_y, speed, vec2f(target_share(v.x), 0.0)); }
      // Knocked something loose: equal masses, so the striker slows. Hit
      // something immovable: it reflects.
      if (absorbed) { v.x = striker_share(v.x); } else { v.x = reflect_axis(v.x); }
      hit = true;
    } else {
      pos.x = next_x;
    }

    let next_y = pos.y + stride.y;
    let step_y = i32(floor(next_y));
    let column = i32(floor(pos.x));
    if ((step_y != home_y || column != home_x) && blocked_at(column, step_y)) {
      var absorbed = false;
      if (hard) { absorbed = strike(column, step_y, speed, vec2f(0.0, target_share(v.y))); }
      if (absorbed) { v.y = striker_share(v.y); } else { v.y = reflect_axis(v.y); }
      landed = true;
      hit = true;
    } else {
      pos.y = next_y;
    }

    // The velocity has changed, so the rest of this stride points the wrong
    // way. Stop at the contact and let the next substep use the new one.
    if (hit) { break; }
  }

  // A pixel that has come to rest on a slope rolls off it rather than stacking
  // into a needle. Only a pixel not already moving sideways faster is
  // redirected, so blast debris keeps its momentum.
  if (landed && falling && abs(v.x) < params.slide_speed) {
    let ix = i32(floor(pos.x));
    let iy = i32(floor(pos.y));
    if (!open_at(ix, iy - 1)) {
      let direction = choose_direction(open_at(ix - 1, iy - 1), open_at(ix + 1, iy - 1), i ^ params.frame);
      if (direction != 0) { v.x = f32(direction) * params.slide_speed; }
    }
  }

  pos.x = clamp(pos.x, 0.0, f32(params.world.x) - EDGE_EPSILON);
  pos.y = clamp(pos.y, 0.0, f32(params.world.y) * SKY_HEADROOM);

  p.pos_x = pos.x;
  p.pos_y = pos.y;
  p.vel_x = v.x;
  p.vel_y = v.y;
  particles[i] = p;
}

// Rest bookkeeping runs once per rendered frame, after every physics substep,
// so `rest_threshold` stays denominated in frames however finely the
// integrator is stepped.
@compute @workgroup_size(256)
fn advance(@builtin(global_invocation_id) gid: vec3u, @builtin(num_workgroups) groups: vec3u) {
  let i = linear_index(gid, groups);
  if (i >= params.capacity) { return; }
  let state = states[i];
  if ((state & STATE_ALIVE_BIT) == 0u) { return; }
  var p = particles[i];

  // Rest is measured in cells, not speed: a pixel that has not changed cell
  // for `rest_threshold` frames is considered part of the world again.
  var cell = SKY_CELL;
  if (p.pos_y < f32(params.world.y)) {
    cell = cell_index(i32(floor(p.pos_x)), i32(floor(p.pos_y)));
  }
  if (cell != SKY_CELL && cell == p.last_cell) {
    states[i] = with_rest(state, rest_of(state) + 1u);
  } else {
    states[i] = with_rest(state, 0u);
    p.last_cell = cell;
    particles[i] = p;
  }
}

@compute @workgroup_size(256)
fn settle(@builtin(global_invocation_id) gid: vec3u, @builtin(num_workgroups) groups: vec3u) {
  let i = linear_index(gid, groups);
  if (i >= params.capacity) { return; }
  let state = states[i];
  if ((state & STATE_ALIVE_BIT) == 0u) { return; }
  if (rest_of(state) < params.rest_threshold) { return; }
  var p = particles[i];
  if (p.last_cell == SKY_CELL) {
    states[i] = with_rest(state, 0u);
    return;
  }

  // Anything that has been airborne comes back down as rubble: blasted stone
  // does not re-freeze into cliff face that holds a ceiling up again.
  let deposit = ((state & MATERIAL_MASK) & ~BOND_MASK)
    | (params.rubble_bond << BOND_SHIFT)
    | OCCUPIED_BIT;
  let claimed = atomicCompareExchangeWeak(&field[p.last_cell], 0u, deposit);
  if (claimed.exchanged) {
    states[i] = 0u;
    // Push only — `emit` is the only pass that pops, and it runs after this.
    let slot = atomicAdd(&counters.tail, 1u);
    free_ring[slot & params.ring_mask] = i;
    atomicAdd(&counters.deposited, 1u);
  } else {
    // Lost the race. Nothing stops two pixels sharing a cell — positions are
    // floats — so when one wins the deposit the other is left standing inside
    // solid material, and in a collapsing pile that happens tens of thousands
    // of times a frame.
    //
    // Hand it to the nearest empty neighbour: a one-cell jostle is what a
    // crowded pile actually does. The previous answer, launching it upward with
    // collision switched off so it could climb out, is what put pixels on
    // screen rising through solid rock — and sinking back down through it once
    // gravity turned them round.
    atomicAdd(&counters.crowded, 1u);
    let x = i32(p.last_cell % params.world.x);
    let y = i32(p.last_cell / params.world.x);
    let bias = select(-1, 1, rand01(i ^ params.frame) < 0.5);
    // One further ring each frame, advancing, so a pixel with no space close by
    // sweeps outward over about half a second rather than searching the whole
    // disc every frame for every buried pixel.
    let probe = RESCUE_RINGS + 1 + i32((params.frame + i) % u32(MAX_PROBE_RING - RESCUE_RINGS));
    if (rescue_deposit(x, y, bias, deposit, probe)) {
      states[i] = 0u;
      let slot = atomicAdd(&counters.tail, 1u);
      free_ring[slot & params.ring_mask] = i;
      atomicAdd(&counters.deposited, 1u);
      return;
    }
    // Buried with no free cell within reach. It waits here and tries again next
    // frame; a pile is dynamic and space usually opens within a frame or two.
    //
    // It must not travel. Marching it up to the surface a cell a frame — the
    // previous answer — conserves matter but relocates it hundreds of cells: a
    // pixel built over just inside a crater wall has open space two cells
    // sideways and a quarter of a screen of solid rock above it. It would climb
    // all of that and surface far from where its matter belonged, which is why
    // the ground appeared to grow from underneath and to gain material.
    atomicAdd(&counters.stuck, 1u);
    states[i] = with_rest(state, 0u);
    p.vel_x = 0.0;
    p.vel_y = 0.0;
    particles[i] = p;
  }
}

@compute @workgroup_size(256)
fn emit(@builtin(global_invocation_id) gid: vec3u, @builtin(num_workgroups) groups: vec3u) {
  let c = linear_index(gid, groups);
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
  let seed = hash_u32(c * 2654435761u + params.frame * 40503u);
  let smudging = dot(params.brush_drag, params.brush_drag) > 0.0;

  var reason = REASON_NONE;
  var direction = 0;
  if ((value & DISLODGE_BIT) != 0u) {
    reason = REASON_DISLODGE;
  } else if (params.blast.z > 0.0 && dot(offset, offset) < params.blast.z * params.blast.z
      && (!smudging || smudgeable(x, y, bond_of(value)))) {
    // The pointer brush. An explosion breaks anything, however well bonded. A
    // smudge only takes what it can reach: material at a surface, and material
    // loosely enough bonded to drag out of a heap. Releasing everything under
    // the brush instead — which is what this did first — liquefies solid rock
    // for as long as the pointer is held down, far faster than any of it can
    // settle, and buries an order of magnitude more than a blast does.
    reason = REASON_BLAST;
  } else if (!is_held(x, y, bond_of(value))) {
    // Its neighbours are no longer enough to hold it. Which way it goes is the
    // three-cell test; whether it goes at all was the bond.
    let support = support_at(x, y, seed);
    if (support.x == SUPPORT_FALL) {
      reason = REASON_UNDERMINE;
    } else if (support.x == SUPPORT_SLUMP && rand01(seed ^ 0x5bd1u) < params.slump_chance) {
      reason = REASON_SLUMP;
      direction = support.y;
    }
  }
  if (reason == REASON_NONE) { return; }

  let budget = atomicSub(&counters.pop_budget, 1);
  if (budget <= 0) {
    // The pool is full. Drop the dislodge mark so the cell is reconsidered
    // next frame rather than staying flagged forever, and drop the momentum
    // with it so a cell struck repeatedly under starvation cannot bank an
    // arbitrarily large launch.
    atomicStore(&field[c], value & ~DISLODGE_BIT);
    atomicStore(&impulse[c], 0u);
    atomicAdd(&counters.denied, 1u);
    return;
  }
  let slot = free_ring[atomicAdd(&counters.head, 1u) & params.ring_mask];
  atomicStore(&field[c], 0u);

  var vel = vec2f(0.0, -0.5);
  if (reason == REASON_DISLODGE) {
    // Leave with the momentum whatever hit this cell handed over, so an impact
    // splashes in the direction it came from instead of dropping limply.
    vel = unpack2x16float(atomicExchange(&impulse[c], 0u));
  } else if (reason == REASON_BLAST) {
    let distance = max(length(offset), EDGE_EPSILON);
    let falloff = 1.0 - distance / params.blast.z;
    if (smudging) {
      // Carried the way the pointer went, with a soft edge so the brush drags a
      // smear of material rather than cutting a disc out of the world.
      //
      // This is the difference between a smudge and a blast, and it is not
      // merely that it is gentler. A blast fires everything radially, which
      // inside a pocket means into the crater wall a few cells away, where most
      // of it is far too well bonded to break. The debris reflects, comes
      // straight back inward, and mills about in a closed space until the
      // collapse buries it. A drag sends material somewhere it can actually go.
      vel = params.brush_drag * params.blast.w
        * (0.35 + 0.65 * falloff)
        * (0.7 + 0.6 * rand01(seed ^ 0x9e37u));
    } else {
      // The falloff keeps a floor: at the rim a linear taper reaches zero, and
      // debris that does not move is still sitting there when the crater
      // collapses back in on top of it.
      vel = (offset / distance) * params.blast.w
        * (BLAST_RIM + (1.0 - BLAST_RIM) * falloff)
        * (0.6 + 0.8 * rand01(seed ^ 0x9e37u));
    }
    atomicAdd(&counters.dislodged, 1u);
  } else if (reason == REASON_SLUMP) {
    vel = vec2f(f32(direction) * params.slide_speed, -0.5);
    atomicAdd(&counters.undermined, 1u);
  } else if (reason == REASON_UNDERMINE) {
    atomicAdd(&counters.undermined, 1u);
  }

  particles[slot] = Particle(centre.x, centre.y, vel.x, vel.y, SKY_CELL);
  states[slot] = (value & MATERIAL_MASK) | STATE_ALIVE_BIT;
  atomicAdd(&counters.emitted, 1u);
}

@compute @workgroup_size(256)
fn splat(@builtin(global_invocation_id) gid: vec3u, @builtin(num_workgroups) groups: vec3u) {
  let i = linear_index(gid, groups);
  if (i >= params.capacity) { return; }
  let state = states[i];
  if ((state & STATE_ALIVE_BIT) == 0u) { return; }
  let p = particles[i];
  let x = i32(floor(p.pos_x));
  let y = i32(floor(p.pos_y));
  if (!in_bounds(x, y)) { return; }
  // A buried pixel is inside solid material, and the field already draws that
  // cell. Drawing the pixel too would show something moving through rock.
  if (!open_at(x, y)) { return; }
  atomicMax(&overlay[cell_index(x, y)], (state & COLOR_MASK) | OCCUPIED_BIT);
}

// Clears stored momentum across the grid. Only needed on reset: in steady state
// a cell's impulse is consumed by `emit` the moment it is released.
@compute @workgroup_size(256)
fn clear_impulse(@builtin(global_invocation_id) gid: vec3u, @builtin(num_workgroups) groups: vec3u) {
  let c = linear_index(gid, groups);
  if (c >= params.world.x * params.world.y) { return; }
  atomicStore(&impulse[c], 0u);
}

// Rebuilds the pool in place. Run over `ring_mask + 1` invocations; the CPU
// resets head/tail alongside it, so no slot is ever live twice.
@compute @workgroup_size(256)
fn init_pool(@builtin(global_invocation_id) gid: vec3u, @builtin(num_workgroups) groups: vec3u) {
  let i = linear_index(gid, groups);
  if (i > params.ring_mask) { return; }
  free_ring[i] = i;
  if (i < params.capacity) {
    particles[i] = Particle(0.0, 0.0, 0.0, 0.0, SKY_CELL);
    states[i] = 0u;
  }
}
