const GRID_SIZE: i32 = 1_000;
const TILE_COUNT: i32 = GRID_SIZE * GRID_SIZE;
const MAX_CARS: i32 = 100_000;
const SEGMENT_BUCKET_COUNT: i32 = TILE_COUNT * 4;
const NON_BUILDABLE_TARGET: i32 = TILE_COUNT * 23 / 100;
const AREA_MAX_DEPTH: i32 = 6;
const REGION_AXIS: i32 = 16;
const REGION_COUNT: i32 = REGION_AXIS * REGION_AXIS;
const REGION_ROUTE_STRIDE: i32 = REGION_COUNT / 4;
const NO_TILE: u32 = 0xffff_ffff;

const VEHICLE_LENGTH: f32 = 0.16;
const MINIMUM_GAP: f32 = 0.06;
const COLLISION_PADDING: f32 = 0.02;
const TIME_HEADWAY: f32 = 0.18;
const ACCELERATION: f32 = 12.0;
const DECELERATION: f32 = 12.0;
const JUNCTION_CLEARANCE: f32 = 0.72;
const STOP_LINE_DISTANCE: f32 = 0.12;
const MAX_RESERVATION_TILES: i32 = 8;
const NO_MOVEMENT: u8 = 255;

const NORTH: u8 = 1;
const EAST: u8 = 2;
const SOUTH: u8 = 4;
const WEST: u8 = 8;
const ROAD_MASK: u8 = NORTH | EAST | SOUTH | WEST;
const BUILDABLE: u8 = 16;

let carCount: i32 = 0;
let carCapacity: i32 = 0;
let tick: i32 = 0;
let randomState: u32 = 1;

let roadTiles = new StaticArray<u8>(0);
let routeAncestors = new StaticArray<u32>(0);
let routeDepth = new StaticArray<u16>(0);
let regionalHubs = new StaticArray<u32>(0);
let regionalDirections = new StaticArray<u8>(0);
let routingQueue = new StaticArray<u32>(0);
let regionalVisited = new StaticArray<u16>(0);
let carX = new StaticArray<f32>(0);
let carY = new StaticArray<f32>(0);
let carSpeed = new StaticArray<f32>(0);
let carTargetX = new StaticArray<u16>(0);
let carTargetY = new StaticArray<u16>(0);
let carNextTargetX = new StaticArray<u16>(0);
let carNextTargetY = new StaticArray<u16>(0);
let carDirection = new StaticArray<u8>(0);
let carActualSpeed = new StaticArray<f32>(0);
let carSegment = new StaticArray<u32>(0);
let carProgress = new StaticArray<f32>(0);
let carProposedDistance = new StaticArray<f32>(0);
let carWaitTicks = new StaticArray<u16>(0);
let carJunctionGranted = new StaticArray<u8>(0);
let carJunctionMovement = new StaticArray<u8>(0);
let carPendingMovement = new StaticArray<u8>(0);
let carReservedJunction = new StaticArray<u32>(0);
let carReservationLength = new StaticArray<u8>(0);
let carReservationTiles = new StaticArray<u32>(0);
let carReservationMovements = new StaticArray<u8>(0);
let carReservationExitTile = new StaticArray<u32>(0);
let carPendingReservationLength = new StaticArray<u8>(0);
let carPendingReservationTiles = new StaticArray<u32>(0);
let carPendingReservationMovements = new StaticArray<u8>(0);
let carPendingReservationExitTile = new StaticArray<u32>(0);
let carTargetRegion = new StaticArray<u8>(0);
let carNextTargetRegion = new StaticArray<u8>(0);

let bucketHead = new StaticArray<i32>(0);
let bucketNext = new StaticArray<i32>(0);
let touchedBuckets = new StaticArray<u32>(0);
let touchedBucketCount: i32 = 0;

let junctionOwner = new StaticArray<i32>(0);
let junctionTouched = new StaticArray<u8>(0);
let junctionMovementMask = new StaticArray<u16>(0);
let junctionCandidateNext = new StaticArray<i32>(0);
let touchedJunctions = new StaticArray<u32>(0);
let touchedJunctionCount: i32 = 0;
let junctionCandidateCount: i32 = 0;
let junctionGrantCount: i32 = 0;
let downstreamBlockedCount: i32 = 0;

function nextRandom(): u32 {
  let value = randomState;
  value ^= value << 13;
  value ^= value >> 17;
  value ^= value << 5;
  randomState = value;
  return value;
}

function randomUnit(): f32 {
  return <f32>(nextRandom() & 0x00ff_ffff) / 16_777_216.0;
}

function coordinateHash(seed: u32, x: i32, y: i32): u32 {
  let value =
    seed ^ <u32>x * 374_761_393 ^ <u32>y * 668_265_263;
  value = (value ^ (value >> 13)) * 1_274_126_177;
  return value ^ (value >> 16);
}

function interpolate(left: f32, right: f32, amount: f32): f32 {
  return left + (right - left) * amount;
}

function smoothNoiseAmount(amount: f32): f32 {
  return amount * amount * (3.0 - 2.0 * amount);
}

function latticeValue(seed: u32, x: i32, y: i32): f32 {
  return <f32>(coordinateHash(seed, x, y) & 65_535) / 65_535.0;
}

function valueNoise(
  seed: u32,
  x: i32,
  y: i32,
  scale: i32,
): f32 {
  const cellX = x / scale;
  const cellY = y / scale;
  const localX = smoothNoiseAmount(<f32>(x % scale) / <f32>scale);
  const localY = smoothNoiseAmount(<f32>(y % scale) / <f32>scale);
  const north = interpolate(
    latticeValue(seed, cellX, cellY),
    latticeValue(seed, cellX + 1, cellY),
    localX,
  );
  const south = interpolate(
    latticeValue(seed, cellX, cellY + 1),
    latticeValue(seed, cellX + 1, cellY + 1),
    localX,
  );
  return interpolate(north, south, localY);
}

function terrainScore(seed: u32, x: i32, y: i32): u8 {
  const continental = valueNoise(seed ^ 0x9e37_79b9, x, y, 192);
  const regional = valueNoise(seed ^ 0x85eb_ca6b, x, y, 73);
  const local = valueNoise(seed ^ 0xc2b2_ae35, x, y, 29);
  return <u8>Mathf.floor(
    Mathf.min(
      255.0,
      (continental * 0.55 + regional * 0.30 + local * 0.15) * 256.0,
    ),
  );
}

function createBuildableTerrain(seed: u32): StaticArray<u8> {
  const buildable = new StaticArray<u8>(TILE_COUNT);
  const scores = new StaticArray<u8>(TILE_COUNT);
  const histogram = new StaticArray<i32>(256);

  for (let y = 0; y < GRID_SIZE; y += 1) {
    for (let x = 0; x < GRID_SIZE; x += 1) {
      const index = y * GRID_SIZE + x;
      const score = terrainScore(seed, x, y);
      unchecked((scores[index] = score));
      unchecked((histogram[score] = unchecked(histogram[score]) + 1));
    }
  }

  let threshold = 0;
  let belowThreshold = 0;
  while (
    threshold < 255 &&
    belowThreshold + unchecked(histogram[threshold]) <= NON_BUILDABLE_TARGET
  ) {
    belowThreshold += unchecked(histogram[threshold]);
    threshold += 1;
  }
  let thresholdRemaining = NON_BUILDABLE_TARGET - belowThreshold;

  for (let index = 0; index < TILE_COUNT; index += 1) {
    const score = <i32>unchecked(scores[index]);
    const blocked =
      score < threshold || (score == threshold && thresholdRemaining-- > 0);
    unchecked((buildable[index] = blocked ? 0 : 1));
  }

  for (let pass = 0; pass < 4; pass += 1) {
    for (let y = 0; y < GRID_SIZE; y += 1) {
      for (let x = 0; x < GRID_SIZE; x += 1) {
        const index = y * GRID_SIZE + x;
        if (unchecked(buildable[index]) == 0) {
          unchecked((scores[index] = 0));
          continue;
        }
        let neighbors = 0;
        if (x > 0 && unchecked(buildable[index - 1]) != 0) neighbors += 1;
        if (
          x + 1 < GRID_SIZE &&
          unchecked(buildable[index + 1]) != 0
        ) neighbors += 1;
        if (
          y > 0 &&
          unchecked(buildable[index - GRID_SIZE]) != 0
        ) neighbors += 1;
        if (
          y + 1 < GRID_SIZE &&
          unchecked(buildable[index + GRID_SIZE]) != 0
        ) neighbors += 1;
        unchecked((scores[index] = neighbors < 2 ? 1 : 0));
      }
    }
    for (let index = 0; index < TILE_COUNT; index += 1) {
      if (unchecked(scores[index]) != 0) {
        unchecked((buildable[index] = 0));
      }
    }
  }
  return buildable;
}

