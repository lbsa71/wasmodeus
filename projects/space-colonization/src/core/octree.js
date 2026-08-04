export const GALAXY_STAR_COUNT = 100_000_000_000n;
export const ROOT_EDGE_PARSECS = 256_000;
export const OCTREE_DEPTH = 14;
export const LEAF_EDGE_PARSECS = ROOT_EDGE_PARSECS / (2 ** OCTREE_DEPTH);

const HALF_ROOT = ROOT_EDGE_PARSECS / 2;
const MASK_64 = (1n << 64n) - 1n;

/** @typedef {{ level: number, morton: bigint, starCount: bigint }} OctreeNode */

/** @param {bigint} value */
function mix64(value) {
  let result = value & MASK_64;
  result ^= result >> 30n;
  result = (result * 0xbf58476d1ce4e5b9n) & MASK_64;
  result ^= result >> 27n;
  result = (result * 0x94d049bb133111ebn) & MASK_64;
  return (result ^ (result >> 31n)) & MASK_64;
}

/** @param {bigint} key */
function randomUnit(key) {
  return Number(mix64(key) >> 11n) / 9007199254740992;
}

/** @param {bigint} morton @param {number} level */
function decodeMorton(morton, level) {
  let x = 0;
  let y = 0;
  let z = 0;
  for (let bit = 0; bit < level; bit += 1) {
    x |= Number((morton >> BigInt(bit * 3 + 2)) & 1n) << bit;
    y |= Number((morton >> BigInt(bit * 3 + 1)) & 1n) << bit;
    z |= Number((morton >> BigInt(bit * 3)) & 1n) << bit;
  }
  return [x, y, z];
}

/** @param {number} x @param {number} y @param {number} z @param {number} level */
function encodeMorton(/** @type {number} */ x, /** @type {number} */ y, /** @type {number} */ z, /** @type {number} */ level) {
  let result = 0n;
  for (let bit = 0; bit < level; bit += 1) {
    result |= BigInt((x >> bit) & 1) << BigInt(bit * 3 + 2);
    result |= BigInt((y >> bit) & 1) << BigInt(bit * 3 + 1);
    result |= BigInt((z >> bit) & 1) << BigInt(bit * 3);
  }
  return result;
}

/** @param {bigint} morton @param {number} level */
function nodeCenter(morton, level) {
  const [x, y, z] = decodeMorton(morton, level);
  const edge = ROOT_EDGE_PARSECS / (2 ** level);
  return [((x + 0.5) * edge) - HALF_ROOT, ((y + 0.5) * edge) - HALF_ROOT, ((z + 0.5) * edge) - HALF_ROOT];
}

/** @param {number} x @param {number} y @param {number} z A smooth Milky-Way-like stellar density, in arbitrary normalized units. */
function densityAt(x, y, z) {
  const radius = Math.hypot(x, y);
  const thin = 0.82 * Math.exp(-radius / 2_600) * Math.exp(-Math.abs(z) / 300);
  const thick = 0.10 * Math.exp(-radius / 2_000) * Math.exp(-Math.abs(z) / 900);
  const barRadius = Math.hypot(x / 2_500, y / 1_000, z / 800);
  const bulge = 0.07 * Math.exp(-barRadius);
  const halo = 0.01 / (1 + ((radius * radius + z * z) / (12_000 ** 2))) ** 1.75;
  const angle = Math.atan2(y, x);
  const armPhase = angle - (Math.log(Math.max(radius, 300) / 3_000) / Math.tan(12 * Math.PI / 180));
  return (thin * (1 + (0.18 * Math.cos(4 * armPhase))) + thick + bulge + halo) || Number.EPSILON;
}

/** @param {number} x @param {number} y @param {number} z */
export function sectorPathForPoint(x, y, z) {
  const cells = 2 ** OCTREE_DEPTH;
  const toCell = (/** @type {number} */ value) => Math.max(0, Math.min(cells - 1, Math.floor(((value + HALF_ROOT) / ROOT_EDGE_PARSECS) * cells)));
  return { level: OCTREE_DEPTH, morton: encodeMorton(toCell(x), toCell(y), toCell(z), OCTREE_DEPTH) };
}

