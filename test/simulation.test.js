import assert from "node:assert/strict";
import test from "node:test";

import { loadSimulation } from "./wasm-helper.js";

const GRID_SIZE = 1_000;
const CAR_COUNT = 100_000;
const TILE_COUNT = GRID_SIZE * GRID_SIZE;
const NORTH = 1;
const EAST = 2;
const SOUTH = 4;
const WEST = 8;
const ROAD_MASK = 15;
const BUILDABLE = 16;

test("the WASM core creates the specified world and car population", async () => {
  const simulation = await loadSimulation();

  simulation.initialize(42, CAR_COUNT);

  assert.equal(simulation.getGridSize(), GRID_SIZE);
  assert.equal(simulation.getRoadTileCount(), TILE_COUNT);
  assert.equal(simulation.getCarCount(), CAR_COUNT);
});

test("the WASM core safely removes and respawns active cars", async () => {
  const simulation = await loadSimulation();
  simulation.initialize(19, 20_000);
  assert.equal(typeof simulation.setActiveCarCount, "function");
  assert.equal(simulation.getCarCapacity(), 20_000);

  simulation.setActiveCarCount(10_000);
  assert.equal(simulation.getCarCount(), 10_000);
  simulation.step(1 / 30);

  simulation.setActiveCarCount(20_000);
  assert.equal(simulation.getCarCount(), 20_000);
  const x = new Float32Array(
    simulation.memory.buffer,
    simulation.getCarXPointer(),
    20_000,
  );
  const y = new Float32Array(
    simulation.memory.buffer,
    simulation.getCarYPointer(),
    20_000,
  );
  for (let index = 10_000; index < 20_000; index += 499) {
    assert.equal(
      simulation.isRoad(Math.floor(x[index]), Math.floor(y[index])),
      1,
    );
  }
});

test("layered terrain creates clustered non-buildable islands", async () => {
  const simulation = await loadSimulation();
  simulation.initialize(42, 0);
  const tiles = new Uint8Array(
    simulation.memory.buffer,
    simulation.getRoadTilePointer(),
    TILE_COUNT,
  );
  let nonBuildable = 0;
  let clustered = 0;

  for (let y = 0; y < GRID_SIZE; y += 1) {
    for (let x = 0; x < GRID_SIZE; x += 1) {
      const index = y * GRID_SIZE + x;
      if ((tiles[index] & BUILDABLE) !== 0) continue;
      nonBuildable += 1;
      let blockedNeighbors = 0;
      if (x > 0 && (tiles[index - 1] & BUILDABLE) === 0) {
        blockedNeighbors += 1;
      }
      if (
        x + 1 < GRID_SIZE &&
        (tiles[index + 1] & BUILDABLE) === 0
      ) {
        blockedNeighbors += 1;
      }
      if (
        y > 0 &&
        (tiles[index - GRID_SIZE] & BUILDABLE) === 0
      ) {
        blockedNeighbors += 1;
      }
      if (
        y + 1 < GRID_SIZE &&
        (tiles[index + GRID_SIZE] & BUILDABLE) === 0
      ) {
        blockedNeighbors += 1;
      }
      if (blockedNeighbors >= 2) clustered += 1;
    }
  }

  const nonBuildableRatio = nonBuildable / TILE_COUNT;
  assert.ok(nonBuildableRatio >= 0.18 && nonBuildableRatio <= 0.23);
  assert.ok(clustered / nonBuildable > 0.9);
});