function connectTiles(tile: i32, neighbor: i32, direction: u8): void {
  let opposite: u8 = NORTH;
  if (direction == NORTH) opposite = SOUTH;
  else if (direction == EAST) opposite = WEST;
  else if (direction == SOUTH) opposite = NORTH;
  else opposite = EAST;
  unchecked((roadTiles[tile] = unchecked(roadTiles[tile]) | direction));
  unchecked((roadTiles[neighbor] = unchecked(roadTiles[neighbor]) | opposite));
}

function findAreaHub(
  seed: u32,
  buildable: StaticArray<u8>,
  minX: i32,
  minY: i32,
  maxX: i32,
  maxY: i32,
): i32 {
  const width = maxX - minX;
  const height = maxY - minY;
  const hash = coordinateHash(seed, minX + maxX, minY + maxY);
  const jitterX = width > 4
    ? <i32>(hash % <u32>(width / 2)) - width / 4
    : 0;
  const jitterY = height > 4
    ? <i32>((hash >> 12) % <u32>(height / 2)) - height / 4
    : 0;
  const desiredX = minX + width / 2 + jitterX;
  const desiredY = minY + height / 2 + jitterY;
  let bestTile = -1;
  let bestDistance = 2_147_483_647;

  for (let y = minY; y < maxY; y += 1) {
    for (let x = minX; x < maxX; x += 1) {
      const tile = y * GRID_SIZE + x;
      if (unchecked(buildable[tile]) == 0) continue;
      const distance = absolute(x - desiredX) + absolute(y - desiredY);
      if (distance < bestDistance) {
        bestDistance = distance;
        bestTile = tile;
      }
    }
  }
  return bestTile;
}

function makeRouteBuildable(
  tile: i32,
  buildable: StaticArray<u8>,
): void {
  unchecked((buildable[tile] = 1));
  unchecked((roadTiles[tile] = unchecked(roadTiles[tile]) | BUILDABLE));
}

function carveRoute(
  seed: u32,
  start: i32,
  destination: i32,
  buildable: StaticArray<u8>,
): void {
  if (start < 0 || destination < 0 || start == destination) return;
  let current = start;
  let x = current % GRID_SIZE;
  let y = current / GRID_SIZE;
  const targetX = destination % GRID_SIZE;
  const targetY = destination / GRID_SIZE;
  let horizontalRun = (coordinateHash(seed, x, y) & 1) == 0;
  let runRemaining =
    3 + <i32>(coordinateHash(seed ^ 0x9e37_79b9, x, y) % 14);
  makeRouteBuildable(current, buildable);

  while (current != destination) {
    const canMoveHorizontal = x != targetX;
    const canMoveVertical = y != targetY;
    if (
      runRemaining == 0 ||
      (horizontalRun && !canMoveHorizontal) ||
      (!horizontalRun && !canMoveVertical)
    ) {
      if (canMoveHorizontal && canMoveVertical) {
        const horizontalDistance = absolute(targetX - x);
        const verticalDistance = absolute(targetY - y);
        const choice = coordinateHash(seed, x, y) %
          <u32>(horizontalDistance + verticalDistance);
        horizontalRun = <i32>choice < horizontalDistance;
      } else {
        horizontalRun = canMoveHorizontal;
      }
      runRemaining =
        3 + <i32>(coordinateHash(seed ^ 0x85eb_ca6b, x, y) % 14);
    }

    let next = current;
    let direction: u8 = 0;
    if (horizontalRun) {
      if (targetX > x) {
        x += 1;
        next += 1;
        direction = EAST;
      } else {
        x -= 1;
        next -= 1;
        direction = WEST;
      }
    } else if (targetY > y) {
      y += 1;
      next += GRID_SIZE;
      direction = SOUTH;
    } else {
      y -= 1;
      next -= GRID_SIZE;
      direction = NORTH;
    }
    makeRouteBuildable(next, buildable);
    connectTiles(current, next, direction);
    current = next;
    runRemaining -= 1;
  }
}

function growAreaNetwork(
  seed: u32,
  buildable: StaticArray<u8>,
  minX: i32,
  minY: i32,
  maxX: i32,
  maxY: i32,
  depth: i32,
): i32 {
  const hub = findAreaHub(
    seed ^ <u32>(depth * 0x45d9_f3b),
    buildable,
    minX,
    minY,
    maxX,
    maxY,
  );
  if (
    hub < 0 ||
    depth >= AREA_MAX_DEPTH ||
    maxX - minX < 8 ||
    maxY - minY < 8
  ) return hub;

  const width = maxX - minX;
  const height = maxY - minY;
  const splitHash = coordinateHash(seed ^ 0xc2b2_ae35, minX, minY);
  const splitX = minX + width * (45 + <i32>(splitHash % 11)) / 100;
  const splitY =
    minY + height * (45 + <i32>((splitHash >> 8) % 11)) / 100;

  const northWest = growAreaNetwork(
    seed ^ 0x243f_6a88,
    buildable,
    minX,
    minY,
    splitX,
    splitY,
    depth + 1,
  );
  const northEast = growAreaNetwork(
    seed ^ 0x85a3_08d3,
    buildable,
    splitX,
    minY,
    maxX,
    splitY,
    depth + 1,
  );
  const southWest = growAreaNetwork(
    seed ^ 0x1319_8a2e,
    buildable,
    minX,
    splitY,
    splitX,
    maxY,
    depth + 1,
  );
  const southEast = growAreaNetwork(
    seed ^ 0x0370_7344,
    buildable,
    splitX,
    splitY,
    maxX,
    maxY,
    depth + 1,
  );

  carveRoute(seed ^ 0xa409_3822, hub, northWest, buildable);
  carveRoute(seed ^ 0x299f_31d0, hub, northEast, buildable);
  carveRoute(seed ^ 0x082e_fa98, hub, southWest, buildable);
  carveRoute(seed ^ 0xec4e_6c89, hub, southEast, buildable);

  const linkChance = depth < 3 ? 75 : depth < 5 ? 38 : 18;
  const links = coordinateHash(seed ^ 0x4528_21e6, splitX, splitY);
  if (<i32>(links % 100) < linkChance) {
    carveRoute(seed ^ 0x38d0_1377, northWest, northEast, buildable);
  }
  if (<i32>((links >> 7) % 100) < linkChance) {
    carveRoute(seed ^ 0xbe54_66cf, northEast, southEast, buildable);
  }
  if (<i32>((links >> 14) % 100) < linkChance) {
    carveRoute(seed ^ 0x34e9_0c6c, southEast, southWest, buildable);
  }
  if (<i32>((links >> 21) % 100) < linkChance) {
    carveRoute(seed ^ 0xc0ac_29b7, southWest, northWest, buildable);
  }
  return hub;
}

function generateRoadNetwork(seed: u32): void {
  roadTiles = new StaticArray<u8>(TILE_COUNT);
  const buildable = createBuildableTerrain(seed);
  for (let tile = 0; tile < TILE_COUNT; tile += 1) {
    if (unchecked(buildable[tile]) != 0) {
      unchecked((roadTiles[tile] = BUILDABLE));
    }
  }
  growAreaNetwork(seed, buildable, 0, 0, GRID_SIZE, GRID_SIZE, 0);
}

