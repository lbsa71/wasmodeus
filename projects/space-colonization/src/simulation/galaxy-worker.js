import { starBodyRef } from "../core/body-ref.js";
import { LEAF_EDGE_PARSECS, OctreeCatalog, OCTREE_DEPTH, ROOT_EDGE_PARSECS, sectorPathForCell } from "../core/octree.js";
import { FOCUSED_SYSTEM_MAX_ZOOM_PARSECS, renderLayerFor } from "../core/render-layer.js";
import { visibleSectorRange } from "../core/sector-viewport.js";
import { generateSystem } from "../core/system-generator.js";
import { rotateGalacticPosition } from "../core/galactic-orbit.js";
import { EARTH_RADIUS_PARSECS, planetIndexFromBodyPath, planetZoomParsecs, systemZoomParsecs } from "../core/system-view.js";
import { lockPositionForBody } from "../core/focus-lock.js";
import { DEFAULT_STAR_SNAPSHOT_LIMIT, encodeStarSnapshot, packStarColor, PLANET_DISK_FLAG, SECTOR_GRID_FLAG } from "./snapshot.js";

/** @type {OctreeCatalog|null} */ let catalog = null;
/** @type {any} */ let wasm = null;
let time = { epochDays: 0n, secondsOfDay: 0 };
/** @type {import("../core/body-ref.js").BodyRef|null} */ let focus = null;
/** @type {number[]|null} */ let focusPositionParsecs = null;
/** @type {any|null} */ let focusedSystem = null;
let focusedLayer = "STAR SYSTEM";
let galaxySeed = 0x5EEDC0DEn;
const workerPostMessage = /** @type {(message: unknown, transfer?: Transferable[]) => void} */ (globalThis.postMessage.bind(globalThis));

function elapsedDays() {
  return Number(time.epochDays) + (time.secondsOfDay / 86_400);
}

/** @param {any} planet @param {number} planetIndex */
function planetPosition(planet, planetIndex) {
  if (!focusPositionParsecs || !focusedSystem) return [0, 0, 0];
  const angle = (elapsedDays() * Math.PI * 2 / (365.25 * Math.sqrt(planet.semiMajorAxisAu ** 3 / focusedSystem.primaryMassSolar))) + (planetIndex * 0.7);
  const auInParsecs = 1 / 206264.806;
  return [focusPositionParsecs[0] + (Math.cos(angle) * planet.semiMajorAxisAu * auInParsecs), focusPositionParsecs[1] + (Math.sin(angle) * planet.semiMajorAxisAu * auInParsecs), focusPositionParsecs[2]];
}

function focusedBodyPosition() {
  if (!focus || !focusPositionParsecs || !focusedSystem) return [0, 0, 0];
  const planetPositions = [];
  for (let index = 0; index < focusedSystem.planets.length; index += 1) planetPositions.push(planetPosition(focusedSystem.planets[index], index));
  return lockPositionForBody(focus.bodyPath, focusPositionParsecs, planetPositions);
}

/** @param {number} index @param {number} channel */
function overviewRandom(index, channel) {
  let state = BigInt.asUintN(64, galaxySeed ^ (BigInt(index) * 0x9e3779b97f4a7c15n) ^ BigInt(channel));
  state ^= state >> 30n;
  state = BigInt.asUintN(64, state * 0xbf58476d1ce4e5b9n);
  state ^= state >> 27n;
  state = BigInt.asUintN(64, state * 0x94d049bb133111ebn);
  return Number((state ^ (state >> 31n)) >> 11n) / 9007199254740992;
}

/** @param {{ positionParsecs?: number[], zoomParsecs?: number, maxStars?: number }} view */
function publishOverview(view) {
  const position = view.positionParsecs ?? [0, 0, 0];
  const count = view.maxStars ?? DEFAULT_STAR_SNAPSHOT_LIMIT;
  const stars = [];
  /** @type {import("../core/body-ref.js").BodyRef[]} */ const pickTable = [];
  for (let index = 0; index < count; index += 1) {
    const radial = Math.min(35_000, -2_900 * Math.log(Math.max(1e-9, 1 - overviewRandom(index, 0))));
    const arm = Math.floor(overviewRandom(index, 1) * 4);
    const angle = (Math.PI * 2 * overviewRandom(index, 2)) + (arm * Math.PI / 2) + (Math.log(Math.max(radial, 200) / 2_800) / Math.tan(12 * Math.PI / 180));
    const x = radial * Math.cos(angle);
    const y = radial * Math.sin(angle);
    const z = (overviewRandom(index, 3) + overviewRandom(index, 4) + overviewRandom(index, 5) - 1.5) * 500;
    const rotated = rotateGalacticPosition([x, y, z], elapsedDays());
    const temperatureKelvin = 2_600 + (5_800 * overviewRandom(index, 6));
    stars.push({ position: [rotated[0] - position[0], rotated[1] - position[1], rotated[2] - position[2]], apparentFlux: 0.25 + (1.5 * overviewRandom(index, 7)), color: packStarColor(temperatureKelvin), pickHandle: index + 1, radius: 1 });
  }
  const starBuffer = encodeStarSnapshot(stars);
  workerPostMessage({ type: "snapshot", snapshot: { starBuffer, starCount: count, pickTable, time, focus, layer: "GALAXY OVERVIEW", renderOriginParsecs: position } }, [starBuffer]);
}

