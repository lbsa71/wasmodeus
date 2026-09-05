// Ground Truth — pixels move in and out of a static world.
//
// Frame order: prepare -> integrate xN -> advance -> settle -> emit -> splat.
// The free-slot ring is why the order matters: `settle` only ever pushes and
// `emit` only ever pops, so a slot can never be handed to two threads at once.

const OCCUPIED_BIT: u32  = 0x01000000u;
const DISLODGE_BIT: u32  = 0x80000000u;
const COLOR_MASK: u32    = 0x00ffffffu;
const MATERIAL_MASK: u32 = 0x1effffffu;
// The black placeholder that underground emptiness is made of. Present, so it
// counts as a neighbour and a tunnel holds its own roof up; open, so a pixel
// falls straight through it and whatever comes to rest in it replaces it.
// Never carried: it sits outside MATERIAL_MASK. See `src/core/field-format.js`.
const VOID_BIT: u32  = 0x20000000u;
const VOID_CELL: u32 = 0x21000000u;
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
const REASON_WATER: u32     = 5u;

// Water. A bond of fifteen is one that eight neighbours can never meet, so
// every "is this held?" in the simulation already answers no for water without
// knowing anything about water. Only which way it goes needs a rule of its own.
const WATER_BOND: u32 = 15u;

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
// Lemmings. See `src/core/agents.js` for the rules these mirror.
const MODE_WALK: u32 = 0u;
const MODE_DIG: u32  = 1u;
const MODE_FUSE: u32 = 2u;
const AGENT_TIMER_MASK: u32 = 0x000000ffu;
const AGENT_FACING_BIT: u32 = 0x00000100u;
const AGENT_MODE_SHIFT: u32 = 9u;
const AGENT_MODE_MASK: u32  = 0x00000600u;
const AGENT_ALIVE_BIT: u32  = 0x00000800u;
// Half-width and height of the block a lemming is drawn as, and comes apart to.
const AGENT_HALF_W: i32 = 1;
const AGENT_HEIGHT: i32 = 4;
// Speed a pixel must be doing to knock one apart.
const AGENT_SHATTER_SPEED: f32 = 240.0;
// Frames before a lost lemming is replaced. Without this the population only
// ever falls — bombs kill the bomber and the debris takes the neighbours — and
// the world goes quiet after half a minute.
const AGENT_RESPAWN: u32 = 150u;

// Two markers the overlay carries above its colour. `splat` flags a cell a
// pixel is tearing through, so a lemming can tell a hurtling rock from settling
// sand; `draw_agents` flags its own sprite, so a lemming does not read its own
// body as something hitting it. Both sit above the colour bits, so atomicMax
// keeps a fast pixel visible over an agent and an agent over ordinary material,
// and the composite masks them off.
const OVERLAY_FAST: u32  = 0x40000000u;
const OVERLAY_AGENT: u32 = 0x20000000u;

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
  agent_count: u32,
  agent_speed: f32,
  agent_bomb_chance: f32,
  agent_blast: f32,
  // Agents step once a frame, not once a substep, so they need the whole tick.
  frame_seconds: f32,
  water_spread: f32,
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

