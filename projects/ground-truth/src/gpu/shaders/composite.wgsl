// Composites the two layers the simulation maintains: `field` is the static
// world, `overlay` is this frame's moving pixels. Both are read-only here, so
// they are bound without atomics.

const COLOR_MASK: u32 = 0x00ffffffu;
/** Cap on the supersample box when zoomed out, per axis. */
const MAX_TAPS: i32 = 3;

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

@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var<storage, read> field: array<u32>;
@group(0) @binding(2) var<storage, read> overlay: array<u32>;

const VOID = vec3f(0.016, 0.018, 0.026);
const SKY = vec3f(0.035, 0.040, 0.055);

@vertex
fn vertex_main(@builtin(vertex_index) index: u32) -> @builtin(position) vec4f {
  // One oversized triangle covering the viewport.
  var corners = array<vec2f, 3>(vec2f(-1.0, -1.0), vec2f(3.0, -1.0), vec2f(-1.0, 3.0));
  return vec4f(corners[index], 0.0, 1.0);
}

fn unpack(word: u32) -> vec3f {
  return vec3f(
    f32(word & 255u),
    f32((word >> 8u) & 255u),
    f32((word >> 16u) & 255u),
  ) / 255.0;
}

// Colour of one world cell: a moving pixel wins over the settled world.
fn sample_cell(x: i32, y: i32) -> vec3f {
  if (x < 0 || y < 0 || x >= i32(params.world.x) || y >= i32(params.world.y)) { return VOID; }
  let cell = u32(y) * params.world.x + u32(x);
  let moving = overlay[cell];
  if (moving != 0u) { return unpack(moving & COLOR_MASK); }
  let settled = field[cell];
  if (settled != 0u) { return unpack(settled & COLOR_MASK); }
  return SKY;
}

@fragment
fn fragment_main(@builtin(position) frag: vec4f) -> @location(0) vec4f {
  // Screen space is y-down and the world is y-up; `camera_origin` is the world
  // coordinate at the bottom-left of the viewport.
  let world_x = params.camera_origin.x + frag.x / params.camera_scale;
  let world_y = params.camera_origin.y + (params.viewport.y - frag.y) / params.camera_scale;
  let x = i32(floor(world_x));
  let y = i32(floor(world_y));
  if (x < 0 || y < 0 || x >= i32(params.world.x) || y >= i32(params.world.y)) {
    return vec4f(VOID, 1.0);
  }

  // Zoomed out, one fragment covers several cells. Point sampling would drop
  // most of them, and a stream of moving pixels would strobe in and out of
  // existence, so average a small box instead.
  let taps = clamp(i32(ceil(1.0 / params.camera_scale)), 1, MAX_TAPS);
  if (taps == 1) { return vec4f(sample_cell(x, y), 1.0); }

  var total = vec3f(0.0);
  for (var dy = 0; dy < taps; dy += 1) {
    for (var dx = 0; dx < taps; dx += 1) {
      total += sample_cell(
        x + i32(f32(dx) / (params.camera_scale * f32(taps))),
        y + i32(f32(dy) / (params.camera_scale * f32(taps))),
      );
    }
  }
  return vec4f(total / f32(taps * taps), 1.0);
}