function addRoutingNeighbor(
  current: u32,
  neighbor: u32,
  queue: StaticArray<u32>,
  tail: i32,
): i32 {
  if (
    (unchecked(roadTiles[<i32>neighbor]) & ROAD_MASK) == 0 ||
    unchecked(routeAncestors[<i32>neighbor]) != NO_TILE
  ) return tail;

  unchecked((routeAncestors[<i32>neighbor] = current));
  unchecked((
    routeDepth[<i32>neighbor] =
      unchecked(routeDepth[<i32>current]) + 1
  ));
  unchecked((queue[tail] = neighbor));
  return tail + 1;
}

function buildRoutingTree(): void {
  if (routeAncestors.length != TILE_COUNT) {
    routeAncestors = new StaticArray<u32>(TILE_COUNT);
    routeDepth = new StaticArray<u16>(TILE_COUNT);
    routingQueue = new StaticArray<u32>(TILE_COUNT);
  }
  const queue = routingQueue;

  let root = 0;
  while (
    root < TILE_COUNT &&
    (unchecked(roadTiles[root]) & ROAD_MASK) == 0
  ) root += 1;

  for (let tile = 0; tile < TILE_COUNT; tile += 1) {
    unchecked((routeAncestors[tile] = NO_TILE));
  }
  if (root == TILE_COUNT) return;

  let head = 0;
  let tail = 1;
  unchecked((routeAncestors[root] = <u32>root));
  unchecked((queue[0] = <u32>root));

  while (head < tail) {
    const tile = unchecked(queue[head++]);
    const mask = unchecked(roadTiles[<i32>tile]) & ROAD_MASK;
    if ((mask & NORTH) != 0) {
      tail = addRoutingNeighbor(
        tile,
        tile - <u32>GRID_SIZE,
        queue,
        tail,
      );
    }
    if ((mask & EAST) != 0) {
      tail = addRoutingNeighbor(tile, tile + 1, queue, tail);
    }
    if ((mask & SOUTH) != 0) {
      tail = addRoutingNeighbor(
        tile,
        tile + <u32>GRID_SIZE,
        queue,
        tail,
      );
    }
    if ((mask & WEST) != 0) {
      tail = addRoutingNeighbor(tile, tile - 1, queue, tail);
    }
  }

}

function setRegionalDirection(
  region: i32,
  tile: u32,
  direction: u8,
): void {
  const byteIndex =
    <i32>tile * REGION_ROUTE_STRIDE + region / 4;
  const shift = (region & 3) * 2;
  const previous = unchecked(regionalDirections[byteIndex]);
  const directionBits = <u8>directionIndex(direction);
  unchecked((
    regionalDirections[byteIndex] =
      (previous & <u8>~(<u8>3 << <u8>shift)) |
      (directionBits << <u8>shift)
  ));
}

function getRegionalDirection(region: i32, tile: u32): u8 {
  const byteIndex =
    <i32>tile * REGION_ROUTE_STRIDE + region / 4;
  const shift = (region & 3) * 2;
  return directionFromIndex(
    <i32>(
      (unchecked(regionalDirections[byteIndex]) >> <u8>shift) & 3
    ),
  );
}

function findRegionalHub(regionX: i32, regionY: i32): u32 {
  const cellSize = GRID_SIZE / REGION_AXIS;
  const minX = regionX * cellSize;
  const minY = regionY * cellSize;
  const maxX = regionX == REGION_AXIS - 1
    ? GRID_SIZE
    : minX + cellSize;
  const maxY = regionY == REGION_AXIS - 1
    ? GRID_SIZE
    : minY + cellSize;
  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;
  let best = NO_TILE;
  let bestDistance = 2_147_483_647;
  for (let y = minY; y < maxY; y += 1) {
    for (let x = minX; x < maxX; x += 1) {
      const tile = y * GRID_SIZE + x;
      if ((unchecked(roadTiles[tile]) & ROAD_MASK) == 0) continue;
      const distance = absolute(x - centerX) + absolute(y - centerY);
      if (distance < bestDistance) {
        best = <u32>tile;
        bestDistance = distance;
      }
    }
  }
  return best;
}

function addRegionalRouteNeighbor(
  region: i32,
  current: u32,
  neighbor: u32,
  directionTowardCurrent: u8,
  queue: StaticArray<u32>,
  visited: StaticArray<u16>,
  tail: i32,
): i32 {
  if (
    (unchecked(roadTiles[<i32>neighbor]) & ROAD_MASK) == 0 ||
    unchecked(visited[<i32>neighbor]) == <u16>(region + 1)
  ) return tail;
  unchecked((visited[<i32>neighbor] = <u16>(region + 1)));
  setRegionalDirection(region, neighbor, directionTowardCurrent);
  unchecked((queue[tail] = neighbor));
  return tail + 1;
}

function buildRegionalRoutes(): void {
  if (regionalHubs.length != REGION_COUNT) {
    regionalHubs = new StaticArray<u32>(REGION_COUNT);
    regionalDirections = new StaticArray<u8>(
      TILE_COUNT * REGION_ROUTE_STRIDE,
    );
    regionalVisited = new StaticArray<u16>(TILE_COUNT);
  }
  const queue = routingQueue;
  const visited = regionalVisited;
  for (let tile = 0; tile < TILE_COUNT; tile += 1) {
    unchecked((visited[tile] = 0));
  }

  for (let region = 0; region < REGION_COUNT; region += 1) {
    const hub = findRegionalHub(
      region % REGION_AXIS,
      region / REGION_AXIS,
    );
    unchecked((regionalHubs[region] = hub));
    if (hub == NO_TILE) continue;
    let head = 0;
    let tail = 1;
    unchecked((queue[0] = hub));
    unchecked((visited[<i32>hub] = <u16>(region + 1)));

    while (head < tail) {
      const current = unchecked(queue[head++]);
      const mask = unchecked(roadTiles[<i32>current]) & ROAD_MASK;
      if ((mask & NORTH) != 0) {
        tail = addRegionalRouteNeighbor(
          region,
          current,
          current - <u32>GRID_SIZE,
          SOUTH,
          queue,
          visited,
          tail,
        );
      }
      if ((mask & EAST) != 0) {
        tail = addRegionalRouteNeighbor(
          region,
          current,
          current + 1,
          WEST,
          queue,
          visited,
          tail,
        );
      }
      if ((mask & SOUTH) != 0) {
        tail = addRegionalRouteNeighbor(
          region,
          current,
          current + <u32>GRID_SIZE,
          NORTH,
          queue,
          visited,
          tail,
        );
      }
      if ((mask & WEST) != 0) {
        tail = addRegionalRouteNeighbor(
          region,
          current,
          current - 1,
          EAST,
          queue,
          visited,
          tail,
        );
      }
    }
  }
}

function liftRouteTile(tile: u32, distance: i32): u32 {
  let lifted = tile;
  for (let step = 0; step < distance; step += 1) {
    lifted = unchecked(routeAncestors[<i32>lifted]);
  }
  return lifted;
}

function routeLowestCommonAncestor(left: u32, right: u32): u32 {
  let a = left;
  let b = right;
  const leftDepth = <i32>unchecked(routeDepth[<i32>a]);
  const rightDepth = <i32>unchecked(routeDepth[<i32>b]);
  if (leftDepth > rightDepth) {
    a = liftRouteTile(a, leftDepth - rightDepth);
  } else if (rightDepth > leftDepth) {
    b = liftRouteTile(b, rightDepth - leftDepth);
  }
  if (a == b) return a;

  while (a != b) {
    a = unchecked(routeAncestors[<i32>a]);
    b = unchecked(routeAncestors[<i32>b]);
  }
  return a;
}