struct Agent {
  pos_x: f32,
  pos_y: f32,
  vel_x: f32,
  vel_y: f32,
  state: u32,
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
  walking: atomic<u32>,
  dug: atomic<u32>,
  flowing: atomic<u32>,
  drowned: atomic<u32>,
  sank: atomic<u32>,
  // The score: gold a lemming has dug through. Never reset by a frame.
  gold: atomic<u32>,
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
@group(0) @binding(8) var<storage, read_write> agents: array<Agent>;

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
fn is_void(word: u32) -> bool {
  return (word & VOID_BIT) != 0u;
}

// Whether a moving pixel, a drop of water or a lemming is stopped here. The
// placeholder is not an obstacle: a tunnel is somewhere to fall through.
fn blocked_at(x: i32, y: i32) -> bool {
  if (x < 0 || x >= i32(params.world.x)) { return true; }
  if (y < 0) { return true; }
  if (y >= i32(params.world.y)) { return false; }
  let word = atomicLoad(&field[cell_index(x, y)]);
  return word != 0u && !is_void(word);
}

// The sand rule's view of a neighbour: nowhere outside the world counts as
// somewhere a pixel could fall into.
fn open_at(x: i32, y: i32) -> bool {
  if (x < 0 || x >= i32(params.world.x) || y < 0) { return false; }
  if (y >= i32(params.world.y)) { return true; }
  let word = atomicLoad(&field[cell_index(x, y)]);
  return word == 0u || is_void(word);
}

fn is_water(word: u32) -> bool {
  return bond_of(word) == WATER_BOND;
}

// Whether a neighbour holds this cell up. Outside the world counts: the floor
// and the walls hold material in rather than letting the edges drain away.
//
// The placeholder holds everything up. It is water's mirror image — it stops
// nothing, but it bears load — and that is what keeps a tunnel's roof where it
// is once a lemming has dug it. So this is deliberately not `blocked_at`.
//
// Water holds nothing up. It is occupied and it blocks movement, but it bears
// no load, and that single exception is the whole of sinking: a grain resting
// on a pool has three water cells beneath it, and counting those as support is
// what made sand float on water like a raft. Discount them and the cohesion
// test the grain already runs answers "not held" all by itself. Only what it
// does next needed a rule — see `displaces_water`.
fn solid_at(x: i32, y: i32) -> u32 {
  if (x < 0 || x >= i32(params.world.x)) { return 1u; }
  if (y < 0) { return 1u; }
  if (y >= i32(params.world.y)) { return 0u; }
  let word = atomicLoad(&field[cell_index(x, y)]);
  if (word == 0u || is_water(word)) { return 0u; }
  return 1u;
}

// Whether a cell's neighbours are enough to hold it. Outside the world counts
// as solid, so the floor and walls hold material in instead of letting the
// edges of the world quietly drain away.
//
// The four orthogonal neighbours come first and the diagonals are only paid for
// when they might change the answer: most of a solid world is interior rock
// whose bond the orthogonals already satisfy, and that is four loads per cell
// per frame saved across twenty million of them.
// What actually packs a cell in: matter that would have to move for it to.
// Not the placeholder — a tunnel holds a wall up but does not bury it — and not
// water. This is what an impact has to overcome and what the brush has to reach
// through, whereas `solid_at` is what a cell may rest on. Count the placeholder
// here and every cave wall reads as buried eight deep: unsmudgeable, and too
// well packed for any impact to splash.
fn covered_at(x: i32, y: i32) -> u32 {
  if (x < 0 || x >= i32(params.world.x)) { return 1u; }
  if (y < 0) { return 1u; }
  if (y >= i32(params.world.y)) { return 0u; }
  let word = atomicLoad(&field[cell_index(x, y)]);
  if (word == 0u || is_water(word) || is_void(word)) { return 0u; }
  return 1u;
}

fn cover_count(x: i32, y: i32) -> u32 {
  return covered_at(x - 1, y) + covered_at(x + 1, y) + covered_at(x, y - 1) + covered_at(x, y + 1)
    + covered_at(x - 1, y - 1) + covered_at(x + 1, y - 1)
    + covered_at(x - 1, y + 1) + covered_at(x + 1, y + 1);
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
  return i32(cover_count(x, y)) - i32(bond) <= SMUDGE_REACH;
}

// Where water goes next: straight down, then down-diagonally, then — under
// pressure — flat sideways. The last is the whole difference between water and
// sand: sand needs an opening *below* something before it will move, which is
// why it heaps, while water walks along a level floor until the pool is level.
// With nowhere to go it returns zero and stays exactly where it is, which is
// what makes a still pool still instead of a permanent churn.
//
// Pressure means water directly above. Without that a pool's surface is a
// partial row of cells each with an open side, sliding back and forth for ever
// — ninety-odd pixels permanently in flight over a tank that should have been
// at rest. With it a film one cell deep is already level, and a pool levels
// from below: buried cells are squeezed out sideways and the ones above drop.
fn water_flow(x: i32, y: i32, seed: u32) -> vec2i {
  if (open_at(x, y - 1)) { return vec2i(0, -1); }
  let down_left = open_at(x - 1, y - 1);
  let down_right = open_at(x + 1, y - 1);
  if (down_left || down_right) { return vec2i(choose_direction(down_left, down_right, seed), -1); }
  if (y + 1 >= i32(params.world.y) || !is_water(atomicLoad(&field[cell_index(x, y + 1)]))) {
    return vec2i(0, 0);
  }
  let left = open_at(x - 1, y);
  let right = open_at(x + 1, y);
  if (left || right) { return vec2i(choose_direction(left, right, seed ^ 0x1b7u), 0); }
  return vec2i(0, 0);
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

// Whether this cell can trade places with water directly beneath it, which is
// what sinking is: the grain takes the cell below and the water takes the one
// it left, a cell a frame, both conserved.
//
// Granular material — anything needing as many neighbours as rubble does —
// always sinks. On land its bond holds a heap together; in water it has no
// cohesion at all. Gate it on cohesion instead and a slab of sand floats on its
// own bottom row's neighbours, and loose sand knits into a crust on the surface
// and floats too: 183 grains sitting on water after 600 frames, measured.
//
// A solid — stone — keeps its cohesion, and the question is the one `is_held`
// already answers. Because `solid_at` discounts water, a lone stone resting on
// a pool has nothing holding it and goes under, while a rock ledge with
// neighbours of its own stays a ledge. Bedrock is asked for no neighbours at
// all, so it is held by definition and stands in the water.
fn displaces_water(x: i32, y: i32, word: u32) -> bool {
  if (is_water(word)) { return false; }
  if (y <= 0) { return false; }
  if (!is_water(atomicLoad(&field[cell_index(x, y - 1)]))) { return false; }
  if (bond_of(word) >= params.rubble_bond) { return true; }
  return !is_held(x, y, bond_of(word));
}

// Claims a cell for a settling pixel. Empty is what it usually finds; the
// placeholder is the other thing a pixel may come to rest in, and it is
// replaced by whatever arrives — that is the whole of "becomes what perturbs
// it". Two compare-exchanges rather than one test-and-store, because either
// may lose a race and a loser must leave nothing half-done.
fn claim_cell(c: u32, deposit: u32) -> bool {
  if (atomicCompareExchangeWeak(&field[c], 0u, deposit).exchanged) { return true; }
  return atomicCompareExchangeWeak(&field[c], VOID_CELL, deposit).exchanged;
}

// Claims one cell for a settling pixel, if there is nothing in it.
fn deposit_into(x: i32, y: i32, value: u32) -> bool {
  if (!in_bounds(x, y)) { return false; }
  return claim_cell(cell_index(x, y), value);
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
  let surplus = f32(max(0, i32(cover_count(x, y)) - i32(bond)));
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
  atomicStore(&counters.walking, 0u);
  atomicStore(&counters.dug, 0u);
  atomicStore(&counters.flowing, 0u);
  atomicStore(&counters.drowned, 0u);
  atomicStore(&counters.sank, 0u);
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

  let x = i32(p.last_cell % params.world.x);
  let y = i32(p.last_cell / params.world.x);
  // One last look at what is underneath before committing. A pixel comes to
  // rest *on* something, and "has not changed cell" is not enough on its own:
  // at the apex of an arc a pixel barely moves from one frame to the next, so
  // it would settle in mid-air. Several arriving together then form a clump
  // whose interior satisfies its own bond, and the clump hangs there for good.
  // Smudging upward launches a whole brushful of pixels that reach their apex
  // at the same moment, which is why it froze them in the sky.
  // A pixel comes to rest *on* something, and "has not changed cell" is not
  // enough on its own: at the apex of an arc a pixel barely moves from one frame
  // to the next, so it would settle in mid-air. Several arriving together then
  // form a clump whose interior satisfies its own bond, and the clump hangs
  // there for good.
  //
  // Water is exempt. It has no bond to satisfy, so a drop that stops in mid-air
  // is released again next frame anyway — and requiring a floor would stop a
  // column of water ever filling a shaft from the bottom up.
  if (!is_water(state) && open_at(x, y - 1)) {
    states[i] = with_rest(state, 0u);
    return;
  }

  // Anything that has been airborne comes back down as rubble: blasted stone
  // does not re-freeze into cliff face that holds a ceiling up again. Water is
  // the exception and has to be — settle it as rubble and a drop turns to sand
  // the first time it lands, and a river silts up into a sandbank.
  var landed_bond = params.rubble_bond;
  if (is_water(state)) { landed_bond = WATER_BOND; }
  let deposit = ((state & MATERIAL_MASK) & ~BOND_MASK)
    | (landed_bond << BOND_SHIFT)
    | OCCUPIED_BIT;
  if (claim_cell(p.last_cell, deposit)) {
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
  // Nothing to release from empty space, and nothing from the placeholder: a
  // tunnel is not material, and neither the brush nor a blast can move it.
  if (value == 0u || is_void(value)) { return; }

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
  } else if (is_water(value)) {
    // Water is held by nothing, so the only question is whether it has anywhere
    // to go. A cell walled in by rock and its own kind is a cell at rest.
    let flow = water_flow(x, y, seed);
    if (flow.x != 0 || flow.y != 0) {
      reason = REASON_WATER;
      direction = flow.x;
    }
  } else if (displaces_water(x, y, value)) {
    // Sand sinks through water by simply swapping with it. No pool slot is
    // needed and none is taken: nothing here goes into motion, two cells just
    // exchange contents, so sinking carries on working in a world whose pool
    // has run dry.
    //
    // This is the one place anything writes a cell that is not its own, so the
    // cell below is claimed rather than stored into: its own invocation may be
    // releasing it in this same pass, and exactly one of the two may have it.
    // Losing the claim costs nothing — the water left, so next frame this cell
    // simply falls into the space instead.
    let below = cell_index(x, y - 1);
    let under = atomicLoad(&field[below]);
    if (is_water(under) && atomicCompareExchangeWeak(&field[below], under, value).exchanged) {
      // Our own cell has no other writer, so the water can go straight in. It
      // sheds any dislodge mark on the way: whatever struck it left its
      // momentum in the cell below, and the water is not going that way now.
      atomicStore(&field[c], under & ~DISLODGE_BIT);
      atomicAdd(&counters.sank, 1u);
    }
    return;
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

  // Claim the cell before spending anything. A water cell may also be claimed
  // this frame by the cell above it trading places, and only one of the two may
  // win; a loser that had already popped a slot would have to give it back, and
  // only `settle` is allowed to push to the ring.
  if (!atomicCompareExchangeWeak(&field[c], value, 0u).exchanged) { return; }

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
  } else if (reason == REASON_WATER) {
    // Sideways along a floor, or down and along. Gently: water creeps, and a
    // drop given a real shove would arc away like grit.
    vel = vec2f(f32(direction) * params.water_spread, -params.water_spread * 0.5);
    atomicAdd(&counters.flowing, 1u);
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
  var mark = (state & COLOR_MASK) | OCCUPIED_BIT;
  // Flag the cell if this pixel is moving fast enough to break a lemming.
  if (length(vec2f(p.vel_x, p.vel_y)) >= AGENT_SHATTER_SPEED) { mark |= OVERLAY_FAST; }
  atomicMax(&overlay[cell_index(x, y)], mark);
}

// Whether anything is tearing through the block a lemming occupies. Reads the
// overlay, which at this point in the frame still holds the previous frame's
// moving pixels — a frame stale, which is plenty for "is something hitting me".
fn struck_by_debris(x: i32, y: i32) -> bool {
  for (var dy = 0; dy < AGENT_HEIGHT; dy += 1) {
    for (var dx = -AGENT_HALF_W; dx <= AGENT_HALF_W; dx += 1) {
      if (!in_bounds(x + dx, y + dy)) { continue; }
      if ((atomicLoad(&overlay[cell_index(x + dx, y + dy)]) & OVERLAY_FAST) != 0u) { return true; }
    }
  }
  return false;
}

// Whether any part of a lemming is in the water.
fn touches_water(x: i32, y: i32) -> bool {
  for (var dy = 0; dy < AGENT_HEIGHT; dy += 1) {
    for (var dx = -AGENT_HALF_W; dx <= AGENT_HALF_W; dx += 1) {
      if (!in_bounds(x + dx, y + dy)) { continue; }
      if (is_water(atomicLoad(&field[cell_index(x + dx, y + dy)]))) { return true; }
    }
  }
  return false;
}

// Gold is the one material told apart by what it looks like: a pixel carries
// nothing but colour and bond, so a nugget blown out of a wall is still gold
// wherever it lands. The thresholds mirror `isGold` in `src/core/palette.js`.
fn is_gold(word: u32) -> bool {
  let r = word & 255u;
  let g = (word >> 8u) & 255u;
  let b = (word >> 16u) & 255u;
  return r >= 236u && g >= 190u && b <= 96u;
}

// Digging turns a cell into the placeholder rather than releasing it, so the
// tunnel keeps its shape and holds its own roof up, and it costs the pool
// nothing. Bedrock is beyond a lemming; water is not dug but drowned in. Gold
// dug through is gold mined.
fn dig_cell(x: i32, y: i32) -> bool {
  if (!in_bounds(x, y)) { return false; }
  let c = cell_index(x, y);
  let value = atomicLoad(&field[c]);
  if (value == 0u || is_void(value) || is_water(value) || bond_of(value) == 0u) { return false; }
  if (!atomicCompareExchangeWeak(&field[c], value, VOID_CELL).exchanged) { return false; }
  if (is_gold(value)) { atomicAdd(&counters.gold, 1u); }
  return true;
}

// Releases one cell into the pool with a velocity, for the bomb. Returns
// whether a slot was free.
fn release_cell(x: i32, y: i32, vel: vec2f) -> bool {
  if (!in_bounds(x, y)) { return false; }
  let c = cell_index(x, y);
  let value = atomicLoad(&field[c]);
  if (value == 0u || bond_of(value) == 0u) { return false; }
  let budget = atomicSub(&counters.pop_budget, 1);
  if (budget <= 0) { return false; }
  let slot = free_ring[atomicAdd(&counters.head, 1u) & params.ring_mask];
  atomicStore(&field[c], 0u);
  particles[slot] = Particle(f32(x) + 0.5, f32(y) + 0.5, vel.x, vel.y, SKY_CELL);
  states[slot] = (value & MATERIAL_MASK) | STATE_ALIVE_BIT;
  atomicAdd(&counters.emitted, 1u);
  return true;
}

// A lemming coming apart into its own pixels. Its body is not part of the
// field, so this is the one place matter enters the world; the amount is
// bounded by the number of lemmings times the size of the block.
fn shatter(index: u32, x: i32, y: i32, colour: u32) {
  for (var dy = 0; dy < AGENT_HEIGHT; dy += 1) {
    for (var dx = -AGENT_HALF_W; dx <= AGENT_HALF_W; dx += 1) {
      let budget = atomicSub(&counters.pop_budget, 1);
      if (budget <= 0) { return; }
      let slot = free_ring[atomicAdd(&counters.head, 1u) & params.ring_mask];
      let seed = hash_u32(index * 7919u + u32((dy + 1) * 8 + dx + 4));
      particles[slot] = Particle(
        f32(x + dx) + 0.5, f32(y + dy) + 0.5,
        (rand01(seed) - 0.5) * 200.0, 60.0 + rand01(seed ^ 0x51u) * 140.0,
        SKY_CELL,
      );
      states[slot] = (colour & COLOR_MASK) | (params.rubble_bond << BOND_SHIFT) | STATE_ALIVE_BIT;
      atomicAdd(&counters.emitted, 1u);
    }
  }
}

// Walks the lemmings, and lets them dig and detonate. One thread apiece, and
// there are few of them, so this is the cheapest pass in the frame.
//
// It runs before `emit` so a lemming digging or blowing up competes for free
// slots on the same budget the world does, rather than on top of it.
@compute @workgroup_size(256)
fn step_agents(@builtin(global_invocation_id) gid: vec3u, @builtin(num_workgroups) groups: vec3u) {
  let i = linear_index(gid, groups);
  if (i >= params.agent_count) { return; }
  var a = agents[i];
  if ((a.state & AGENT_ALIVE_BIT) == 0u) {
    // Gone, and counting down to a replacement. The timer bits are reused: a
    // dead slot has no mode or facing to remember.
    let waiting = a.state & AGENT_TIMER_MASK;
    if (waiting > 1u) {
      agents[i] = Agent(a.pos_x, a.pos_y, 0.0, 0.0, waiting - 1u);
      return;
    }
    let born = hash_u32(i * 40503u + params.frame);
    var packed = AGENT_ALIVE_BIT | (MODE_WALK << AGENT_MODE_SHIFT) | (40u + (born % 140u));
    if ((born & 1u) == 1u) { packed |= AGENT_FACING_BIT; }
    agents[i] = Agent(
      rand01(born ^ 0x77u) * f32(params.world.x),
      f32(params.world.y) * 0.97,
      0.0, 0.0, packed,
    );
    return;
  }

  let x = i32(floor(a.pos_x));
  let y = i32(floor(a.pos_y));
  let colour = 0x00e8d0u;

  // Anything hurtling through takes it apart: the same bargain the rest of the
  // world makes, hold together until something hits hard enough.
  // Water is fatal on contact. A lemming caught by a flood does not decohere
  // into a spray of its own pixels the way one crushed by rock does — it simply
  // goes under, so there is nothing to release.
  if (touches_water(x, y)) {
    atomicAdd(&counters.drowned, 1u);
    agents[i] = Agent(a.pos_x, a.pos_y, 0.0, 0.0,
      AGENT_RESPAWN + (hash_u32(i ^ params.frame) % 100u));
    return;
  }

  if (struck_by_debris(x, y)) {
    shatter(i, x, y, colour);
    agents[i] = Agent(a.pos_x, a.pos_y, 0.0, 0.0,
      AGENT_RESPAWN + (hash_u32(i ^ params.frame) % 100u));
    return;
  }

  atomicAdd(&counters.walking, 1u);
  var timer = a.state & AGENT_TIMER_MASK;
  var mode = (a.state & AGENT_MODE_MASK) >> AGENT_MODE_SHIFT;
  var facing = -1;
  if ((a.state & AGENT_FACING_BIT) != 0u) { facing = 1; }
  let seed = hash_u32(i * 2654435761u + params.frame);

  // Nothing underfoot beats everything else: a lemming whose floor has been dug
  // away or blown out falls, whatever it was doing.
  if (!blocked_at(x, y - 1)) {
    a.vel_y -= params.gravity * params.frame_seconds;
    let next = a.pos_y + a.vel_y * params.frame_seconds;
    if (blocked_at(x, i32(floor(next)))) {
      a.vel_y = 0.0;
    } else {
      a.pos_y = clamp(next, 0.0, f32(params.world.y) - EDGE_EPSILON);
    }
    agents[i] = Agent(a.pos_x, a.pos_y, 0.0, a.vel_y, a.state);
    return;
  }
  a.vel_y = 0.0;

  if (mode == MODE_FUSE && timer <= 1u) {
    // The bomb. Everything within the radius leaves with momentum pointing
    // away, and the lemming goes with it.
    let r = i32(params.agent_blast);
    for (var dy = -r; dy <= r; dy += 1) {
      for (var dx = -r; dx <= r; dx += 1) {
        let d = sqrt(f32(dx * dx + dy * dy));
        if (d > f32(r)) { continue; }
        let away = vec2f(f32(dx), f32(dy)) / max(d, 1.0);
        release_cell(x + dx, y + dy, away * params.blast.w * (1.0 - d / f32(r)) * 0.5);
      }
    }
    shatter(i, x, y, colour);
    agents[i] = Agent(a.pos_x, a.pos_y, 0.0, 0.0,
      AGENT_RESPAWN + (hash_u32(i ^ params.frame) % 100u));
    return;
  }

  if (mode == MODE_DIG) {
    // A tunnel one cell bigger than the lemming in every direction it can be:
    // its own height plus headroom, cut two columns ahead so the working face
    // is always clear of the sprite. Nothing is released and nothing is spent
    // from the pool — see `dig_cell`.
    var dug = 0u;
    for (var step = 1; step <= 2; step += 1) {
      for (var dy = 0; dy <= AGENT_HEIGHT; dy += 1) {
        if (dig_cell(x + facing * step, y + dy)) { dug += 1u; }
      }
    }
    atomicAdd(&counters.dug, dug);
    // Digging is slower going than walking.
    if (!blocked_at(x + facing, y)) {
      a.pos_x = clamp(a.pos_x + f32(facing) * params.agent_speed * params.frame_seconds * 0.5,
        0.0, f32(params.world.x) - EDGE_EPSILON);
    }
  } else {
    // Walking. Clear ahead and it walks on; a single cell in the way and it
    // steps up; anything taller and it turns round.
    let ahead = blocked_at(x + facing, y);
    if (!ahead) {
      a.pos_x = clamp(a.pos_x + f32(facing) * params.agent_speed * params.frame_seconds,
        0.0, f32(params.world.x) - EDGE_EPSILON);
    } else if (!blocked_at(x + facing, y + 1)) {
      a.pos_x = clamp(a.pos_x + f32(facing) * 0.6, 0.0, f32(params.world.x) - EDGE_EPSILON);
      a.pos_y = clamp(a.pos_y + 1.0, 0.0, f32(params.world.y) - EDGE_EPSILON);
    } else {
      facing = -facing;
    }
  }

  if (timer > 1u) {
    timer -= 1u;
  } else if (mode != MODE_WALK) {
    mode = MODE_WALK;
    timer = 60u + (seed % 120u);
  } else if (rand01(seed ^ 0x2f1cu) < params.agent_bomb_chance) {
    mode = MODE_FUSE;
    timer = 70u + (seed % 90u);
  } else {
    mode = MODE_DIG;
    timer = 25u + (seed % 70u);
  }

  var packed = AGENT_ALIVE_BIT | (mode << AGENT_MODE_SHIFT) | timer;
  if (facing > 0) { packed |= AGENT_FACING_BIT; }
  agents[i] = Agent(a.pos_x, a.pos_y, 0.0, 0.0, packed);
}

// Draws the lemmings, after `emit` has cleared the overlay and `splat` has
// filled it with this frame's moving pixels.
@compute @workgroup_size(256)
fn draw_agents(@builtin(global_invocation_id) gid: vec3u, @builtin(num_workgroups) groups: vec3u) {
  let i = linear_index(gid, groups);
  if (i >= params.agent_count) { return; }
  let a = agents[i];
  if ((a.state & AGENT_ALIVE_BIT) == 0u) { return; }
  // A lit fuse blinks, faster as it runs down, so you can see one coming.
  var colour = 0x00e8d0u;
  if (((a.state & AGENT_MODE_MASK) >> AGENT_MODE_SHIFT) == MODE_FUSE) {
    let timer = a.state & AGENT_TIMER_MASK;
    if (((params.frame / (timer / 10u + 1u)) & 1u) == 0u) { colour = 0x3040ffu; }
  }
  let x = i32(floor(a.pos_x));
  let y = i32(floor(a.pos_y));
  for (var dy = 0; dy < AGENT_HEIGHT; dy += 1) {
    for (var dx = -AGENT_HALF_W; dx <= AGENT_HALF_W; dx += 1) {
      if (!in_bounds(x + dx, y + dy)) { continue; }
      atomicMax(&overlay[cell_index(x + dx, y + dy)], colour | OCCUPIED_BIT | OVERLAY_AGENT);
    }
  }
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