test("hierarchical roads are sparse, branching, and reciprocal", async () => {
  const simulation = await loadSimulation();
  simulation.initialize(42, 0);
  const tiles = new Uint8Array(
    simulation.memory.buffer,
    simulation.getRoadTilePointer(),
    TILE_COUNT,
  );
  const allowedMasks = new Set([
    0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15,
  ]);
  const shapeCounts = {
    corner: 0,
    crossing: 0,
    endpoint: 0,
    straight: 0,
    t: 0,
  };
  let horizontalEdges = 0;
  let roadCount = 0;
  let terrainOnlyCount = 0;
  let verticalEdges = 0;

  for (let y = 0; y < GRID_SIZE; y += 1) {
    for (let x = 0; x < GRID_SIZE; x += 1) {
      const index = y * GRID_SIZE + x;
      const tile = tiles[index];
      const mask = tile & ROAD_MASK;
      assert.ok(allowedMasks.has(mask), `invalid tile mask ${mask} at ${x},${y}`);
      assert.equal(tile & ~(ROAD_MASK | BUILDABLE), 0);
      if (mask !== 0) {
        roadCount += 1;
        assert.notEqual(tile & BUILDABLE, 0);
      } else if ((tile & BUILDABLE) !== 0) {
        terrainOnlyCount += 1;
      }
      assert.equal(x === 0 && (mask & WEST) !== 0, false);
      assert.equal(x === GRID_SIZE - 1 && (mask & EAST) !== 0, false);
      assert.equal(y === 0 && (mask & NORTH) !== 0, false);
      assert.equal(y === GRID_SIZE - 1 && (mask & SOUTH) !== 0, false);

      if (x + 1 < GRID_SIZE) {
        assert.equal((mask & EAST) !== 0, (tiles[index + 1] & WEST) !== 0);
        if ((mask & EAST) !== 0) horizontalEdges += 1;
      }
      if (y + 1 < GRID_SIZE) {
        assert.equal(
          (mask & SOUTH) !== 0,
          (tiles[index + GRID_SIZE] & NORTH) !== 0,
        );
        if ((mask & SOUTH) !== 0) verticalEdges += 1;
      }

      if (mask === 0) continue;
      const degree =
        Number((mask & NORTH) !== 0) +
        Number((mask & EAST) !== 0) +
        Number((mask & SOUTH) !== 0) +
        Number((mask & WEST) !== 0);
      if (degree === 1) shapeCounts.endpoint += 1;
      else if (degree === 4) shapeCounts.crossing += 1;
      else if (degree === 3) shapeCounts.t += 1;
      else if (mask === 5 || mask === 10) shapeCounts.straight += 1;
      else shapeCounts.corner += 1;
    }
  }

  assert.ok(roadCount >= CAR_COUNT + 5_000);
  assert.ok(roadCount / TILE_COUNT < 0.25);
  assert.ok(terrainOnlyCount > 500_000);
  assert.ok(shapeCounts.endpoint > 100);
  assert.ok(shapeCounts.corner > 1_000);
  assert.ok(shapeCounts.crossing > 10);
  assert.ok(shapeCounts.straight > 20_000);
  assert.ok(shapeCounts.t > 500);
  assert.ok(horizontalEdges / verticalEdges > 0.7);
  assert.ok(horizontalEdges / verticalEdges < 1.3);
  assert.equal(simulation.isRoad(0, 0), Number((tiles[0] & ROAD_MASK) !== 0));
  assert.equal(
    simulation.isRoad(537, 912),
    Number((tiles[912 * GRID_SIZE + 537] & ROAD_MASK) !== 0),
  );
  assert.equal(simulation.isRoad(-1, 0), 0);
  assert.equal(simulation.isRoad(GRID_SIZE, 0), 0);
});

test("the sparse hierarchy reaches every major area", async () => {
  const simulation = await loadSimulation();
  simulation.initialize(42, 0);
  const tiles = new Uint8Array(
    simulation.memory.buffer,
    simulation.getRoadTilePointer(),
    TILE_COUNT,
  );
  const blockSize = 100;
  let reachedAreas = 0;

  for (let blockY = 0; blockY < GRID_SIZE; blockY += blockSize) {
    for (let blockX = 0; blockX < GRID_SIZE; blockX += blockSize) {
      let roads = 0;
      for (let y = blockY; y < blockY + blockSize; y += 1) {
        for (let x = blockX; x < blockX + blockSize; x += 1) {
          const index = y * GRID_SIZE + x;
          if ((tiles[index] & ROAD_MASK) !== 0) roads += 1;
        }
      }
      if (roads >= 100) reachedAreas += 1;
    }
  }

  assert.ok(reachedAreas >= 90);
});

