struct Scene {
  viewport: vec4f,
  ship: vec4f,
  world: vec4f,
  padding: vec4f,
  enemy: vec4f,
  goal: vec4f,
  laser: vec4f,
  asteroid: vec4f,
  aim: vec4f,
  action: vec4f,
}

@group(0) @binding(0) var<uniform> scene: Scene;

struct VertexOutput {
  @builtin(position) position: vec4f,
  @location(0) clip: vec2f,
}

@vertex
fn vertexMain(@builtin(vertex_index) index: u32) -> VertexOutput {
  let triangle = array<vec2f, 3>(vec2f(-1.0, -1.0), vec2f(3.0, -1.0), vec2f(-1.0, 3.0));
  var output: VertexOutput;
  output.clip = triangle[index];
  output.position = vec4f(output.clip, 0.0, 1.0);
  return output;
}

fn ringMask(point: vec2f, radius: f32, width: f32) -> f32 {
  return 1.0 - smoothstep(width, width + 1.6, abs(length(point) - radius));
}

fn segmentMask(point: vec2f, start: vec2f, end: vec2f, width: f32) -> f32 {
  let delta = end - start;
  let along = clamp(dot(point - start, delta) / dot(delta, delta), 0.0, 1.0);
  return 1.0 - smoothstep(width, width + 1.4, length(point - (start + delta * along)));
}

fn rotate(point: vec2f, angle: f32) -> vec2f {
  let cosine = cos(angle);
  let sine = sin(angle);
  return vec2f(point.x * cosine - point.y * sine, point.x * sine + point.y * cosine);
}

@fragment
fn fragmentMain(input: VertexOutput) -> @location(0) vec4f {
  let aspect = scene.viewport.x;
  let screenPoint = vec2f(input.clip.x * aspect, input.clip.y) * scene.viewport.y;
  let point = rotate(screenPoint, scene.padding.z) + scene.padding.xy;
  let radius = length(point);
  let starField = fract(sin(dot(floor(point * 0.32), vec2f(12.9898, 78.233))) * 43758.5453);
  var color = vec3f(0.006, 0.012, 0.032) + step(0.992, starField) * 0.22;

  let planetGlow = exp(-radius * 0.035) * vec3f(0.05, 0.11, 0.2);
  color += planetGlow;
  let planet = 1.0 - smoothstep(37.0, 39.5, radius);
  color = mix(color, vec3f(0.045, 0.09, 0.15) + vec3f(0.08, 0.2, 0.32) * max(0.0, point.y / 40.0), planet);

  var routes = 0.0;
  for (var routeIndex: i32 = 0; routeIndex < 4; routeIndex = routeIndex + 1) {
    let radiusRatio = f32(routeIndex) / 3.0;
    let routeRadius = mix(scene.viewport.w, scene.world.x, radiusRatio);
    routes += ringMask(point, routeRadius, 1.0);
  }
  color += routes * vec3f(0.08, 0.31, 0.48);
  let transfer = segmentMask(point, vec2f(scene.viewport.w, 0.0), vec2f(scene.world.x, 0.0), 0.8);
  color += transfer * vec3f(0.55, 0.34, 0.1);

  var obstacleMask = 0.0;
  for (var obstacleIndex: i32 = 0; obstacleIndex < 4; obstacleIndex = obstacleIndex + 1) {
    let routeIndex = obstacleIndex;
    let radiusRatio = f32(routeIndex) / 3.0;
    let routeRadius = mix(scene.viewport.w, scene.world.x, radiusRatio);
    let baseAngle = 0.8 + f32(obstacleIndex) * 1.57 + f32(routeIndex) * 0.46;
    let obstacleAngle = baseAngle - (0.32 + f32(routeIndex) * 0.04) * scene.world.z;
    let obstaclePosition = vec2f(cos(obstacleAngle), sin(obstacleAngle)) * routeRadius;
    obstacleMask += 1.0 - smoothstep(5.0, 7.0, length(point - obstaclePosition));
  }
  color = mix(color, vec3f(0.95, 0.23, 0.12), clamp(obstacleMask, 0.0, 1.0));

  let detectionDistance = length(point - scene.enemy.xy);
  let detectionRing = 1.0 - smoothstep(1.0, 3.0, abs(detectionDistance - scene.enemy.w));
  color += detectionRing * vec3f(0.48, 0.1, 0.2);
  let goalDistance = length(point - scene.goal.xy);
  let goalRing = 1.0 - smoothstep(4.0, 6.0, abs(goalDistance - 32.0));
  let goalColor = mix(vec3f(0.98, 0.67, 0.14), vec3f(0.25, 1.0, 0.56), scene.goal.z);
  color += goalRing * goalColor;

  let laserBeam = segmentMask(point, scene.laser.xy, scene.laser.zw, 1.4);
  let laserVisible = scene.asteroid.w;
  color += laserBeam * laserVisible * vec3f(0.14, 0.3, 0.4);
  let laserBase = 1.0 - smoothstep(10.0, 13.0, length(point - scene.laser.xy));
  color += laserBase * mix(vec3f(0.18, 0.55, 0.7), vec3f(0.8, 1.0, 0.9), scene.asteroid.w);
  let asteroidDistance = length(point - scene.asteroid.xy);
  let asteroid = 1.0 - smoothstep(scene.asteroid.z, scene.asteroid.z + 3.0, asteroidDistance);
  color = mix(color, vec3f(0.35, 0.27, 0.22) + vec3f(0.19, 0.12, 0.08) * sin(point.x * 0.35), asteroid);

  let enemyDelta = point - scene.enemy.xy;
  let enemyForward = normalize(scene.ship.xy - scene.enemy.xy + vec2f(0.0001, 0.0001));
  let enemySide = vec2f(enemyForward.y, -enemyForward.x);
  let enemyLocal = vec2f(dot(enemyDelta, enemySide), dot(enemyDelta, enemyForward));
  let enemyTriangle = max(abs(enemyLocal.x) * 0.72 + enemyLocal.y * 0.25, -enemyLocal.y) < 8.0;
  let enemyColor = mix(vec3f(0.64, 0.16, 0.22), vec3f(1.0, 0.26, 0.22), step(0.5, scene.enemy.z));
  color = mix(color, enemyColor, f32(enemyTriangle && scene.enemy.z < 1.5));
  let pellet = 1.0 - smoothstep(5.0, 8.0, length(point - scene.action.yz));
  color += pellet * scene.action.w * vec3f(1.0, 0.16, 0.08);

  let shipDelta = point - scene.ship.xy;
  let shipGlow = exp(-length(shipDelta) * 0.16);
  let scoutVisible = 1.0 - step(0.5, scene.padding.w);
  let excursion = step(0.5, scene.world.y);
  let shipColor = mix(vec3f(0.28, 0.82, 1.0), vec3f(1.0, 0.58, 0.2), excursion);
  color += shipGlow * shipColor * 0.7 * scoutVisible;
  let forward = vec2f(cos(scene.ship.z), sin(scene.ship.z));
  let side = vec2f(-forward.y, forward.x);
  let local = vec2f(dot(shipDelta, side), dot(shipDelta, forward));
  let triangle = max(abs(local.x) * 0.72 + local.y * 0.25, -local.y) < 7.0;
  color = mix(color, shipColor * 1.35, f32(triangle) * scoutVisible);

  return vec4f(color, 1.0);
}