/** @param {{ positionParsecs?: number[], zoomParsecs?: number, aspect?: number, maxStars?: number }} view */
function publishSectorGrid(view) {
  if (!catalog) return;
  const position = view.positionParsecs ?? [0, 0, 0];
  const range = visibleSectorRange(position, view.zoomParsecs ?? 100, view.aspect ?? 1, 2 ** OCTREE_DEPTH);
  const sectorPaths = [];
  const stars = [];
  /** @type {(import("../core/body-ref.js").BodyRef|null)[]} */ const pickTable = [];
  /** @param {number} cell */
  const sectorCenter = (cell) => (-ROOT_EDGE_PARSECS / 2) + ((cell + 0.5) * LEAF_EDGE_PARSECS);
  for (let y = range.minY; y <= range.maxY; y += 1) {
    for (let x = range.minX; x <= range.maxX; x += 1) {
      // Draw every leaf cell in the viewport, including empty cells. This is
      // the navigational sector grid, not a stand-in for selectable stars.
      stars.push({ position: [sectorCenter(x) - position[0], sectorCenter(y) - position[1], sectorCenter(range.z) - position[2]], apparentFlux: 1, color: 0x5f9ddaff, pickHandle: 0, flags: SECTOR_GRID_FLAG, radius: LEAF_EDGE_PARSECS });
      pickTable.push(null);
      const path = sectorPathForCell(x, y, range.z);
      sectorPaths.push(path);
    }
  }
  const maximum = view.maxStars ?? DEFAULT_STAR_SNAPSHOT_LIMIT;
  // The grid remains complete, but detailed stars are a stable, evenly spread
  // subset. Counting every visible depth-14 sector made pointer motion scale
  // with screen area rather than the fixed rendering budget.
  const detailedSectorCount = Math.min(512, sectorPaths.length);
  const sectors = [];
  for (let index = 0; index < detailedSectorCount; index += 1) {
    const path = sectorPaths[Math.floor((index * sectorPaths.length) / detailedSectorCount)];
    const count = Number(catalog.countForPath(path));
    if (count > 0) sectors.push({ path, count });
  }
  const samplesPerSector = Math.max(1, Math.floor(maximum / Math.max(1, sectors.length)));
  for (const sector of sectors) {
    const samples = Math.min(sector.count, samplesPerSector);
    const pathHi = Number(sector.path.morton >> 32n) >>> 0;
    const pathLo = Number(sector.path.morton & 0xffffffffn) >>> 0;
    for (let sample = 0; sample < samples; sample += 1) {
      const ordinal = Math.floor((sample * sector.count) / samples);
      const star = catalog.starAt(sector.path, ordinal);
      pickTable.push(starBodyRef(pathHi, pathLo, ordinal));
      const rotated = rotateGalacticPosition(star.positionParsecs, elapsedDays());
      const dx = rotated[0] - position[0];
      const dy = rotated[1] - position[1];
      const dz = rotated[2] - position[2];
      const distanceSquared = Math.max(0.0001, (dx * dx) + (dy * dy) + (dz * dz));
      stars.push({ position: [dx, dy, dz], apparentFlux: Math.min(100, star.luminositySolar / distanceSquared), color: packStarColor(star.temperatureKelvin), pickHandle: pickTable.length, radius: 1 });
    }
  }
  const starBuffer = encodeStarSnapshot(stars);
  workerPostMessage({ type: "snapshot", snapshot: { starBuffer, starCount: stars.length, pickTable, time, focus, layer: renderLayerFor(view.zoomParsecs ?? 100, false), sectorRange: range, renderOriginParsecs: position } }, [starBuffer]);
}