test("all road tiles belong to one connected network", async () => {
  const simulation = await loadSimulation();
  simulation.initialize(101, 0);
  const tiles = new Uint8Array(
    simulation.memory.buffer,
    simulation.getRoadTilePointer(),
    TILE_COUNT,
  );
  const visited = new Uint8Array(TILE_COUNT);
  const queue = new Int32Array(TILE_COUNT);
  let head = 0;
  let tail = 1;
  let reached = 0;
  const firstRoad = tiles.findIndex((mask) => (mask & ROAD_MASK) !== 0);
  assert.ok(firstRoad >= 0);
  queue[0] = firstRoad;
  visited[firstRoad] = 1;

  while (head < tail) {
    const index = queue[head];
    head += 1;
    reached += 1;
    const mask = tiles[index] & ROAD_MASK;
    const x = index % GRID_SIZE;
    const neighbors = [];
    if ((mask & NORTH) !== 0) neighbors.push(index - GRID_SIZE);
    if ((mask & EAST) !== 0) neighbors.push(index + 1);
    if ((mask & SOUTH) !== 0) neighbors.push(index + GRID_SIZE);
    if ((mask & WEST) !== 0) neighbors.push(index - 1);
    for (const neighbor of neighbors) {
      if (neighbor >= 0 && neighbor < TILE_COUNT && visited[neighbor] === 0) {
        visited[neighbor] = 1;
        queue[tail] = neighbor;
        tail += 1;
      }
    }
    assert.ok(x >= 0);
  }

  const roadCount = tiles.reduce(
    (count, mask) => count + Number((mask & ROAD_MASK) !== 0),
    0,
  );
  assert.equal(reached, roadCount);
});

test("topology routing reaches arbitrary road destinations", async () => {
  const simulation = await loadSimulation();
  simulation.initialize(314, 0);
  assert.equal(typeof simulation.getNextRouteTile, "function");
  const tiles = new Uint8Array(
    simulation.memory.buffer,
    simulation.getRoadTilePointer(),
    TILE_COUNT,
  );
  const roadTiles = [];
  for (let tile = 0; tile < TILE_COUNT; tile += 1) {
    if ((tiles[tile] & ROAD_MASK) !== 0) roadTiles.push(tile);
  }

  for (let sample = 1; sample <= 64; sample += 1) {
    let current = roadTiles[(sample * 1_547) % roadTiles.length];
    const target = roadTiles[(sample * 7_919 + 101) % roadTiles.length];
    for (let hop = 0; hop < 5_000 && current !== target; hop += 1) {
      const next = simulation.getNextRouteTile(current, target);
      assert.notEqual(next, current);
      assert.ok((tiles[next] & ROAD_MASK) !== 0);
      current = next;
    }
    assert.equal(current, target);
  }
});

test("cars have compact, valid, individual state", async () => {
  const simulation = await loadSimulation();
  simulation.initialize(7, CAR_COUNT);

  const memory = simulation.memory;
  const x = new Float32Array(
    memory.buffer,
    simulation.getCarXPointer(),
    CAR_COUNT,
  );
  const y = new Float32Array(
    memory.buffer,
    simulation.getCarYPointer(),
    CAR_COUNT,
  );
  const speeds = new Float32Array(
    memory.buffer,
    simulation.getCarSpeedPointer(),
    CAR_COUNT,
  );
  const targetsX = new Uint16Array(
    memory.buffer,
    simulation.getCarTargetXPointer(),
    CAR_COUNT,
  );
  const targetsY = new Uint16Array(
    memory.buffer,
    simulation.getCarTargetYPointer(),
    CAR_COUNT,
  );

  for (let index = 0; index < CAR_COUNT; index += 997) {
    assert.ok(x[index] >= 0 && x[index] < GRID_SIZE);
    assert.ok(y[index] >= 0 && y[index] < GRID_SIZE);
    assert.ok(simulation.isRoad(Math.floor(x[index]), Math.floor(y[index])));
    assert.ok(speeds[index] >= 2 && speeds[index] <= 8);
    assert.ok(targetsX[index] >= 0 && targetsX[index] < GRID_SIZE);
    assert.ok(targetsY[index] >= 0 && targetsY[index] < GRID_SIZE);
    assert.ok(simulation.isRoad(targetsX[index], targetsY[index]));
  }

  assert.notEqual(speeds[0], speeds[1]);
});