function nextRouteTile(current: u32, target: u32): u32 {
  if (current == target) return current;
  if (
    unchecked(routeAncestors[<i32>current]) == NO_TILE ||
    unchecked(routeAncestors[<i32>target]) == NO_TILE
  ) return current;

  const common = routeLowestCommonAncestor(current, target);
  if (common != current) {
    return unchecked(routeAncestors[<i32>current]);
  }
  const distance =
    <i32>unchecked(routeDepth[<i32>target]) -
    <i32>unchecked(routeDepth[<i32>current]) -
    1;
  return liftRouteTile(target, distance);
}

function roadDegreeMask(mask: u8): i32 {
  let degree = 0;
  if ((mask & NORTH) != 0) degree += 1;
  if ((mask & EAST) != 0) degree += 1;
  if ((mask & SOUTH) != 0) degree += 1;
  if ((mask & WEST) != 0) degree += 1;
  return degree;
}

function randomRoadTile(): u32 {
  let tile: u32;
  do {
    tile = nextRandom() % <u32>TILE_COUNT;
  } while ((unchecked(roadTiles[<i32>tile]) & ROAD_MASK) == 0);
  return tile;
}

function chooseDestinationRegion(origin: u32): i32 {
  const cellSize = GRID_SIZE / REGION_AXIS;
  const originX = <i32>(origin % <u32>GRID_SIZE) / cellSize;
  const originY = <i32>(origin / <u32>GRID_SIZE) / cellSize;
  const originRegion = originY * REGION_AXIS + originX;
  for (let attempt = 0; attempt < 16; attempt += 1) {
    let region: i32;
    const isGlobal = nextRandom() % 100 < 6;
    if (isGlobal) {
      region = <i32>(nextRandom() % <u32>REGION_COUNT);
    } else {
      let x = originX + <i32>(nextRandom() % 3) - 1;
      let y = originY + <i32>(nextRandom() % 3) - 1;
      if (x < 0) x = 0;
      else if (x >= REGION_AXIS) x = REGION_AXIS - 1;
      if (y < 0) y = 0;
      else if (y >= REGION_AXIS) y = REGION_AXIS - 1;
      region = y * REGION_AXIS + x;
    }
    const hub = unchecked(regionalHubs[region]);
    if (region == originRegion || hub == NO_TILE) continue;
    if (
      isGlobal ||
      absolute(<i32>(hub % <u32>GRID_SIZE) - <i32>(origin % <u32>GRID_SIZE)) +
        absolute(<i32>(hub / <u32>GRID_SIZE) - <i32>(origin / <u32>GRID_SIZE))
        <= 280
    ) return region;
  }
  return (originRegion + 1) % REGION_COUNT;
}

function chooseNewTarget(index: i32): void {
  const current =
    <u32>Mathf.floor(unchecked(carY[index])) * <u32>GRID_SIZE +
    <u32>Mathf.floor(unchecked(carX[index]));
  const region = chooseDestinationRegion(current);
  const target = unchecked(regionalHubs[region]);

  unchecked((carTargetRegion[index] = <u8>region));
  unchecked((carTargetX[index] = <u16>(target % <u32>GRID_SIZE)));
  unchecked((carTargetY[index] = <u16>(target / <u32>GRID_SIZE)));
}

function chooseQueuedTarget(index: i32): void {
  const current =
    <u32>unchecked(carTargetY[index]) * <u32>GRID_SIZE +
    <u32>unchecked(carTargetX[index]);
  const region = chooseDestinationRegion(current);
  const target = unchecked(regionalHubs[region]);
  unchecked((carNextTargetRegion[index] = <u8>region));
  unchecked((carNextTargetX[index] = <u16>(target % <u32>GRID_SIZE)));
  unchecked((carNextTargetY[index] = <u16>(target / <u32>GRID_SIZE)));
}

function advanceTarget(index: i32): void {
  unchecked((
    carTargetRegion[index] = unchecked(carNextTargetRegion[index])
  ));
  unchecked((carTargetX[index] = unchecked(carNextTargetX[index])));
  unchecked((carTargetY[index] = unchecked(carNextTargetY[index])));
  chooseQueuedTarget(index);
}

function supports(mask: u8, direction: u8): bool {
  return (mask & direction) != 0;
}

function oppositeDirection(direction: u8): u8 {
  if (direction == NORTH) return SOUTH;
  if (direction == EAST) return WEST;
  if (direction == SOUTH) return NORTH;
  if (direction == WEST) return EAST;
  return 0;
}

function absolute(value: i32): i32 {
  return value < 0 ? -value : value;
}

function routeScore(
  index: i32,
  x: i32,
  y: i32,
  targetX: i32,
  targetY: i32,
  direction: u8,
  currentDirection: u8,
): i32 {
  if (
    direction == oppositeDirection(currentDirection) &&
    roadDegreeMask(unchecked(roadTiles[y * GRID_SIZE + x])) > 1
  ) {
    return -2_147_483_647;
  }

  let nextX = x;
  let nextY = y;
  if (direction == NORTH) nextY -= 1;
  else if (direction == EAST) nextX += 1;
  else if (direction == SOUTH) nextY += 1;
  else nextX -= 1;

  const distance =
    absolute(targetX - nextX) + absolute(targetY - nextY);
  let score = -distance * 8;
  if (direction == currentDirection) score += 5;
  if (direction == oppositeDirection(currentDirection)) score -= 7;
  score += <i32>(
    coordinateHash(<u32>index ^ <u32>tick, nextX, nextY) % 5
  );
  return score;
}

function chooseDirectionAt(
  index: i32,
  x: i32,
  y: i32,
  targetX: i32,
  targetY: i32,
  currentDirection: u8,
): u8 {
  const mask = unchecked(roadTiles[y * GRID_SIZE + x]);
  const currentTile = <u32>(y * GRID_SIZE + x);
  const usesCurrentTarget =
    targetX == <i32>unchecked(carTargetX[index]) &&
    targetY == <i32>unchecked(carTargetY[index]);
  const region = usesCurrentTarget
    ? <i32>unchecked(carTargetRegion[index])
    : <i32>unchecked(carNextTargetRegion[index]);
  const regionalDirection = getRegionalDirection(region, currentTile);
  if ((mask & regionalDirection) != 0) return regionalDirection;
  const degree = roadDegreeMask(mask);
  if (degree <= 2) {
    if ((mask & currentDirection) != 0) return currentDirection;
    const reverse = oppositeDirection(currentDirection);
    if ((mask & NORTH) != 0 && NORTH != reverse) return NORTH;
    if ((mask & EAST) != 0 && EAST != reverse) return EAST;
    if ((mask & SOUTH) != 0 && SOUTH != reverse) return SOUTH;
    if ((mask & WEST) != 0 && WEST != reverse) return WEST;
    return reverse;
  }
  const targetTile = <u32>(targetY * GRID_SIZE + targetX);
  const routeTile = nextRouteTile(currentTile, targetTile);
  if (routeTile != currentTile) {
    let routeDirection: u8 = WEST;
    if (routeTile + <u32>GRID_SIZE == currentTile) {
      routeDirection = NORTH;
    } else if (routeTile == currentTile + 1) {
      routeDirection = EAST;
    } else if (routeTile == currentTile + <u32>GRID_SIZE) {
      routeDirection = SOUTH;
    }
    const reversingOnStraight =
      routeDirection == oppositeDirection(currentDirection) &&
      roadDegreeMask(mask) == 2 &&
      (mask & currentDirection) != 0;
    if (!reversingOnStraight) return routeDirection;
    return currentDirection;
  }
  let bestDirection: u8 = 0;
  let bestScore = -2_147_483_647;

  if (supports(mask, NORTH)) {
    const score = routeScore(
      index, x, y, targetX, targetY, NORTH, currentDirection,
    );
    if (score > bestScore) {
      bestScore = score;
      bestDirection = NORTH;
    }
  }
  if (supports(mask, EAST)) {
    const score = routeScore(
      index, x, y, targetX, targetY, EAST, currentDirection,
    );
    if (score > bestScore) {
      bestScore = score;
      bestDirection = EAST;
    }
  }
  if (supports(mask, SOUTH)) {
    const score = routeScore(
      index, x, y, targetX, targetY, SOUTH, currentDirection,
    );
    if (score > bestScore) {
      bestScore = score;
      bestDirection = SOUTH;
    }
  }
  if (supports(mask, WEST)) {
    const score = routeScore(
      index, x, y, targetX, targetY, WEST, currentDirection,
    );
    if (score > bestScore) {
      bestDirection = WEST;
    }
  }
  return bestDirection;
}

