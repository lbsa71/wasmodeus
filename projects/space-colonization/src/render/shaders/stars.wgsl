struct StarRecord {
  position_flux: vec4f,
  color: u32,
  pick_handle: u32,
  flags: u32,
  radius: f32,
}

struct Camera {
  view_projection: mat4x4f,
  point_size: f32,
  rebase_xy: vec2f,
  _padding: f32,
}

struct VertexOut {
  @builtin(position) position: vec4f,
  @location(0) color: vec3f,
  @location(1) uv: vec2f,
  @location(2) @interpolate(flat) flags: u32,
}

@group(0) @binding(0) var<storage, read> stars: array<StarRecord>;
@group(0) @binding(1) var<uniform> camera: Camera;

fn quad_vertex(vertex_index: u32) -> vec2f {
  const corners = array<vec2f, 6>(
    vec2f(-1.0, -1.0), vec2f(1.0, -1.0), vec2f(1.0, 1.0),
    vec2f(-1.0, -1.0), vec2f(1.0, 1.0), vec2f(-1.0, 1.0),
  );
  return corners[vertex_index];
}

@vertex
fn vertex_main(@builtin(vertex_index) vertex_index: u32, @builtin(instance_index) instance_index: u32) -> VertexOut {
  let star = stars[instance_index];
  let clip = (camera.view_projection * vec4f(star.position_flux.xyz, 1.0)) - vec4f(
    camera.rebase_xy.x * camera.view_projection[0][0],
    camera.rebase_xy.y * camera.view_projection[1][1],
    0.0,
    0.0,
  );
  let corner = quad_vertex(vertex_index);
  let is_sector = (star.flags & 1u) != 0u;
  let is_planet = (star.flags & 2u) != 0u;
  let sprite_size = max(0.00025, camera.point_size * star.radius * max(0.25, sqrt(max(0.0, star.position_flux.w))));
  let sector_size = vec2f(
    star.radius * camera.view_projection[0][0] * 0.5,
    star.radius * camera.view_projection[1][1] * 0.5,
  );
  var output: VertexOut;
  let physical_size = vec2f(
    star.radius * camera.view_projection[0][0],
    star.radius * camera.view_projection[1][1],
  );
  var offset = corner * sprite_size * clip.w;
  if (is_sector) { offset = corner * sector_size; }
  if (is_planet) { offset = corner * physical_size; }
  output.position = clip + vec4f(offset, 0.0, 0.0);
  output.color = vec3f(
    f32(star.color & 255u) / 255.0,
    f32((star.color >> 8u) & 255u) / 255.0,
    f32((star.color >> 16u) & 255u) / 255.0,
  );
  output.uv = corner;
  output.flags = star.flags;
  return output;
}

@fragment
fn fragment_main(input: VertexOut) -> @location(0) vec4f {
  if ((input.flags & 1u) != 0u) {
    let border = step(0.91, max(abs(input.uv.x), abs(input.uv.y)));
    return vec4f(input.color * border * 0.35, border * 0.35);
  }
  let falloff = max(0.0, 1.0 - dot(input.uv, input.uv));
  return vec4f(input.color * falloff * 1.8, falloff);
}