test("trip demand is predominantly regional instead of map-wide", async () => {
  const simulation = await loadSimulation();
  simulation.initialize(71, CAR_COUNT);
  const x = new Float32Array(
    simulation.memory.buffer,
    simulation.getCarXPointer(),
    CAR_COUNT,
  );
  const y = new Float32Array(
    simulation.memory.buffer,
    simulation.getCarYPointer(),
    CAR_COUNT,
  );
  const targetsX = new Uint16Array(
    simulation.memory.buffer,
    simulation.getCarTargetXPointer(),
    CAR_COUNT,
  );
  const targetsY = new Uint16Array(
    simulation.memory.buffer,
    simulation.getCarTargetYPointer(),
    CAR_COUNT,
  );
  let regional = 0;
  let interArea = 0;
  for (let index = 0; index < CAR_COUNT; index += 1) {
    const distance =
      Math.abs(targetsX[index] - Math.floor(x[index])) +
      Math.abs(targetsY[index] - Math.floor(y[index]));
    if (distance <= 280) regional += 1;
    if (distance >= 80) interArea += 1;
  }
  assert.ok(regional / CAR_COUNT > 0.9);
  assert.ok(interArea / CAR_COUNT > 0.15);
});

test("regional activity centers distribute routes across the hierarchy", async () => {
  const simulation = await loadSimulation();
  simulation.initialize(83, CAR_COUNT);
  const targetsX = new Uint16Array(
    simulation.memory.buffer,
    simulation.getCarTargetXPointer(),
    CAR_COUNT,
  );
  const targetsY = new Uint16Array(
    simulation.memory.buffer,
    simulation.getCarTargetYPointer(),
    CAR_COUNT,
  );
  const destinations = new Set();
  for (let index = 0; index < CAR_COUNT; index += 1) {
    destinations.add(targetsY[index] * GRID_SIZE + targetsX[index]);
  }
  assert.ok(destinations.size >= 192);
  assert.ok(destinations.size <= 256);
});

test("cars expose legal travel directions across both lanes", async () => {
  const simulation = await loadSimulation();
  simulation.initialize(73, CAR_COUNT);
  const tiles = new Uint8Array(
    simulation.memory.buffer,
    simulation.getRoadTilePointer(),
    TILE_COUNT,
  );
  const x = new Float32Array(
    simulation.memory.buffer,
    simulation.getCarXPointer(),
    CAR_COUNT,
  );
  const y = new Float32Array(
    simulation.memory.buffer,
    simulation.getCarYPointer(),
    CAR_COUNT,
  );
  const directions = new Uint8Array(
    simulation.memory.buffer,
    simulation.getCarDirectionPointer(),
    CAR_COUNT,
  );
  const directionCounts = new Map([
    [NORTH, 0],
    [EAST, 0],
    [SOUTH, 0],
    [WEST, 0],
  ]);

  for (let index = 0; index < CAR_COUNT; index += 1) {
    const direction = directions[index];
    const tile = tiles[Math.floor(y[index]) * GRID_SIZE + Math.floor(x[index])];
    assert.ok((tile & direction) !== 0);
    directionCounts.set(direction, (directionCounts.get(direction) ?? 0) + 1);
  }

  for (const count of directionCounts.values()) {
    assert.ok(count > 1_000);
  }
});