function selectDirection(index: i32): void {
  const x = <i32>Mathf.floor(unchecked(carX[index]));
  const y = <i32>Mathf.floor(unchecked(carY[index]));

  if (
    x == <i32>unchecked(carTargetX[index]) &&
    y == <i32>unchecked(carTargetY[index])
  ) {
    advanceTarget(index);
  }

  unchecked((
    carDirection[index] = chooseDirectionAt(
      index,
      x,
      y,
      <i32>unchecked(carTargetX[index]),
      <i32>unchecked(carTargetY[index]),
      unchecked(carDirection[index]),
    )
  ));
}

function directionIndex(direction: u8): i32 {
  if (direction == NORTH) return 0;
  if (direction == EAST) return 1;
  if (direction == SOUTH) return 2;
  return 3;
}

function segmentKey(tile: u32, direction: u8): i32 {
  return <i32>tile * 4 + directionIndex(direction);
}

function nextTileIndex(tile: u32, direction: u8): u32 {
  if (direction == NORTH) return tile - <u32>GRID_SIZE;
  if (direction == EAST) return tile + 1;
  if (direction == SOUTH) return tile + <u32>GRID_SIZE;
  return tile - 1;
}

function updateCarPosition(index: i32): void {
  const tile = unchecked(carSegment[index]);
  const progress = unchecked(carProgress[index]);
  let x = <f32>(tile % <u32>GRID_SIZE) + 0.5;
  let y = <f32>(tile / <u32>GRID_SIZE) + 0.5;
  const direction = unchecked(carDirection[index]);

  if (direction == NORTH) y -= progress;
  else if (direction == EAST) x += progress;
  else if (direction == SOUTH) y += progress;
  else x -= progress;

  unchecked((carX[index] = x));
  unchecked((carY[index] = y));
}

function advanceCar(index: i32, distance: f32): void {
  let remaining = distance;

  for (let transition = 0; transition < 4 && remaining > 0.0; transition += 1) {
    let progress = unchecked(carProgress[index]);
    const available: f32 = 1.0 - progress;
    const movement = Mathf.min(remaining, available);
    progress += movement;
    remaining -= movement;

    if (progress < 0.999_999) {
      unchecked((carProgress[index] = progress));
      updateCarPosition(index);
      return;
    }

    const destination = nextTileIndex(
      unchecked(carSegment[index]),
      unchecked(carDirection[index]),
    );
    unchecked((carSegment[index] = destination));
    unchecked((carProgress[index] = 0.0));
    unchecked((
      carX[index] = <f32>(destination % <u32>GRID_SIZE) + 0.5
    ));
    unchecked((
      carY[index] = <f32>(destination / <u32>GRID_SIZE) + 0.5
    ));
    selectDirection(index);
  }
}

function clearLaneBuckets(): void {
  for (let index = 0; index < touchedBucketCount; index += 1) {
    unchecked((bucketHead[<i32>unchecked(touchedBuckets[index])] = -1));
  }
  touchedBucketCount = 0;
}

function buildLaneBuckets(): void {
  clearLaneBuckets();
  for (let index = 0; index < carCount; index += 1) {
    const key = segmentKey(
      unchecked(carSegment[index]),
      unchecked(carDirection[index]),
    );
    const previous = unchecked(bucketHead[key]);
    if (previous == -1) {
      unchecked((touchedBuckets[touchedBucketCount] = <u32>key));
      touchedBucketCount += 1;
    }
    unchecked((bucketNext[index] = previous));
    unchecked((bucketHead[key] = index));
  }
}

function scanLaneBucket(
  key: i32,
  self: i32,
  minimumProgress: f32,
  baseDistance: f32,
  bestDistance: f32,
): f32 {
  let best = bestDistance;
  let candidate = unchecked(bucketHead[key]);
  while (candidate != -1) {
    if (candidate != self) {
      const candidateProgress = unchecked(carProgress[candidate]);
      if (candidateProgress + 0.000_1 >= minimumProgress) {
        const distance =
          baseDistance + candidateProgress - minimumProgress;
        if (distance < best) best = distance;
      }
    }
    candidate = unchecked(bucketNext[candidate]);
  }
  return best;
}

function findLeaderDistance(index: i32): f32 {
  const segment = unchecked(carSegment[index]);
  const direction = unchecked(carDirection[index]);
  const progress = unchecked(carProgress[index]);
  let best: f32 = 1_000.0;

  best = scanLaneBucket(
    segmentKey(segment, direction),
    index,
    progress,
    0.0,
    best,
  );

  let distance: f32 = 1.0 - progress;
  let tile = nextTileIndex(segment, direction);
  let predictedDirection = direction;
  let targetX = <i32>unchecked(carTargetX[index]);
  let targetY = <i32>unchecked(carTargetY[index]);
  let advancedTarget = false;

  for (let lookAhead = 0; lookAhead < 4 && distance < 4.0; lookAhead += 1) {
    const tileX = <i32>(tile % <u32>GRID_SIZE);
    const tileY = <i32>(tile / <u32>GRID_SIZE);
    if (tileX == targetX && tileY == targetY) {
      if (advancedTarget) break;
      targetX = <i32>unchecked(carNextTargetX[index]);
      targetY = <i32>unchecked(carNextTargetY[index]);
      advancedTarget = true;
    }

    predictedDirection = chooseDirectionAt(
      index,
      tileX,
      tileY,
      targetX,
      targetY,
      predictedDirection,
    );
    best = scanLaneBucket(
      segmentKey(tile, predictedDirection),
      index,
      0.0,
      distance,
      best,
    );
    tile = nextTileIndex(tile, predictedDirection);
    distance += 1.0;
  }
  return best;
}

function requiresReservation(tile: u32): bool {
  return roadDegreeMask(
    unchecked(roadTiles[<i32>tile]) & ROAD_MASK,
  ) >= 3;
}

function directionAfterEntering(
  index: i32,
  tile: u32,
  incomingDirection: u8,
): u8 {
  const tileX = <i32>(tile % <u32>GRID_SIZE);
  const tileY = <i32>(tile / <u32>GRID_SIZE);
  let targetX = <i32>unchecked(carTargetX[index]);
  let targetY = <i32>unchecked(carTargetY[index]);
  if (tileX == targetX && tileY == targetY) {
    targetX = <i32>unchecked(carNextTargetX[index]);
    targetY = <i32>unchecked(carNextTargetY[index]);
  }
  return chooseDirectionAt(
    index,
    tileX,
    tileY,
    targetX,
    targetY,
    incomingDirection,
  );
}

function junctionMovement(index: i32, junction: u32): u8 {
  const incoming = unchecked(carDirection[index]);
  const outgoing = directionAfterEntering(index, junction, incoming);
  return <u8>(directionIndex(incoming) * 4 + directionIndex(outgoing));
}

function movementIncoming(movement: u8): i32 {
  return <i32>movement / 4;
}

function movementOutgoing(movement: u8): i32 {
  return <i32>movement & 3;
}

function directionFromIndex(index: i32): u8 {
  if (index == 0) return NORTH;
  if (index == 1) return EAST;
  if (index == 2) return SOUTH;
  return WEST;
}

