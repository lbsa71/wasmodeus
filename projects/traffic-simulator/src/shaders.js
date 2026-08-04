const SCENE_DEFINITION = /* wgsl */ `
struct Scene {
  viewport: vec2f,
  center: vec2f,
  zoom: f32,
  worldSize: f32,
  roadHalfWidth: f32,
  roadTileCount: f32,
  pixelRatio: f32,
  logicalZoom: f32,
  padding: vec2f,
}
`;

export const WORLD_SHADER = /* wgsl */ `
${SCENE_DEFINITION}

@group(0) @binding(0) var<uniform> scene: Scene;
@group(0) @binding(1) var<storage, read> packedRoadTiles: array<u32>;

struct VertexOutput {
  @builtin(position) position: vec4f,
}

@vertex
fn vertexMain(@builtin(vertex_index) vertexIndex: u32) -> VertexOutput {
  let positions = array<vec2f, 3>(
    vec2f(-1.0, -1.0),
    vec2f(3.0, -1.0),
    vec2f(-1.0, 3.0),
  );
  var output: VertexOutput;
  output.position = vec4f(positions[vertexIndex], 0.0, 1.0);
  return output;
}

fn roadTileData(tile: vec2u) -> u32 {
  let index = tile.y * u32(scene.worldSize) + tile.x;
  let packed = packedRoadTiles[index >> 2u];
  let shift = (index & 3u) * 8u;
  return (packed >> shift) & 255u;
}

fn has(mask: u32, direction: u32) -> bool {
  return (mask & direction) != 0u;
}

@fragment
fn fragmentMain(@builtin(position) fragment: vec4f) -> @location(0) vec4f {
  let world = (fragment.xy - scene.viewport * 0.5) / scene.zoom + scene.center;
  let outside =
    world.x < 0.0 || world.y < 0.0 ||
    world.x >= scene.worldSize || world.y >= scene.worldSize;

  if (outside) {
    return vec4f(0.027, 0.067, 0.059, 1.0);
  }

  let tile = vec2u(floor(world));
  let local = fract(world);
  let tileData = roadTileData(tile);
  let connectivity = tileData & 15u;
  let buildable = (tileData & 16u) != 0u;
  let fourLane = (tileData & 32u) != 0u;
  let homePlot = (tileData & 64u) != 0u;
  let workPlot = (tileData & 128u) != 0u;
  let pixelWorld = 1.0 / scene.zoom;
  let designedHalfWidth = select(scene.roadHalfWidth, 0.43, fourLane);
  let halfWidth = max(designedHalfWidth, min(0.5, pixelWorld * 0.58));
  let centeredX = abs(local.x - 0.5) <= halfWidth;
  let centeredY = abs(local.y - 0.5) <= halfWidth;
  let horizontal =
    centeredY &&
    ((has(connectivity, 8u) && local.x <= 0.5) ||
     (has(connectivity, 2u) && local.x >= 0.5));
  let vertical =
    centeredX &&
    ((has(connectivity, 1u) && local.y <= 0.5) ||
     (has(connectivity, 4u) && local.y >= 0.5));
  let center = connectivity != 0u && centeredX && centeredY;
  let roadMask = select(0.0, 1.0, horizontal || vertical || center);
  let dividerHalfWidth = max(0.018, 0.52 * pixelWorld);
  let horizontalDivider =
    horizontal && abs(local.y - 0.5) <= dividerHalfWidth;
  let verticalDivider =
    vertical && abs(local.x - 0.5) <= dividerHalfWidth;
  let dividerMask = select(
    0.0,
    1.0,
    scene.logicalZoom >= 5.0 && (horizontalDivider || verticalDivider),
  );
  let laneStripeDistance = 0.195;
  let horizontalLaneStripe =
    horizontal &&
    abs(abs(local.y - 0.5) - laneStripeDistance) <= dividerHalfWidth * 0.65;
  let verticalLaneStripe =
    vertical &&
    abs(abs(local.x - 0.5) - laneStripeDistance) <= dividerHalfWidth * 0.65;
  let dashed = fract((local.x + local.y) * 4.0) < 0.58;
  let laneStripeMask = select(
    0.0,
    1.0,
    scene.logicalZoom >= 5.0 &&
      fourLane &&
      dashed &&
      (horizontalLaneStripe || verticalLaneStripe),
  );

  let blockedColor = vec3f(0.012, 0.040, 0.034);
  let landColor = vec3f(0.035, 0.082, 0.071);
  let homePlotColor = vec3f(0.08, 0.27, 0.52);
  let workPlotColor = vec3f(0.62, 0.22, 0.08);
  var tileColor = select(blockedColor, landColor, buildable);
  tileColor = select(tileColor, homePlotColor, homePlot);
  tileColor = select(tileColor, workPlotColor, workPlot);
  let roadColor = vec3f(0.185, 0.275, 0.240);
  var color = mix(tileColor, roadColor, roadMask);
  color = mix(color, vec3f(0.68, 0.61, 0.30), dividerMask * roadMask);
  color = mix(color, vec3f(0.72, 0.75, 0.67), laneStripeMask * roadMask);
  let plotColor = select(homePlotColor, workPlotColor, workPlot);
  let plotEdge = max(abs(local.x - 0.5), abs(local.y - 0.5));
  let plotMarker =
    (homePlot || workPlot) &&
    (scene.logicalZoom < 4.0 || (plotEdge >= 0.34 && plotEdge <= 0.47));
  color = mix(color, plotColor, select(0.0, 0.82, plotMarker));

  if (scene.logicalZoom >= 2.0) {
    let edgeDistance = min(
      min(local.x, 1.0 - local.x),
      min(local.y, 1.0 - local.y),
    );
    let edgeMask = smoothstep(0.025 + pixelWorld * 0.2, 0.025, edgeDistance);
    color = mix(color, vec3f(0.08, 0.15, 0.125), edgeMask * 0.5);
  }

  return vec4f(color, 1.0);
}
`;