function publishStarSystem() {
  if (!focus || !focusPositionParsecs || !focusedSystem) return;
  // The local frame follows the selected body, not the previous camera origin.
  // This makes a double-clicked planet remain centred as its orbit advances.
  const position = focusedBodyPosition();
  const auInParsecs = 1 / 206264.806;
  const totalDays = elapsedDays();
  /** @type {Array<{ position: number[], apparentFlux: number, color: number, pickHandle: number, flags?: number, radius: number }>} */
  const stars = [{ position: [focusPositionParsecs[0] - position[0], focusPositionParsecs[1] - position[1], focusPositionParsecs[2] - position[2]], apparentFlux: 12, color: packStarColor(5_800), pickHandle: 1, radius: 4 }];
  const primaryRef = { ...focus, bodyPath: 0 };
  /** @type {import("../core/body-ref.js").BodyRef[]} */ const pickTable = [primaryRef];
  for (let planetIndex = 0; planetIndex < focusedSystem.planets.length; planetIndex += 1) {
    const planet = focusedSystem.planets[planetIndex];
    const [x, y] = planetPosition(planet, planetIndex);
    const planetRef = { ...primaryRef, bodyPath: planet.bodyPath };
    pickTable.push(planetRef);
    stars.push({ position: [x - position[0], y - position[1], focusPositionParsecs[2] - position[2]], apparentFlux: 2.5, color: packStarColor(2_800 + (planet.albedo * 5_000)), pickHandle: pickTable.length, flags: PLANET_DISK_FLAG, radius: planet.radiusEarth * EARTH_RADIUS_PARSECS });
    for (let moonIndex = 0; moonIndex < planet.moons.length; moonIndex += 1) {
      const moon = planet.moons[moonIndex];
      const moonAngle = (totalDays * Math.PI * 2 / Math.max(1, 18 * (moonIndex + 1))) + moonIndex;
      pickTable.push({ ...planetRef, bodyPath: (planet.bodyPath | ((moonIndex + 1) << 16)) >>> 0 });
      stars.push({ position: [x - position[0] + (Math.cos(moonAngle) * moon.semiMajorAxisAu * auInParsecs), y - position[1] + (Math.sin(moonAngle) * moon.semiMajorAxisAu * auInParsecs), focusPositionParsecs[2] - position[2]], apparentFlux: 0.8, color: 0xffdddddd, pickHandle: pickTable.length, radius: 1 });
    }
  }
  const starBuffer = encodeStarSnapshot(stars);
  workerPostMessage({ type: "snapshot", snapshot: { starBuffer, starCount: stars.length, pickTable, time, focus, layer: focusedLayer, lockPositionParsecs: position, renderOriginParsecs: position } }, [starBuffer]);
}

/** @param {string} wasmUrl */
async function loadWasm(wasmUrl) {
  const response = await fetch(wasmUrl);
  const result = await WebAssembly.instantiateStreaming(response, { env: { abort() { throw new Error("Galaxy Wasm aborted."); } } });
  return /** @type {any} */ (result.instance.exports);
}

/** @param {{ positionParsecs?: number[], zoomParsecs?: number, maxStars?: number }} view */
function publishSnapshot(view) {
  if (!catalog) return;
  const zoom = view.zoomParsecs ?? 16_000;
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
    wasm.initialize(Number(data.seed & 0xffffffffn), Number((data.seed >> 32n) & 0xffffffffn));
    catalog = new OctreeCatalog(data.seed);
    workerPostMessage({ type: "ready", starCount: wasm.getGalaxyStarCount() });
    return;
  }
  if (data.type === "view") publishSnapshot(data.view);
  if (data.type === "focus" && catalog) {
    const selected = /** @type {import("../core/body-ref.js").BodyRef} */ (data.body);
    focus = selected;
    const morton = (BigInt(selected.sectorPathHi) << 32n) | BigInt(selected.sectorPathLo);
    const star = catalog.starAt({ level: OCTREE_DEPTH, morton }, selected.ordinal);
    focusPositionParsecs = rotateGalacticPosition(star.positionParsecs, elapsedDays());
    const primaryRef = { ...selected, bodyPath: 0 };
    focusedSystem = generateSystem(galaxySeed, primaryRef, star.massSolar);
    const planetIndex = planetIndexFromBodyPath(selected.bodyPath);
    const selectedPlanet = focusedSystem.planets[planetIndex];
    const isPlanetFocus = selected.bodyPath !== 0 && Boolean(selectedPlanet);
    focusedLayer = isPlanetFocus ? "PLANET / MOONS" : "STAR SYSTEM";
    const systemView = isPlanetFocus
      ? { positionParsecs: planetPosition(selectedPlanet, planetIndex), zoomParsecs: planetZoomParsecs(selectedPlanet), aspect: data.view?.aspect }
      : { positionParsecs: focusPositionParsecs, zoomParsecs: systemZoomParsecs(focusedSystem), aspect: data.view?.aspect };
    workerPostMessage({ type: "system", focus: selected, positionParsecs: focusPositionParsecs, system: focusedSystem, view: systemView });
    // Focus is a transaction: do not wait for a later camera or time message
    // before replacing the old sector snapshot with the local system frame.
    publishStarSystem();
  }
  if (data.type === "time") { time = data.time; publishSnapshot(data.view ?? {}); }
};
