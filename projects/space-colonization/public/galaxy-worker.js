// src/core/body-ref.js
function starBodyRef(sectorPathHi, sectorPathLo, ordinal) {
  return { sectorPathHi: sectorPathHi >>> 0, sectorPathLo: sectorPathLo >>> 0, ordinal: ordinal >>> 0, bodyPath: 0 };
}
function planetBodyPath(planetIndex) {
  if (!Number.isInteger(planetIndex) || planetIndex < 1 || planetIndex > 255) throw new RangeError("Planet index must be 1..255.");
  return planetIndex << 24 >>> 0;
}

// src/core/octree.js
var GALAXY_STAR_COUNT = 100000000000n;
var ROOT_EDGE_PARSECS = 256e3;
var OCTREE_DEPTH = 14;
var LEAF_EDGE_PARSECS = ROOT_EDGE_PARSECS / 2 ** OCTREE_DEPTH;
var HALF_ROOT = ROOT_EDGE_PARSECS / 2;
var MASK_64 = (1n << 64n) - 1n;
function mix64(value) {
  let result = value & MASK_64;
  result ^= result >> 30n;
  result = result * 0xbf58476d1ce4e5b9n & MASK_64;
  result ^= result >> 27n;
  result = result * 0x94d049bb133111ebn & MASK_64;
  return (result ^ result >> 31n) & MASK_64;
}
function randomUnit(key) {
  return Number(mix64(key) >> 11n) / 9007199254740992;
}
function decodeMorton(morton, level) {
  let x = 0;
  let y = 0;
  let z = 0;
  for (let bit = 0; bit < level; bit += 1) {
    x |= Number(morton >> BigInt(bit * 3 + 2) & 1n) << bit;
    y |= Number(morton >> BigInt(bit * 3 + 1) & 1n) << bit;
    z |= Number(morton >> BigInt(bit * 3) & 1n) << bit;
  }
  return [x, y, z];
}
function encodeMorton(x, y, z, level) {
  let result = 0n;
  for (let bit = 0; bit < level; bit += 1) {
    result |= BigInt(x >> bit & 1) << BigInt(bit * 3 + 2);
    result |= BigInt(y >> bit & 1) << BigInt(bit * 3 + 1);
    result |= BigInt(z >> bit & 1) << BigInt(bit * 3);
  }
  return result;
}
function nodeCenter(morton, level) {
  const [x, y, z] = decodeMorton(morton, level);
  const edge = ROOT_EDGE_PARSECS / 2 ** level;
  return [(x + 0.5) * edge - HALF_ROOT, (y + 0.5) * edge - HALF_ROOT, (z + 0.5) * edge - HALF_ROOT];
}
function densityAt(x, y, z) {
  const radius = Math.hypot(x, y);
  const thin = 0.82 * Math.exp(-radius / 2600) * Math.exp(-Math.abs(z) / 300);
  const thick = 0.1 * Math.exp(-radius / 2e3) * Math.exp(-Math.abs(z) / 900);
  const barRadius = Math.hypot(x / 2500, y / 1e3, z / 800);
  const bulge = 0.07 * Math.exp(-barRadius);
  const halo = 0.01 / (1 + (radius * radius + z * z) / 12e3 ** 2) ** 1.75;
  const angle = Math.atan2(y, x);
  const armPhase = angle - Math.log(Math.max(radius, 300) / 3e3) / Math.tan(12 * Math.PI / 180);
  return thin * (1 + 0.18 * Math.cos(4 * armPhase)) + thick + bulge + halo || Number.EPSILON;
}
function sectorPathForCell(x, y, z) {
  const cells = 2 ** OCTREE_DEPTH;
  if (![x, y, z].every((value) => Number.isInteger(value) && value >= 0 && value < cells)) throw new RangeError("Sector cell is outside the galaxy octree.");
  return { level: OCTREE_DEPTH, morton: encodeMorton(x, y, z, OCTREE_DEPTH) };
}
var OctreeCatalog = class {
  /** @param {bigint} seed */
  constructor(seed) {
    this.seed = BigInt.asUintN(64, seed);
    this.childCache = /* @__PURE__ */ new Map();
  }
  /** @returns {OctreeNode} */
  root() {
    return { level: 0, morton: 0n, starCount: GALAXY_STAR_COUNT };
  }
  /** @param {{ level: number, morton: bigint, starCount?: bigint }} node @returns {OctreeNode[]} */
  children(node) {
    if (node.level >= OCTREE_DEPTH) return [];
    const cacheKey = `${node.level}:${node.morton}`;
    const cached = this.childCache.get(cacheKey);
    if (cached) return cached;
    const parentCount = node.starCount ?? this.countForPath(node);
    const childLevel = node.level + 1;
    const candidates = Array.from({ length: 8 }, (_, child) => {
      const morton = node.morton << 3n | BigInt(child);
      const [x, y, z] = nodeCenter(morton, childLevel);
      return { child, morton, weight: densityAt(x, y, z), count: 0n, fraction: 0 };
    });
    const total = candidates.reduce((sum, candidate) => sum + candidate.weight, 0);
    let assigned = 0n;
    for (const candidate of candidates) {
      const exact = Number(parentCount) * (candidate.weight / total);
      candidate.count = BigInt(Math.floor(exact));
      candidate.fraction = exact - Math.floor(exact);
      assigned += candidate.count;
    }
    candidates.sort((a, b) => b.fraction - a.fraction || a.child - b.child);
    for (let index = 0n; index < parentCount - assigned; index += 1n) candidates[Number(index)].count += 1n;
    candidates.sort((a, b) => a.child - b.child);
    const children = candidates.map((candidate) => ({ level: childLevel, morton: candidate.morton, starCount: candidate.count }));
    if (this.childCache.size >= 131072) this.childCache.clear();
    this.childCache.set(cacheKey, children);
    return children;
  }
  /** @param {{ level: number, morton: bigint }} path */
  countForPath(path) {
    let node = this.root();
    for (let depth = 1; depth <= path.level; depth += 1) {
      const child = Number(path.morton >> BigInt((path.level - depth) * 3) & 7n);
      node = this.children(node)[child];
    }
    return node.starCount;
  }
  /** @param {{ level: number, morton: bigint }} path @param {number} ordinal */
  starAt(path, ordinal) {
    const count = this.countForPath(path);
    if (!Number.isInteger(ordinal) || ordinal < 0 || BigInt(ordinal) >= count) throw new RangeError("Star ordinal is outside this sector.");
    const [centerX, centerY, centerZ] = nodeCenter(path.morton, path.level);
    const edge = ROOT_EDGE_PARSECS / 2 ** path.level;
    const key = this.seed ^ path.morton ^ BigInt(ordinal) << 17n;
    const massSolar = this.#sampleKroupa(randomUnit(key), randomUnit(key + 1n));
    const temperatureKelvin = Math.round(2600 + 5800 * Math.min(1, massSolar ** 0.45));
    return {
      path: { level: path.level, morton: path.morton },
      ordinal,
      positionParsecs: [centerX + (randomUnit(key + 2n) - 0.5) * edge, centerY + (randomUnit(key + 3n) - 0.5) * edge, centerZ + (randomUnit(key + 4n) - 0.5) * edge],
      massSolar,
      temperatureKelvin,
      luminositySolar: massSolar ** 3.5,
      metallicity: -0.8 + 1.4 * randomUnit(key + 5n)
    };
  }
  /** @param {number} lowMass @param {number} highMass */
  #sampleKroupa(lowMass, highMass) {
    if (lowMass < 0.7) return 0.08 + 0.42 * lowMass ** 1.35;
    return Math.min(50, 0.5 * (1 - highMass) ** -0.72);
  }
};