test("initial placement never stacks cars on the same tile", async () => {
  const simulation = await loadSimulation();
  simulation.initialize(404, CAR_COUNT);
  const x = new Float32Array(
    simulation.memory.buffer,
    simulation.getCarXPointer(),
    CAR_COUNT,
  );
  const y = new Float32Array(
    simulation.memory.buffer,
    simulation.getCarYPointer(),
    CAR_COUNT,
  );
  const occupiedTiles = new Set();

  for (let index = 0; index < CAR_COUNT; index += 1) {
    occupiedTiles.add(Math.floor(y[index]) * GRID_SIZE + Math.floor(x[index]));
  }

  assert.equal(occupiedTiles.size, CAR_COUNT);
});

test("lane buckets preserve minimum headway and reduce actual speed", async () => {
  const simulation = await loadSimulation();
  simulation.initialize(808, CAR_COUNT);
  const directions = new Uint8Array(
    simulation.memory.buffer,
    simulation.getCarDirectionPointer(),
    CAR_COUNT,
  );
  const desiredSpeeds = new Float32Array(
    simulation.memory.buffer,
    simulation.getCarSpeedPointer(),
    CAR_COUNT,
  );
  const actualSpeeds = new Float32Array(
    simulation.memory.buffer,
    simulation.getCarActualSpeedPointer(),
    CAR_COUNT,
  );
  const segments = new Uint32Array(
    simulation.memory.buffer,
    simulation.getCarSegmentPointer(),
    CAR_COUNT,
  );
  const progress = new Float32Array(
    simulation.memory.buffer,
    simulation.getCarProgressPointer(),
    CAR_COUNT,
  );
  const roadTiles = new Uint8Array(
    simulation.memory.buffer,
    simulation.getRoadTilePointer(),
    TILE_COUNT,
  );
  const minimumCenterGap =
    simulation.getVehicleLength() + simulation.getMinimumGap();
  let observedFollowing = false;

  for (let tick = 0; tick < 240; tick += 1) {
    simulation.step(1 / 30);
    if (tick % 30 !== 0) continue;

    const laneOccupants = new Map();
    for (let index = 0; index < CAR_COUNT; index += 1) {
      assert.ok(actualSpeeds[index] >= 0);
      assert.ok(actualSpeeds[index] <= desiredSpeeds[index] + 0.001);
      if (actualSpeeds[index] + 0.01 < desiredSpeeds[index]) {
        observedFollowing = true;
      }

      const directionIndex =
        directions[index] === NORTH
          ? 0
          : directions[index] === EAST
            ? 1
            : directions[index] === SOUTH
              ? 2
              : 3;
      const key = segments[index] * 4 + directionIndex;
      const positions = laneOccupants.get(key);
      const laneState = { car: index, progress: progress[index] };
      if (positions) positions.push(laneState);
      else laneOccupants.set(key, [laneState]);
    }

    for (const [laneKey, positions] of laneOccupants) {
      positions.sort((left, right) => left.progress - right.progress);
      for (let index = 1; index < positions.length; index += 1) {
        const gap = positions[index].progress - positions[index - 1].progress;
        assert.ok(
          gap >= minimumCenterGap - 0.002,
          `gap ${gap} below ${minimumCenterGap} in lane ${laneKey} (mask ${roadTiles[Math.floor(laneKey / 4)]}) between cars ${positions[index - 1].car}/${positions[index].car} at tick ${tick}`,
        );
      }
    }
  }

  assert.equal(observedFollowing, true);
});