export const CAR_SHADER = /* wgsl */ `
${SCENE_DEFINITION}

@group(0) @binding(0) var<uniform> scene: Scene;
@group(0) @binding(1) var<storage, read> carX: array<f32>;
@group(0) @binding(2) var<storage, read> carY: array<f32>;
@group(0) @binding(3) var<storage, read> packedDirections: array<u32>;
@group(0) @binding(4) var<storage, read> packedLanes: array<u32>;
@group(0) @binding(5) var<storage, read> carSegments: array<u32>;
@group(0) @binding(6) var<storage, read> packedRoadTiles: array<u32>;
@group(0) @binding(7) var<storage, read> packedActiveCars: array<u32>;

struct VertexOutput {
  @builtin(position) position: vec4f,
  @location(0) @interpolate(flat) shade: f32,
}

fn directionAt(index: u32) -> u32 {
  let packed = packedDirections[index >> 2u];
  let shift = (index & 3u) * 8u;
  return (packed >> shift) & 15u;
}

fn packedByteAt(bufferValue: u32, index: u32) -> u32 {
  let shift = (index & 3u) * 8u;
  return (bufferValue >> shift) & 255u;
}

fn laneAt(index: u32) -> u32 {
  return packedByteAt(packedLanes[index >> 2u], index) & 1u;
}

fn roadTileDataAt(index: u32) -> u32 {
  return packedByteAt(packedRoadTiles[index >> 2u], index);
}

fn activeAt(index: u32) -> bool {
  return packedByteAt(packedActiveCars[index >> 2u], index) != 0u;
}

@vertex
fn vertexMain(
  @builtin(vertex_index) vertexIndex: u32,
  @builtin(instance_index) instanceIndex: u32,
) -> VertexOutput {
  let corners = array<vec2f, 6>(
    vec2f(-0.5, -0.5),
    vec2f(0.5, -0.5),
    vec2f(-0.5, 0.5),
    vec2f(-0.5, 0.5),
    vec2f(0.5, -0.5),
    vec2f(0.5, 0.5),
  );
  var output: VertexOutput;
  let carIsActive = activeAt(instanceIndex);
  if (!carIsActive) {
    output.position = vec4f(2.0, 2.0, 0.0, 1.0);
    output.shade = 0.0;
    return output;
  }
  let direction = directionAt(instanceIndex);
  let lane = laneAt(instanceIndex);
  let tileData = roadTileDataAt(carSegments[instanceIndex]);
  let fourLane = (tileData & 32u) != 0u;
  let laneDistance = select(0.29, 0.10, lane == 1u);
  let offset = select(0.11, laneDistance, fourLane);
  var laneOffset = vec2f(0.0);
  if (direction == 2u) {
    laneOffset.y = offset;
  } else if (direction == 8u) {
    laneOffset.y = -offset;
  } else if (direction == 4u) {
    laneOffset.x = -offset;
  } else if (direction == 1u) {
    laneOffset.x = offset;
  }
  let world =
    vec2f(carX[instanceIndex], carY[instanceIndex]) + laneOffset;
  let screen = (world - scene.center) * scene.zoom + scene.viewport * 0.5;
  let carSize = max(1.35 * scene.pixelRatio, 0.16 * scene.zoom);
  let pixel = screen + corners[vertexIndex] * carSize;
  let clip = vec2f(
    pixel.x / scene.viewport.x * 2.0 - 1.0,
    1.0 - pixel.y / scene.viewport.y * 2.0,
  );

  output.position = vec4f(clip, 0.0, 1.0);
  output.shade = f32((instanceIndex * 17u) % 31u) / 310.0;
  return output;
}

@fragment
fn fragmentMain(input: VertexOutput) -> @location(0) vec4f {
  return vec4f(0.92 + input.shade, 0.62 + input.shade, 0.16, 1.0);
}
`;