// src/core/render-layer.js
var FOCUSED_SYSTEM_MAX_ZOOM_PARSECS = LEAF_EDGE_PARSECS * 4;
function renderLayerFor(zoomParsecs, focused) {
  if (focused && zoomParsecs <= FOCUSED_SYSTEM_MAX_ZOOM_PARSECS) return "STAR SYSTEM";
  if (zoomParsecs > 500) return "GALAXY OVERVIEW";
  if (zoomParsecs > 0.25) return "SECTOR GRID";
  return "STELLAR NEIGHBORHOOD";
}

// src/core/sector-viewport.js
function visibleSectorRange(positionParsecs, halfHeightParsecs, aspect, cellsPerAxis) {
  const edge = ROOT_EDGE_PARSECS / cellsPerAxis;
  const halfRoot = ROOT_EDGE_PARSECS / 2;
  const lower = (coordinate, halfSpan) => Math.max(0, Math.floor((coordinate - halfSpan + halfRoot) / edge));
  const upper = (coordinate, halfSpan) => Math.min(cellsPerAxis - 1, Math.ceil((coordinate + halfSpan + halfRoot) / edge) - 1);
  return {
    minX: lower(positionParsecs[0], halfHeightParsecs * aspect),
    maxX: upper(positionParsecs[0], halfHeightParsecs * aspect),
    minY: lower(positionParsecs[1], halfHeightParsecs),
    maxY: upper(positionParsecs[1], halfHeightParsecs),
    z: Math.max(0, Math.min(cellsPerAxis - 1, Math.floor((positionParsecs[2] + halfRoot) / edge)))
  };
}