function movementsCompatible(left: u8, right: u8): bool {
  const leftIncoming = movementIncoming(left);
  const leftOutgoing = movementOutgoing(left);
  const rightIncoming = movementIncoming(right);
  const rightOutgoing = movementOutgoing(right);
  if (left == right) return true;
  if (
    leftIncoming == rightIncoming ||
    leftOutgoing == rightOutgoing
  ) return false;

  const reversePath =
    leftIncoming == ((rightOutgoing + 2) & 3) &&
    leftOutgoing == ((rightIncoming + 2) & 3);
  if (reversePath) return true;

  const leftTurn = (leftOutgoing - leftIncoming + 4) & 3;
  const rightTurn = (rightOutgoing - rightIncoming + 4) & 3;
  return leftTurn == 1 && rightTurn == 1;
}

function movementCompatibleWithMask(movement: u8, mask: u16): bool {
  for (let candidate = 0; candidate < 16; candidate += 1) {
    if (
      (mask & (<u16>1 << <u16>candidate)) != 0 &&
      !movementsCompatible(movement, <u8>candidate)
    ) return false;
  }
  return true;
}

function downstreamLeaderDistance(
  index: i32,
  junction: u32,
  outgoingDirection: u8,
): f32 {
  let best: f32 = 1_000.0;
  let tile = junction;
  let direction = outgoingDirection;
  let distance: f32 = 0.0;
  let targetX = <i32>unchecked(carTargetX[index]);
  let targetY = <i32>unchecked(carTargetY[index]);
  let advancedTarget = false;

  for (let lookAhead = 0; lookAhead < 4; lookAhead += 1) {
    best = scanLaneBucket(
      segmentKey(tile, direction),
      index,
      0.0,
      distance,
      best,
    );
    distance += 1.0;
    tile = nextTileIndex(tile, direction);
    const tileX = <i32>(tile % <u32>GRID_SIZE);
    const tileY = <i32>(tile / <u32>GRID_SIZE);
    if (tileX == targetX && tileY == targetY) {
      if (advancedTarget) break;
      targetX = <i32>unchecked(carNextTargetX[index]);
      targetY = <i32>unchecked(carNextTargetY[index]);
      advancedTarget = true;
    }
    direction = chooseDirectionAt(
      index,
      tileX,
      tileY,
      targetX,
      targetY,
      direction,
    );
  }
  return best;
}

function hasDownstreamSpace(
  index: i32,
  junction: u32,
  movement: u8,
): bool {
  const outgoing = directionFromIndex(movementOutgoing(movement));
  const leaderDistance = downstreamLeaderDistance(
    index,
    junction,
    outgoing,
  );
  return (
    leaderDistance >=
    JUNCTION_CLEARANCE +
      VEHICLE_LENGTH +
      MINIMUM_GAP +
      COLLISION_PADDING
  );
}

function reservationSlot(index: i32, offset: i32): i32 {
  return index * MAX_RESERVATION_TILES + offset;
}

function planReservationCorridor(
  index: i32,
  firstJunction: u32,
): i32 {
  let tile = firstJunction;
  let incoming = unchecked(carDirection[index]);
  let length = 0;
  let exitTile = firstJunction;

  while (
    length < MAX_RESERVATION_TILES &&
    requiresReservation(tile)
  ) {
    const outgoing = directionAfterEntering(index, tile, incoming);
    const movement = <u8>(
      directionIndex(incoming) * 4 + directionIndex(outgoing)
    );
    const slot = reservationSlot(index, length);
    unchecked((carPendingReservationTiles[slot] = tile));
    unchecked((carPendingReservationMovements[slot] = movement));
    length += 1;
    exitTile = nextTileIndex(tile, outgoing);
    tile = exitTile;
    incoming = outgoing;
  }

  if (requiresReservation(exitTile)) {
    unchecked((carPendingReservationLength[index] = 0));
    return 0;
  }
  unchecked((carPendingReservationLength[index] = <u8>length));
  unchecked((carPendingReservationExitTile[index] = exitTile));
  return length;
}

function pendingReservationIsCompatible(index: i32): bool {
  const length = <i32>unchecked(carPendingReservationLength[index]);
  for (let offset = 0; offset < length; offset += 1) {
    const slot = reservationSlot(index, offset);
    const tile = <i32>unchecked(carPendingReservationTiles[slot]);
    const movement = unchecked(carPendingReservationMovements[slot]);
    if (
      !movementCompatibleWithMask(
        movement,
        unchecked(junctionMovementMask[tile]),
      )
    ) return false;
  }
  return true;
}

function pendingReservationHasDownstreamSpace(index: i32): bool {
  const length = <i32>unchecked(carPendingReservationLength[index]);
  if (length == 0) return false;
  const slot = reservationSlot(index, length - 1);
  return hasDownstreamSpace(
    index,
    unchecked(carPendingReservationTiles[slot]),
    unchecked(carPendingReservationMovements[slot]),
  );
}

function addReservationMovement(tile: u32, movement: u8): void {
  touchJunction(tile);
  const tileIndex = <i32>tile;
  unchecked((
    junctionMovementMask[tileIndex] =
      unchecked(junctionMovementMask[tileIndex]) |
      (<u16>1 << <u16>movement)
  ));
}

function seedActiveReservation(index: i32): void {
  const length = <i32>unchecked(carReservationLength[index]);
  const currentTile = unchecked(carSegment[index]);
  let firstActive = 0;
  for (let offset = 0; offset < length; offset += 1) {
    const slot = reservationSlot(index, offset);
    if (unchecked(carReservationTiles[slot]) == currentTile) {
      firstActive = offset;
      if (unchecked(carProgress[index]) >= JUNCTION_CLEARANCE) {
        firstActive += 1;
      }
      break;
    }
  }
  for (let offset = firstActive; offset < length; offset += 1) {
    const slot = reservationSlot(index, offset);
    addReservationMovement(
      unchecked(carReservationTiles[slot]),
      unchecked(carReservationMovements[slot]),
    );
  }
}

function activatePendingReservation(index: i32): void {
  const length = <i32>unchecked(carPendingReservationLength[index]);
  unchecked((carReservationLength[index] = <u8>length));
  unchecked((
    carReservationExitTile[index] =
      unchecked(carPendingReservationExitTile[index])
  ));
  for (let offset = 0; offset < length; offset += 1) {
    const slot = reservationSlot(index, offset);
    const tile = unchecked(carPendingReservationTiles[slot]);
    const movement = unchecked(carPendingReservationMovements[slot]);
    unchecked((carReservationTiles[slot] = tile));
    unchecked((carReservationMovements[slot] = movement));
    addReservationMovement(tile, movement);
  }
  unchecked((
    carReservedJunction[index] =
      unchecked(carReservationTiles[reservationSlot(index, 0)])
  ));
  unchecked((carJunctionGranted[index] = 1));
}

function clearCarReservation(index: i32): void {
  unchecked((carReservationLength[index] = 0));
  unchecked((carReservedJunction[index] = NO_TILE));
  unchecked((carReservationExitTile[index] = NO_TILE));
  unchecked((carJunctionGranted[index] = 0));
}

function activeMovementForDestination(
  index: i32,
  destination: u32,
): u8 {
  const length = <i32>unchecked(carReservationLength[index]);
  for (let offset = 0; offset < length; offset += 1) {
    const slot = reservationSlot(index, offset);
    if (unchecked(carReservationTiles[slot]) == destination) {
      return unchecked(carReservationMovements[slot]);
    }
  }
  return NO_MOVEMENT;
}

function clearJunctionReservations(): void {
  for (let index = 0; index < touchedJunctionCount; index += 1) {
    const tile = <i32>unchecked(touchedJunctions[index]);
    unchecked((junctionOwner[tile] = -1));
    unchecked((junctionTouched[tile] = 0));
    unchecked((junctionMovementMask[tile] = 0));
  }
  touchedJunctionCount = 0;
}

function touchJunction(tile: u32): void {
  const tileIndex = <i32>tile;
  if (unchecked(junctionTouched[tileIndex]) == 0) {
    unchecked((touchedJunctions[touchedJunctionCount] = tile));
    touchedJunctionCount += 1;
    unchecked((junctionTouched[tileIndex] = 1));
  }
}