test("the sparse network sustains traffic without systemic gridlock", async () => {
  const simulation = await loadSimulation();
  simulation.initialize(42, CAR_COUNT);
  const actualSpeeds = new Float32Array(
    simulation.memory.buffer,
    simulation.getCarActualSpeedPointer(),
    CAR_COUNT,
  );
  const desiredSpeeds = new Float32Array(
    simulation.memory.buffer,
    simulation.getCarSpeedPointer(),
    CAR_COUNT,
  );

  for (let tick = 0; tick < 600; tick += 1) {
    simulation.step(1 / 30);
  }

  let stopped = 0;
  let severelyDelayed = 0;
  let speedTotal = 0;
  for (let index = 0; index < CAR_COUNT; index += 1) {
    const speed = actualSpeeds[index];
    speedTotal += speed;
    if (speed < 0.05) stopped += 1;
    if (speed < desiredSpeeds[index] * 0.25) severelyDelayed += 1;
  }

  const metrics = [
    `stopped=${(stopped / CAR_COUNT).toFixed(3)}`,
    `severelyDelayed=${(severelyDelayed / CAR_COUNT).toFixed(3)}`,
    `meanSpeed=${(speedTotal / CAR_COUNT).toFixed(3)}`,
  ].join(", ");
  assert.ok(stopped / CAR_COUNT < 0.25, metrics);
  assert.ok(severelyDelayed / CAR_COUNT < 0.7, metrics);
  assert.ok(speedTotal / CAR_COUNT > 1.0, metrics);
});

test("the intersection controller exposes useful admission telemetry", async () => {
  const simulation = await loadSimulation();
  simulation.initialize(42, 20_000);
  for (let tick = 0; tick < 30; tick += 1) {
    simulation.step(1 / 30);
  }
  assert.equal(typeof simulation.getJunctionCandidateCount, "function");
  assert.equal(typeof simulation.getJunctionGrantCount, "function");
  assert.equal(typeof simulation.getDownstreamBlockedCount, "function");
  assert.ok(simulation.getJunctionCandidateCount() > 0);
  assert.ok(simulation.getJunctionGrantCount() > 0);
});

test("adjacent junctions are acquired as one atomic corridor", async () => {
  const simulation = await loadSimulation();
  simulation.initialize(42, 20_000);
  assert.equal(
    typeof simulation.getCarReservationLengthPointer,
    "function",
  );
  const lengths = new Uint8Array(
    simulation.memory.buffer,
    simulation.getCarReservationLengthPointer(),
    20_000,
  );
  const speeds = new Float32Array(
    simulation.memory.buffer,
    simulation.getCarActualSpeedPointer(),
    20_000,
  );
  const progress = new Float32Array(
    simulation.memory.buffer,
    simulation.getCarProgressPointer(),
    20_000,
  );
  const segments = new Uint32Array(
    simulation.memory.buffer,
    simulation.getCarSegmentPointer(),
    20_000,
  );
  const roads = new Uint8Array(
    simulation.memory.buffer,
    simulation.getRoadTilePointer(),
    TILE_COUNT,
  );

  let observedCompoundReservation = false;
  for (let tick = 0; tick < 180; tick += 1) {
    simulation.step(1 / 30);
    for (let index = 0; index < lengths.length; index += 1) {
      assert.ok(lengths[index] <= 8);
      if (lengths[index] > 1) observedCompoundReservation = true;
    }
  }
  assert.equal(observedCompoundReservation, true);

  let activeCompoundReservations = 0;
  let strandedInsideFirstJunction = 0;
  for (let index = 0; index < lengths.length; index += 1) {
    if (lengths[index] <= 1) continue;
    activeCompoundReservations += 1;
    const mask = roads[segments[index]] & ROAD_MASK;
    const degree =
      Number((mask & NORTH) !== 0) +
      Number((mask & EAST) !== 0) +
      Number((mask & SOUTH) !== 0) +
      Number((mask & WEST) !== 0);
    if (
      speeds[index] < 0.05 &&
      degree >= 3 &&
      progress[index] > 0.72
    ) {
      strandedInsideFirstJunction += 1;
    }
  }
  assert.ok(activeCompoundReservations > 0);
  assert.equal(strandedInsideFirstJunction, 0);
});