// src/core/system-generator.js
var MASK_642 = (1n << 64n) - 1n;
function mix642(value) {
  let result = value & MASK_642;
  result ^= result >> 30n;
  result = result * 0xbf58476d1ce4e5b9n & MASK_642;
  result ^= result >> 27n;
  result = result * 0x94d049bb133111ebn & MASK_642;
  return (result ^ result >> 31n) & MASK_642;
}
function random(seed, star, channel) {
  const key = seed ^ BigInt(star.sectorPathHi) << 32n ^ BigInt(star.sectorPathLo) ^ BigInt(star.ordinal) << 17n ^ BigInt(channel);
  return Number(mix642(key) >> 11n) / 9007199254740992;
}
function generateSystem(seed, star, primaryMassSolar) {
  const planetCount = 1 + Math.floor(random(seed, star, 0) * 6);
  const planets = [];
  let previousAxis = 0.18 + 0.25 * random(seed, star, 1);
  for (let index = 0; index < planetCount; index += 1) {
    const massSolar = 1e-6 * (0.15 + 20 * random(seed, star, 10 + index));
    const semiMajorAxisAu = index === 0 ? previousAxis : previousAxis * (1.8 + 0.35 * random(seed, star, 30 + index));
    const planet = {
      bodyPath: planetBodyPath(index + 1),
      massSolar,
      radiusEarth: Math.max(0.35, (massSolar / 3e-6) ** 0.28),
      semiMajorAxisAu,
      eccentricity: random(seed, star, 50 + index) * 0.08,
      inclinationRadians: random(seed, star, 70 + index) * 0.08,
      atmosphere: random(seed, star, 90 + index) > 0.35,
      albedo: 0.08 + 0.62 * random(seed, star, 110 + index),
      moons: (
        /** @type {Array<{ massSolar: number, semiMajorAxisAu: number, eccentricity: number }>} */
        []
      ),
      hillRadiusAu: semiMajorAxisAu * (massSolar / (3 * primaryMassSolar)) ** (1 / 3)
    };
    const moonCount = Math.floor(random(seed, star, 130 + index) * 3);
    for (let moonIndex = 0; moonIndex < moonCount; moonIndex += 1) {
      planet.moons.push({
        massSolar: massSolar * (1e-4 + 0.01 * random(seed, star, 150 + index * 4 + moonIndex)),
        semiMajorAxisAu: planet.hillRadiusAu * (0.04 + 0.12 * (moonIndex + 1)),
        eccentricity: random(seed, star, 180 + index * 4 + moonIndex) * 0.03
      });
    }
    planets.push(planet);
    previousAxis = semiMajorAxisAu;
  }
  return { primaryMassSolar, planets };
}