function computeProposedDistances(deltaSeconds: f32): void {
  for (let index = 0; index < carCount; index += 1) {
    const desiredSpeed = unchecked(carSpeed[index]);
    const leaderDistance = findLeaderDistance(index);
    const availableGap = Mathf.max(
      0.0,
      leaderDistance - VEHICLE_LENGTH - MINIMUM_GAP - COLLISION_PADDING,
    );
    const followingSpeed = availableGap / TIME_HEADWAY;
    const targetSpeed = Mathf.min(desiredSpeed, followingSpeed);
    let actualSpeed = unchecked(carActualSpeed[index]);

    if (targetSpeed > actualSpeed) {
      actualSpeed = Mathf.min(
        targetSpeed,
        actualSpeed + ACCELERATION * deltaSeconds,
      );
    } else {
      actualSpeed = Mathf.max(
        targetSpeed,
        actualSpeed - DECELERATION * deltaSeconds,
      );
    }

    let proposedDistance = actualSpeed * deltaSeconds;
    if (proposedDistance > availableGap) {
      proposedDistance = availableGap;
      actualSpeed = deltaSeconds > 0.0
        ? proposedDistance / deltaSeconds
        : 0.0;
    }
    unchecked((carActualSpeed[index] = actualSpeed));
    unchecked((carProposedDistance[index] = proposedDistance));
  }
}

function reserveJunctions(): void {
  clearJunctionReservations();
  junctionCandidateCount = 0;
  junctionGrantCount = 0;
  downstreamBlockedCount = 0;

  for (let index = 0; index < carCount; index += 1) {
    unchecked((carPendingMovement[index] = NO_MOVEMENT));
    unchecked((carPendingReservationLength[index] = 0));
    const tile = unchecked(carSegment[index]);
    if (unchecked(carReservationLength[index]) != 0) {
      if (tile == unchecked(carReservationExitTile[index])) {
        clearCarReservation(index);
      } else {
        unchecked((carJunctionGranted[index] = 1));
        seedActiveReservation(index);
        continue;
      }
    } else {
      unchecked((carJunctionGranted[index] = 0));
    }
    if (
      requiresReservation(tile) &&
      unchecked(carProgress[index]) < JUNCTION_CLEARANCE
    ) {
      touchJunction(tile);
      let movement = unchecked(carJunctionMovement[index]);
      if (movement == NO_MOVEMENT) {
        const direction = unchecked(carDirection[index]);
        movement = <u8>(
          directionIndex(direction) * 4 + directionIndex(direction)
        );
      }
      const tileIndex = <i32>tile;
      addReservationMovement(<u32>tileIndex, movement);
    }
  }

  for (let index = 0; index < carCount; index += 1) {
    const destination = nextTileIndex(
      unchecked(carSegment[index]),
      unchecked(carDirection[index]),
    );
    if (!requiresReservation(destination)) continue;

    const distanceToJunction = 1.0 - unchecked(carProgress[index]);
    if (
      unchecked(carProposedDistance[index]) <
      distanceToJunction - STOP_LINE_DISTANCE
    ) {
      continue;
    }

    if (unchecked(carReservationLength[index]) != 0) {
      const movement = activeMovementForDestination(index, destination);
      unchecked((carPendingMovement[index] = movement));
      unchecked((carJunctionGranted[index] = 1));
      continue;
    }

    const corridorLength = planReservationCorridor(index, destination);
    if (corridorLength == 0) {
      downstreamBlockedCount += 1;
      continue;
    }
    const firstSlot = reservationSlot(index, 0);
    const movement = unchecked(carPendingReservationMovements[firstSlot]);
    unchecked((carPendingMovement[index] = movement));
    junctionCandidateCount += 1;
    if (!pendingReservationHasDownstreamSpace(index)) {
      downstreamBlockedCount += 1;
      continue;
    }

    touchJunction(destination);
    const tileIndex = <i32>destination;
    unchecked((
      junctionCandidateNext[index] = unchecked(junctionOwner[tileIndex])
    ));
    unchecked((junctionOwner[tileIndex] = index));
  }

  const junctionsToProcess = touchedJunctionCount;
  const processOffset = junctionsToProcess == 0
    ? 0
    : tick % junctionsToProcess;
  for (let processed = 0; processed < junctionsToProcess; processed += 1) {
    const touchedIndex = (processOffset + processed) % junctionsToProcess;
    const tile = <i32>unchecked(touchedJunctions[touchedIndex]);
    let movementMask = unchecked(junctionMovementMask[tile]);
    let usedApproaches: u8 = 0;

    for (let grant = 0; grant < 4; grant += 1) {
      let best = -1;
      let bestWait: u16 = 0;
      let candidate = unchecked(junctionOwner[tile]);
      while (candidate != -1) {
        const movement = unchecked(carPendingMovement[candidate]);
        const approachBit =
          <u8>1 << <u8>movementIncoming(movement);
        const wait = unchecked(carWaitTicks[candidate]);
        if (
          unchecked(carJunctionGranted[candidate]) == 0 &&
          (usedApproaches & approachBit) == 0 &&
          pendingReservationIsCompatible(candidate) &&
          (best == -1 || wait > bestWait || (
            wait == bestWait && candidate < best
          ))
        ) {
          best = candidate;
          bestWait = wait;
        }
        candidate = unchecked(junctionCandidateNext[candidate]);
      }
      if (best == -1) break;

      const movement = unchecked(carPendingMovement[best]);
      activatePendingReservation(best);
      junctionGrantCount += 1;
      movementMask = unchecked(junctionMovementMask[tile]);
      usedApproaches |= <u8>1 << <u8>movementIncoming(movement);
    }
    unchecked((junctionMovementMask[tile] = movementMask));
  }
}

function applyTrafficStep(deltaSeconds: f32): void {
  buildLaneBuckets();
  computeProposedDistances(deltaSeconds);
  reserveJunctions();

  for (let index = 0; index < carCount; index += 1) {
    const destination = nextTileIndex(
      unchecked(carSegment[index]),
      unchecked(carDirection[index]),
    );
    let proposedDistance = unchecked(carProposedDistance[index]);

    if (requiresReservation(destination)) {
      const distanceToStopLine: f32 =
        1.0 - unchecked(carProgress[index]) - STOP_LINE_DISTANCE;
      if (
        proposedDistance >= distanceToStopLine &&
        unchecked(carJunctionGranted[index]) == 0
      ) {
        proposedDistance = Mathf.max(0.0, distanceToStopLine);
        unchecked((
          carActualSpeed[index] = deltaSeconds > 0.0
            ? proposedDistance / deltaSeconds
            : 0.0
        ));
        const waitTicks = unchecked(carWaitTicks[index]);
        unchecked((
          carWaitTicks[index] = waitTicks == <u16>65_535
            ? waitTicks
            : waitTicks + 1
        ));
      } else {
        unchecked((carWaitTicks[index] = 0));
        const movement = unchecked(carPendingMovement[index]);
        if (movement != NO_MOVEMENT) {
          unchecked((carJunctionMovement[index] = movement));
        }
      }
    } else {
      unchecked((carWaitTicks[index] = 0));
    }

    advanceCar(index, proposedDistance);
  }
}