/** @param {number} x @param {number} y @param {number} z */
export function sectorPathForCell(x, y, z) {
  const cells = 2 ** OCTREE_DEPTH;
  if (![x, y, z].every((value) => Number.isInteger(value) && value >= 0 && value < cells)) throw new RangeError("Sector cell is outside the galaxy octree.");
  return { level: OCTREE_DEPTH, morton: encodeMorton(x, y, z, OCTREE_DEPTH) };
}

export class OctreeCatalog {
  /** @param {bigint} seed */
  constructor(seed) {
    this.seed = BigInt.asUintN(64, seed);
    /** @type {Map<string, OctreeNode[]>} */ this.childCache = new Map();
  }

  /** @returns {OctreeNode} */
  root() { return { level: 0, morton: 0n, starCount: GALAXY_STAR_COUNT }; }

  /** @param {{ level: number, morton: bigint, starCount?: bigint }} node @returns {OctreeNode[]} */
  children(node) {
    if (node.level >= OCTREE_DEPTH) return [];
    const cacheKey = `${node.level}:${node.morton}`;
    const cached = this.childCache.get(cacheKey);
    if (cached) return cached;
    const parentCount = node.starCount ?? this.countForPath(node);
    const childLevel = node.level + 1;
    const candidates = Array.from({ length: 8 }, (_, child) => {
      const morton = (node.morton << 3n) | BigInt(child);
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
    candidates.sort((a, b) => (b.fraction - a.fraction) || (a.child - b.child));
    for (let index = 0n; index < parentCount - assigned; index += 1n) candidates[Number(index)].count += 1n;
    candidates.sort((a, b) => a.child - b.child);
    const children = candidates.map((candidate) => ({ level: childLevel, morton: candidate.morton, starCount: candidate.count }));
    // A view reuses ancestors heavily. Bound the derived cache so travel across
    // the whole synthetic galaxy cannot make the worker grow without limit.
    if (this.childCache.size >= 131_072) this.childCache.clear();
    this.childCache.set(cacheKey, children);
    return children;
  }

  /** @param {{ level: number, morton: bigint }} path */
  countForPath(path) {
    let node = this.root();
    for (let depth = 1; depth <= path.level; depth += 1) {
      const child = Number((path.morton >> BigInt((path.level - depth) * 3)) & 7n);
      node = this.children(node)[child];
    }
    return node.starCount;
  }

  /** @param {{ level: number, morton: bigint }} path @param {number} ordinal */
  starAt(path, ordinal) {
    const count = this.countForPath(path);
    if (!Number.isInteger(ordinal) || ordinal < 0 || BigInt(ordinal) >= count) throw new RangeError("Star ordinal is outside this sector.");
    const [centerX, centerY, centerZ] = nodeCenter(path.morton, path.level);
    const edge = ROOT_EDGE_PARSECS / (2 ** path.level);
    const key = this.seed ^ path.morton ^ (BigInt(ordinal) << 17n);
    const massSolar = this.#sampleKroupa(randomUnit(key), randomUnit(key + 1n));
    const temperatureKelvin = Math.round(2_600 + (5_800 * Math.min(1, massSolar ** 0.45)));
    return {
      path: { level: path.level, morton: path.morton },
      ordinal,
      positionParsecs: [centerX + ((randomUnit(key + 2n) - 0.5) * edge), centerY + ((randomUnit(key + 3n) - 0.5) * edge), centerZ + ((randomUnit(key + 4n) - 0.5) * edge)],
      massSolar,
      temperatureKelvin,
      luminositySolar: massSolar ** 3.5,
      metallicity: -0.8 + (1.4 * randomUnit(key + 5n)),
    };
  }

  /** @param {number} lowMass @param {number} highMass */
  #sampleKroupa(lowMass, highMass) {
    if (lowMass < 0.7) return 0.08 + (0.42 * lowMass ** 1.35);
    return Math.min(50, 0.5 * ((1 - highMass) ** -0.72));
  }
}