test("seeded initialization is deterministic", async () => {
  const simulation = await loadSimulation();
  simulation.initialize(1234, 1_000);
  const firstRun = Array.from(
    new Float32Array(
      simulation.memory.buffer,
      simulation.getCarXPointer(),
      20,
    ),
  );

  simulation.initialize(1234, 1_000);
  const secondRun = Array.from(
    new Float32Array(
      simulation.memory.buffer,
      simulation.getCarXPointer(),
      20,
    ),
  );

  assert.deepEqual(secondRun, firstRun);
});

test("cars advance, remain on roads, and keep valid targets", async () => {
  const simulation = await loadSimulation();
  simulation.initialize(99, 10_000);

  const before = new Float32Array(
    simulation.memory.buffer,
    simulation.getCarXPointer(),
    100,
  ).slice();

  for (let tick = 0; tick < 120; tick += 1) {
    simulation.step(1 / 60);
  }

  const x = new Float32Array(
    simulation.memory.buffer,
    simulation.getCarXPointer(),
    10_000,
  );
  const y = new Float32Array(
    simulation.memory.buffer,
    simulation.getCarYPointer(),
    10_000,
  );

  assert.ok(before.some((value, index) => value !== x[index]));
  for (let index = 0; index < 10_000; index += 101) {
    assert.ok(x[index] >= 0 && x[index] < GRID_SIZE);
    assert.ok(y[index] >= 0 && y[index] < GRID_SIZE);
    assert.ok(simulation.isRoad(Math.floor(x[index]), Math.floor(y[index])));
    const centeredX = Math.abs(x[index] - Math.floor(x[index]) - 0.5) < 0.001;
    const centeredY = Math.abs(y[index] - Math.floor(y[index]) - 0.5) < 0.001;
    assert.ok(centeredX || centeredY);
  }
  assert.equal(simulation.getTick(), 120);
});

test("cars cross tile boundaries only through reciprocal connections", async () => {
  const simulation = await loadSimulation();
  const population = 1_000;
  simulation.initialize(2026, population);
  const tiles = new Uint8Array(
    simulation.memory.buffer,
    simulation.getRoadTilePointer(),
    TILE_COUNT,
  );
  const x = new Float32Array(
    simulation.memory.buffer,
    simulation.getCarXPointer(),
    population,
  );
  const y = new Float32Array(
    simulation.memory.buffer,
    simulation.getCarYPointer(),
    population,
  );
  const previousX = new Int16Array(population);
  const previousY = new Int16Array(population);

  for (let index = 0; index < population; index += 1) {
    previousX[index] = Math.floor(x[index]);
    previousY[index] = Math.floor(y[index]);
  }

  for (let tick = 0; tick < 600; tick += 1) {
    simulation.step(1 / 30);
    for (let index = 0; index < population; index += 29) {
      const currentX = Math.floor(x[index]);
      const currentY = Math.floor(y[index]);
      const deltaX = currentX - previousX[index];
      const deltaY = currentY - previousY[index];
      if (deltaX !== 0 || deltaY !== 0) {
        assert.equal(Math.abs(deltaX) + Math.abs(deltaY), 1);
        const oldIndex = previousY[index] * GRID_SIZE + previousX[index];
        const oldMask = tiles[oldIndex];
        const newMask = tiles[currentY * GRID_SIZE + currentX];
        if (deltaX === 1) {
          assert.ok((oldMask & EAST) !== 0 && (newMask & WEST) !== 0);
        } else if (deltaX === -1) {
          assert.ok((oldMask & WEST) !== 0 && (newMask & EAST) !== 0);
        } else if (deltaY === 1) {
          assert.ok((oldMask & SOUTH) !== 0 && (newMask & NORTH) !== 0);
        } else {
          assert.ok((oldMask & NORTH) !== 0 && (newMask & SOUTH) !== 0);
        }
      }
      previousX[index] = currentX;
      previousY[index] = currentY;
    }
  }
});