function spawnCar(index: i32): void {
  while (true) {
    const tile = randomRoadTile();
    if (unchecked(junctionOwner[<i32>tile]) != -1) continue;
    const x = <u16>(tile % <u32>GRID_SIZE);
    const y = <u16>(tile / <u32>GRID_SIZE);

    unchecked((carX[index] = <f32>x + 0.5));
    unchecked((carY[index] = <f32>y + 0.5));
    unchecked((carSegment[index] = tile));
    unchecked((carProgress[index] = 0.0));
    unchecked((carDirection[index] = 0));
    unchecked((carWaitTicks[index] = 0));
    unchecked((carJunctionGranted[index] = 0));
    unchecked((carJunctionMovement[index] = NO_MOVEMENT));
    unchecked((carPendingMovement[index] = NO_MOVEMENT));
    unchecked((carReservedJunction[index] = NO_TILE));
    unchecked((carReservationLength[index] = 0));
    unchecked((carPendingReservationLength[index] = 0));
    unchecked((carReservationExitTile[index] = NO_TILE));
    unchecked((carPendingReservationExitTile[index] = NO_TILE));
    chooseNewTarget(index);
    chooseQueuedTarget(index);
    selectDirection(index);
    unchecked((junctionOwner[<i32>tile] = index));
    touchJunction(tile);
    break;
  }

  const desiredSpeed: f32 = 2.0 + randomUnit() * 6.0;
  unchecked((carSpeed[index] = desiredSpeed));
  unchecked((carActualSpeed[index] = desiredSpeed));
  unchecked((carProposedDistance[index] = 0.0));
}

export function initialize(seed: u32, requestedCarCount: i32): void {
  randomState = seed == 0 ? 1 : seed;
  carCapacity = requestedCarCount < 0
    ? 0
    : requestedCarCount > MAX_CARS
      ? MAX_CARS
      : requestedCarCount;
  carCount = carCapacity;
  tick = 0;

  generateRoadNetwork(randomState);
  buildRoutingTree();
  buildRegionalRoutes();
  carX = new StaticArray<f32>(carCapacity);
  carY = new StaticArray<f32>(carCapacity);
  carSpeed = new StaticArray<f32>(carCapacity);
  carTargetX = new StaticArray<u16>(carCapacity);
  carTargetY = new StaticArray<u16>(carCapacity);
  carNextTargetX = new StaticArray<u16>(carCapacity);
  carNextTargetY = new StaticArray<u16>(carCapacity);
  carDirection = new StaticArray<u8>(carCapacity);
  carActualSpeed = new StaticArray<f32>(carCapacity);
  carSegment = new StaticArray<u32>(carCapacity);
  carProgress = new StaticArray<f32>(carCapacity);
  carProposedDistance = new StaticArray<f32>(carCapacity);
  carWaitTicks = new StaticArray<u16>(carCapacity);
  carJunctionGranted = new StaticArray<u8>(carCapacity);
  carJunctionMovement = new StaticArray<u8>(carCapacity);
  carPendingMovement = new StaticArray<u8>(carCapacity);
  carReservedJunction = new StaticArray<u32>(carCapacity);
  carReservationLength = new StaticArray<u8>(carCapacity);
  carReservationTiles = new StaticArray<u32>(
    carCapacity * MAX_RESERVATION_TILES,
  );
  carReservationMovements = new StaticArray<u8>(
    carCapacity * MAX_RESERVATION_TILES,
  );
  carReservationExitTile = new StaticArray<u32>(carCapacity);
  carPendingReservationLength = new StaticArray<u8>(carCapacity);
  carPendingReservationTiles = new StaticArray<u32>(
    carCapacity * MAX_RESERVATION_TILES,
  );
  carPendingReservationMovements = new StaticArray<u8>(
    carCapacity * MAX_RESERVATION_TILES,
  );
  carPendingReservationExitTile = new StaticArray<u32>(carCapacity);
  carTargetRegion = new StaticArray<u8>(carCapacity);
  carNextTargetRegion = new StaticArray<u8>(carCapacity);

  bucketHead = new StaticArray<i32>(SEGMENT_BUCKET_COUNT);
  bucketNext = new StaticArray<i32>(carCapacity);
  touchedBuckets = new StaticArray<u32>(carCapacity);
  touchedBucketCount = 0;
  for (let index = 0; index < SEGMENT_BUCKET_COUNT; index += 1) {
    unchecked((bucketHead[index] = -1));
  }

  junctionOwner = new StaticArray<i32>(TILE_COUNT);
  junctionTouched = new StaticArray<u8>(TILE_COUNT);
  junctionMovementMask = new StaticArray<u16>(TILE_COUNT);
  junctionCandidateNext = new StaticArray<i32>(carCapacity);
  touchedJunctions = new StaticArray<u32>(carCapacity);
  touchedJunctionCount = 0;
  for (let index = 0; index < TILE_COUNT; index += 1) {
    unchecked((junctionOwner[index] = -1));
  }

  for (let index = 0; index < carCount; index += 1) {
    spawnCar(index);
  }
  clearJunctionReservations();
}

export function step(deltaSeconds: f32): void {
  let remaining = Mathf.max(0.0, Mathf.min(0.25, deltaSeconds));
  while (remaining > 0.0) {
    const substep = Mathf.min(1.0 / 30.0, remaining);
    applyTrafficStep(substep);
    remaining -= substep;
  }
  tick += 1;
}

export function isRoad(x: i32, y: i32): i32 {
  return (
    x >= 0 &&
    x < GRID_SIZE &&
    y >= 0 &&
    y < GRID_SIZE &&
    (unchecked(roadTiles[y * GRID_SIZE + x]) & ROAD_MASK) != 0
  ) ? 1 : 0;
}

export function getRoadTile(x: i32, y: i32): i32 {
  if (x < 0 || x >= GRID_SIZE || y < 0 || y >= GRID_SIZE) return 0;
  return <i32>unchecked(roadTiles[y * GRID_SIZE + x]);
}

export function getNextRouteTile(current: i32, target: i32): i32 {
  if (
    current < 0 ||
    current >= TILE_COUNT ||
    target < 0 ||
    target >= TILE_COUNT
  ) return -1;
  return <i32>nextRouteTile(<u32>current, <u32>target);
}

export function getGridSize(): i32 {
  return GRID_SIZE;
}

export function getRoadTileCount(): i32 {
  return TILE_COUNT;
}

export function getCarCount(): i32 {
  return carCount;
}

export function getCarCapacity(): i32 {
  return carCapacity;
}

export function setActiveCarCount(requestedCarCount: i32): i32 {
  const target = requestedCarCount < 0
    ? 0
    : requestedCarCount > carCapacity
      ? carCapacity
      : requestedCarCount;
  if (target == carCount) return carCount;

  clearJunctionReservations();
  if (target > carCount) {
    for (let index = 0; index < carCount; index += 1) {
      const tile = unchecked(carSegment[index]);
      const tileIndex = <i32>tile;
      if (unchecked(junctionOwner[tileIndex]) == -1) {
        unchecked((junctionOwner[tileIndex] = index));
        touchJunction(tile);
      }
    }
    for (let index = carCount; index < target; index += 1) {
      spawnCar(index);
    }
  }
  carCount = target;
  clearJunctionReservations();
  return carCount;
}

export function getTick(): i32 {
  return tick;
}

export function getJunctionCandidateCount(): i32 {
  return junctionCandidateCount;
}

export function getJunctionGrantCount(): i32 {
  return junctionGrantCount;
}

export function getDownstreamBlockedCount(): i32 {
  return downstreamBlockedCount;
}

export function getCarReservationLengthPointer(): usize {
  return changetype<usize>(carReservationLength);
}

export function getRoadTilePointer(): usize {
  return changetype<usize>(roadTiles);
}

export function getCarXPointer(): usize {
  return changetype<usize>(carX);
}

export function getCarYPointer(): usize {
  return changetype<usize>(carY);
}

export function getCarSpeedPointer(): usize {
  return changetype<usize>(carSpeed);
}

export function getCarTargetXPointer(): usize {
  return changetype<usize>(carTargetX);
}

export function getCarTargetYPointer(): usize {
  return changetype<usize>(carTargetY);
}

export function getCarDirectionPointer(): usize {
  return changetype<usize>(carDirection);
}

export function getCarActualSpeedPointer(): usize {
  return changetype<usize>(carActualSpeed);
}

export function getCarSegmentPointer(): usize {
  return changetype<usize>(carSegment);
}

export function getCarProgressPointer(): usize {
  return changetype<usize>(carProgress);
}

export function getVehicleLength(): f32 {
  return VEHICLE_LENGTH;
}

export function getMinimumGap(): f32 {
  return MINIMUM_GAP;
}
