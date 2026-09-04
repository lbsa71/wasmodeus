// Composites the two layers the simulation maintains: `field` is the static
// image, `overlay` is this frame's moving pixels. Both are read-only here, so
// they are bound without atomics.

const COLOR_MASK: u32 = 0x00ffffffu;

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

@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var<storage, read> field: array<u32>;
@group(0) @binding(2) var<storage, read> overlay: array<u32>;

const LETTERBOX = vec4f(0.016, 0.018, 0.026, 1.0);
const SKY = vec4f(0.035, 0.040, 0.055, 1.0);

@vertex
fn vertex_main(@builtin(vertex_index) index: u32) -> @builtin(position) vec4f {
  // One oversized triangle covering the viewport.
  var corners = array<vec2f, 3>(vec2f(-1.0, -1.0), vec2f(3.0, -1.0), vec2f(-1.0, 3.0));
  return vec4f(corners[index], 0.0, 1.0);
}

fn unpack(word: u32) -> vec4f {
  let rgb = vec3f(
    f32(word & 255u),
    f32((word >> 8u) & 255u),
    f32((word >> 16u) & 255u),
  ) / 255.0;
  return vec4f(rgb, 1.0);
}

@fragment
fn fragment_main(@builtin(position) frag: vec4f) -> @location(0) vec4f {
  // Letterbox the square-ish world into whatever aspect the canvas has.
  let view_aspect = params.viewport.x / params.viewport.y;
  let world_aspect = f32(params.world.x) / f32(params.world.y);
  var scale = vec2f(1.0, 1.0);
  if (view_aspect > world_aspect) {
    scale.x = world_aspect / view_aspect;
  } else {
    scale.y = view_aspect / world_aspect;
  }

  var uv = (frag.xy / params.viewport - 0.5) / scale + 0.5;
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) { return LETTERBOX; }

  // Screen space is y-down, the world is y-up.
  let x = clamp(i32(uv.x * f32(params.world.x)), 0, i32(params.world.x) - 1);
  let y = clamp(i32((1.0 - uv.y) * f32(params.world.y)), 0, i32(params.world.y) - 1);
  let cell = u32(y) * params.world.x + u32(x);

  let moving = overlay[cell];
  if (moving != 0u) { return unpack(moving & COLOR_MASK); }
  let settled = field[cell];
  if (settled != 0u) { return unpack(settled & COLOR_MASK); }
  return SKY;
}