// src/core/galactic-orbit.js
var SOLAR_ORBIT_DAYS = 23e7 * 365.25;
function rotateGalacticPosition(positionParsecs, elapsedDays2) {
  const [x, y, z] = positionParsecs;
  const radiusParsecs = Math.hypot(x, y);
  if (radiusParsecs < 1e-9) return [x, y, z];
  const periodDays = SOLAR_ORBIT_DAYS * (radiusParsecs / 8e3);
  const angle = elapsedDays2 / periodDays * Math.PI * 2;
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  return [x * cosine - y * sine, x * sine + y * cosine, z];
}

// src/core/system-view.js
var AU_IN_PARSECS = 1 / 206264.806;
var EARTH_RADIUS_PARSECS = 2065e-13;
var FRAME_MARGIN = 1.2;
var MINIMUM_SYSTEM_ZOOM_PARSECS = 2 * AU_IN_PARSECS;
var PLANET_FRAME_MARGIN = 1.5;
function systemZoomParsecs(system) {
  let outerRadiusAu = 0;
  for (const planet of system.planets) {
    let planetEnvelopeAu = planet.semiMajorAxisAu * (1 + planet.eccentricity);
    for (const moon of planet.moons) planetEnvelopeAu += moon.semiMajorAxisAu * (1 + moon.eccentricity);
    outerRadiusAu = Math.max(outerRadiusAu, planetEnvelopeAu);
  }
  return Math.max(MINIMUM_SYSTEM_ZOOM_PARSECS, outerRadiusAu * FRAME_MARGIN * AU_IN_PARSECS);
}
function planetIndexFromBodyPath(bodyPath) {
  return (bodyPath >>> 24 & 255) - 1;
}
function planetZoomParsecs(planet) {
  const outerMoonAu = planet.moons.reduce((outer, moon) => Math.max(outer, moon.semiMajorAxisAu * (1 + moon.eccentricity)), 0);
  if (outerMoonAu > 0) return outerMoonAu * PLANET_FRAME_MARGIN * AU_IN_PARSECS;
  return planet.radiusEarth * EARTH_RADIUS_PARSECS * 1.15;
}

// src/core/focus-lock.js
function lockPositionForBody(bodyPath, starPositionParsecs, planetPositionsParsecs) {
  if (bodyPath === 0) return starPositionParsecs;
  return planetPositionsParsecs[planetIndexFromBodyPath(bodyPath)] ?? starPositionParsecs;
}

// src/render/star-data.js
var STAR_RECORD_BYTES = 32;
function createStarRenderBuffer(count) {
  return new ArrayBuffer(count * STAR_RECORD_BYTES);
}
function writeStarRecord(buffer, index, star) {
  const offset = index * STAR_RECORD_BYTES;
  const floats = new Float32Array(buffer, offset, 4);
  const integers = new Uint32Array(buffer, offset + 16, 4);
  floats.set([star.position[0], star.position[1], star.position[2], star.apparentFlux]);
  integers.set([star.color >>> 0, star.pickHandle >>> 0, star.flags >>> 0]);
  new Float32Array(buffer, offset + 28, 1)[0] = star.radius;
}

// src/simulation/snapshot.js
var DEFAULT_STAR_SNAPSHOT_LIMIT = 16384;
var SECTOR_GRID_FLAG = 1;
var PLANET_DISK_FLAG = 2;
function packStarColor(temperatureKelvin) {
  const normalized = Math.max(0, Math.min(1, (temperatureKelvin - 2600) / 5800));
  const red = Math.round(255 * (1 - 0.2 * normalized));
  const green = Math.round(120 + 125 * normalized);
  const blue = Math.round(80 + 175 * normalized);
  return (255 << 24 | blue << 16 | green << 8 | red) >>> 0;
}
function encodeStarSnapshot(stars) {
  const buffer = createStarRenderBuffer(stars.length);
  stars.forEach((star, index) => writeStarRecord(buffer, index, { ...star, flags: star.flags ?? 0, radius: star.radius ?? 1 }));
  return buffer;
}

// src/simulation/galaxy-worker.js
var catalog = null;
var wasm = null;
var time = { epochDays: 0n, secondsOfDay: 0 };
var focus = null;
var focusPositionParsecs = null;
var focusedSystem = null;
var focusedLayer = "STAR SYSTEM";
var galaxySeed = 0x5EEDC0DEn;
var workerPostMessage = (
  /** @type {(message: unknown, transfer?: Transferable[]) => void} */
  globalThis.postMessage.bind(globalThis)
);
function elapsedDays() {
  return Number(time.epochDays) + time.secondsOfDay / 86400;
}
function planetPosition(planet, planetIndex) {
  if (!focusPositionParsecs || !focusedSystem) return [0, 0, 0];
  const angle = elapsedDays() * Math.PI * 2 / (365.25 * Math.sqrt(planet.semiMajorAxisAu ** 3 / focusedSystem.primaryMassSolar)) + planetIndex * 0.7;
  const auInParsecs = 1 / 206264.806;
  return [focusPositionParsecs[0] + Math.cos(angle) * planet.semiMajorAxisAu * auInParsecs, focusPositionParsecs[1] + Math.sin(angle) * planet.semiMajorAxisAu * auInParsecs, focusPositionParsecs[2]];
}
function focusedBodyPosition() {
  if (!focus || !focusPositionParsecs || !focusedSystem) return [0, 0, 0];
  const planetPositions = [];
  for (let index = 0; index < focusedSystem.planets.length; index += 1) planetPositions.push(planetPosition(focusedSystem.planets[index], index));
  return lockPositionForBody(focus.bodyPath, focusPositionParsecs, planetPositions);
}
function overviewRandom(index, channel) {
  let state = BigInt.asUintN(64, galaxySeed ^ BigInt(index) * 0x9e3779b97f4a7c15n ^ BigInt(channel));
  state ^= state >> 30n;
  state = BigInt.asUintN(64, state * 0xbf58476d1ce4e5b9n);
  state ^= state >> 27n;
  state = BigInt.asUintN(64, state * 0x94d049bb133111ebn);
  return Number((state ^ state >> 31n) >> 11n) / 9007199254740992;
}
function publishOverview(view) {
  const position = view.positionParsecs ?? [0, 0, 0];
  const count = view.maxStars ?? DEFAULT_STAR_SNAPSHOT_LIMIT;
  const stars = [];
  const pickTable = [];
  for (let index = 0; index < count; index += 1) {
    const radial = Math.min(35e3, -2900 * Math.log(Math.max(1e-9, 1 - overviewRandom(index, 0))));
    const arm = Math.floor(overviewRandom(index, 1) * 4);
    const angle = Math.PI * 2 * overviewRandom(index, 2) + arm * Math.PI / 2 + Math.log(Math.max(radial, 200) / 2800) / Math.tan(12 * Math.PI / 180);
    const x = radial * Math.cos(angle);
    const y = radial * Math.sin(angle);
    const z = (overviewRandom(index, 3) + overviewRandom(index, 4) + overviewRandom(index, 5) - 1.5) * 500;
    const rotated = rotateGalacticPosition([x, y, z], elapsedDays());
    const temperatureKelvin = 2600 + 5800 * overviewRandom(index, 6);
    stars.push({ position: [rotated[0] - position[0], rotated[1] - position[1], rotated[2] - position[2]], apparentFlux: 0.25 + 1.5 * overviewRandom(index, 7), color: packStarColor(temperatureKelvin), pickHandle: index + 1, radius: 1 });
  }
  const starBuffer = encodeStarSnapshot(stars);
  workerPostMessage({ type: "snapshot", snapshot: { starBuffer, starCount: count, pickTable, time, focus, layer: "GALAXY OVERVIEW", renderOriginParsecs: position } }, [starBuffer]);
}
function publishSectorGrid(view) {
  if (!catalog) return;
  const position = view.positionParsecs ?? [0, 0, 0];
  const range = visibleSectorRange(position, view.zoomParsecs ?? 100, view.aspect ?? 1, 2 ** OCTREE_DEPTH);
  const sectorPaths = [];
  const stars = [];
  const pickTable = [];
  const sectorCenter = (cell) => -ROOT_EDGE_PARSECS / 2 + (cell + 0.5) * LEAF_EDGE_PARSECS;
  for (let y = range.minY; y <= range.maxY; y += 1) {
    for (let x = range.minX; x <= range.maxX; x += 1) {
      stars.push({ position: [sectorCenter(x) - position[0], sectorCenter(y) - position[1], sectorCenter(range.z) - position[2]], apparentFlux: 1, color: 1604180735, pickHandle: 0, flags: SECTOR_GRID_FLAG, radius: LEAF_EDGE_PARSECS });
      pickTable.push(null);
      const path = sectorPathForCell(x, y, range.z);
      sectorPaths.push(path);
    }
  }
  const maximum = view.maxStars ?? DEFAULT_STAR_SNAPSHOT_LIMIT;
  const detailedSectorCount = Math.min(512, sectorPaths.length);
  const sectors = [];
  for (let index = 0; index < detailedSectorCount; index += 1) {
    const path = sectorPaths[Math.floor(index * sectorPaths.length / detailedSectorCount)];
    const count = Number(catalog.countForPath(path));
    if (count > 0) sectors.push({ path, count });
  }
  const samplesPerSector = Math.max(1, Math.floor(maximum / Math.max(1, sectors.length)));
  for (const sector of sectors) {
    const samples = Math.min(sector.count, samplesPerSector);
    const pathHi = Number(sector.path.morton >> 32n) >>> 0;
    const pathLo = Number(sector.path.morton & 0xffffffffn) >>> 0;
    for (let sample = 0; sample < samples; sample += 1) {
      const ordinal = Math.floor(sample * sector.count / samples);
      const star = catalog.starAt(sector.path, ordinal);
      pickTable.push(starBodyRef(pathHi, pathLo, ordinal));
      const rotated = rotateGalacticPosition(star.positionParsecs, elapsedDays());
      const dx = rotated[0] - position[0];
      const dy = rotated[1] - position[1];
      const dz = rotated[2] - position[2];
      const distanceSquared = Math.max(1e-4, dx * dx + dy * dy + dz * dz);
      stars.push({ position: [dx, dy, dz], apparentFlux: Math.min(100, star.luminositySolar / distanceSquared), color: packStarColor(star.temperatureKelvin), pickHandle: pickTable.length, radius: 1 });
    }
  }
  const starBuffer = encodeStarSnapshot(stars);
  workerPostMessage({ type: "snapshot", snapshot: { starBuffer, starCount: stars.length, pickTable, time, focus, layer: renderLayerFor(view.zoomParsecs ?? 100, false), sectorRange: range, renderOriginParsecs: position } }, [starBuffer]);
}
function publishStarSystem() {
  if (!focus || !focusPositionParsecs || !focusedSystem) return;
  const position = focusedBodyPosition();
  const auInParsecs = 1 / 206264.806;
  const totalDays = elapsedDays();
  const stars = [{ position: [focusPositionParsecs[0] - position[0], focusPositionParsecs[1] - position[1], focusPositionParsecs[2] - position[2]], apparentFlux: 12, color: packStarColor(5800), pickHandle: 1, radius: 4 }];
  const primaryRef = { ...focus, bodyPath: 0 };
  const pickTable = [primaryRef];
  for (let planetIndex = 0; planetIndex < focusedSystem.planets.length; planetIndex += 1) {
    const planet = focusedSystem.planets[planetIndex];
    const [x, y] = planetPosition(planet, planetIndex);
    const planetRef = { ...primaryRef, bodyPath: planet.bodyPath };
    pickTable.push(planetRef);
    stars.push({ position: [x - position[0], y - position[1], focusPositionParsecs[2] - position[2]], apparentFlux: 2.5, color: packStarColor(2800 + planet.albedo * 5e3), pickHandle: pickTable.length, flags: PLANET_DISK_FLAG, radius: planet.radiusEarth * EARTH_RADIUS_PARSECS });
    for (let moonIndex = 0; moonIndex < planet.moons.length; moonIndex += 1) {
      const moon = planet.moons[moonIndex];
      const moonAngle = totalDays * Math.PI * 2 / Math.max(1, 18 * (moonIndex + 1)) + moonIndex;
      pickTable.push({ ...planetRef, bodyPath: (planet.bodyPath | moonIndex + 1 << 16) >>> 0 });
      stars.push({ position: [x - position[0] + Math.cos(moonAngle) * moon.semiMajorAxisAu * auInParsecs, y - position[1] + Math.sin(moonAngle) * moon.semiMajorAxisAu * auInParsecs, focusPositionParsecs[2] - position[2]], apparentFlux: 0.8, color: 4292730333, pickHandle: pickTable.length, radius: 1 });
    }
  }
  const starBuffer = encodeStarSnapshot(stars);
  workerPostMessage({ type: "snapshot", snapshot: { starBuffer, starCount: stars.length, pickTable, time, focus, layer: focusedLayer, lockPositionParsecs: position, renderOriginParsecs: position } }, [starBuffer]);
}
async function loadWasm(wasmUrl) {
  const response = await fetch(wasmUrl);
  const result = await WebAssembly.instantiateStreaming(response, { env: { abort() {
    throw new Error("Galaxy Wasm aborted.");
  } } });
  return (
    /** @type {any} */
    result.instance.exports
  );
}
function publishSnapshot(view) {
  if (!catalog) return;
  const zoom = view.zoomParsecs ?? 16e3;
  if (focus && zoom <= FOCUSED_SYSTEM_MAX_ZOOM_PARSECS) {
    publishStarSystem();
    return;
  }
  if (zoom > 500) {
    publishOverview(view);
    return;
  }
  publishSectorGrid(view);
}
self.onmessage = async ({ data }) => {
  if (data.type === "init") {
    wasm = await loadWasm(data.wasmUrl);
    galaxySeed = data.seed;
    wasm.initialize(Number(data.seed & 0xffffffffn), Number(data.seed >> 32n & 0xffffffffn));
    catalog = new OctreeCatalog(data.seed);
    workerPostMessage({ type: "ready", starCount: wasm.getGalaxyStarCount() });
    return;
  }
  if (data.type === "view") publishSnapshot(data.view);
  if (data.type === "focus" && catalog) {
    const selected = (
      /** @type {import("../core/body-ref.js").BodyRef} */
      data.body
    );
    focus = selected;
    const morton = BigInt(selected.sectorPathHi) << 32n | BigInt(selected.sectorPathLo);
    const star = catalog.starAt({ level: OCTREE_DEPTH, morton }, selected.ordinal);
    focusPositionParsecs = rotateGalacticPosition(star.positionParsecs, elapsedDays());
    const primaryRef = { ...selected, bodyPath: 0 };
    focusedSystem = generateSystem(galaxySeed, primaryRef, star.massSolar);
    const planetIndex = planetIndexFromBodyPath(selected.bodyPath);
    const selectedPlanet = focusedSystem.planets[planetIndex];
    const isPlanetFocus = selected.bodyPath !== 0 && Boolean(selectedPlanet);
    focusedLayer = isPlanetFocus ? "PLANET / MOONS" : "STAR SYSTEM";
    const systemView = isPlanetFocus ? { positionParsecs: planetPosition(selectedPlanet, planetIndex), zoomParsecs: planetZoomParsecs(selectedPlanet), aspect: data.view?.aspect } : { positionParsecs: focusPositionParsecs, zoomParsecs: systemZoomParsecs(focusedSystem), aspect: data.view?.aspect };
    workerPostMessage({ type: "system", focus: selected, positionParsecs: focusPositionParsecs, system: focusedSystem, view: systemView });
    publishStarSystem();
  }
  if (data.type === "time") {
    time = data.time;
    publishSnapshot(data.view ?? {});
  }
};
//# sourceMappingURL=galaxy-worker.js.map
