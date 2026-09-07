/**
 * A population as a file: something to commit, share and keep.
 *
 * The browser's own database is neither of those, so every generation is also
 * written to disk when a folder has been chosen, and one such file lives in
 * the repository at `public/populations/latest.pop` for anyone who pulls it to
 * start from. The format is small and dumb on purpose: a fixed header, a JSON
 * block for everything human, then the raw weights and the elite list.
 *
 *     u32 magic "GTPO"   u32 file version   u32 header bytes
 *     header JSON, UTF-8, zero-padded to a 4-byte boundary
 *     f32[count * BRAIN_FLOATS] brains      u32[elites] elite slots
 *
 * Little-endian throughout, which is every machine this will ever run on.
 */
import { BRAIN_FLOATS } from "./brain.js";
import { POPULATION_VERSION, unpackPopulation } from "./population.js";

/** "GTPO", read as a little-endian word. */
export const FILE_MAGIC = 0x4f505447;
export const FILE_VERSION = 1;
/** The file the app looks for on start, and the one written every generation. */
export const LATEST_POPULATION_FILE = "latest.pop";

const HEADER_WORDS = 3;

/**
 * @param {number} generation
 * @returns {string} e.g. `gen-00042.pop`, so a folder of snapshots sorts itself
 */
export function populationFileName(generation) {
  return `gen-${String(Math.max(0, Math.floor(generation))).padStart(5, "0")}.pop`;
}

/**
 * @param {import("./population.js").SavedPopulation} saved
 * @returns {ArrayBuffer}
 */
export function encodePopulationFile(saved) {
  if (saved.brains.length !== saved.count * BRAIN_FLOATS) {
    throw new Error(`Expected ${saved.count * BRAIN_FLOATS} weights for ${saved.count} brains, got ${saved.brains.length}.`);
  }
  const header = new TextEncoder().encode(JSON.stringify({
    version: POPULATION_VERSION,
    generation: saved.generation,
    count: saved.count,
    elites: saved.elites.length,
    best: saved.best,
    mean: saved.mean,
    savedAt: saved.savedAt,
  }));
  const headerPadded = Math.ceil(header.length / 4) * 4;
  const bytes = HEADER_WORDS * 4 + headerPadded + saved.brains.length * 4 + saved.elites.length * 4;
  const buffer = new ArrayBuffer(bytes);
  const view = new DataView(buffer);
  view.setUint32(0, FILE_MAGIC, true);
  view.setUint32(4, FILE_VERSION, true);
  view.setUint32(8, header.length, true);
  new Uint8Array(buffer, HEADER_WORDS * 4, header.length).set(header);
  let offset = HEADER_WORDS * 4 + headerPadded;
  new Float32Array(buffer, offset, saved.brains.length).set(saved.brains);
  offset += saved.brains.length * 4;
  new Uint32Array(buffer, offset, saved.elites.length).set(saved.elites);
  return buffer;
}

/**
 * The reverse, with every check `unpackPopulation` makes and a few of its own:
 * a file that is not what it claims to be is refused, never guessed at.
 *
 * @param {ArrayBuffer} buffer
 * @returns {import("./population.js").SavedPopulation}
 */
export function decodePopulationFile(buffer) {
  if (buffer.byteLength < HEADER_WORDS * 4) throw new Error("Not a population file: too short.");
  const view = new DataView(buffer);
  if (view.getUint32(0, true) !== FILE_MAGIC) throw new Error("Not a population file.");
  const version = view.getUint32(4, true);
  if (version !== FILE_VERSION) throw new Error(`Population file version ${version} is not ${FILE_VERSION}.`);
  const headerBytes = view.getUint32(8, true);
  const headerPadded = Math.ceil(headerBytes / 4) * 4;
  if (HEADER_WORDS * 4 + headerPadded > buffer.byteLength) throw new Error("Not a population file: the header runs off the end.");
  /** @type {{ version?: number, generation?: number, count?: number, elites?: number, best?: number, mean?: number, savedAt?: number }} */
  let header;
  try {
    header = JSON.parse(new TextDecoder().decode(new Uint8Array(buffer, HEADER_WORDS * 4, headerBytes)));
  } catch {
    throw new Error("Not a population file: the header is not JSON.");
  }
  const count = Number(header.count);
  const eliteCount = Number(header.elites);
  if (!Number.isInteger(count) || count < 1 || !Number.isInteger(eliteCount) || eliteCount < 0) {
    throw new Error("Not a population file: the header does not say how big it is.");
  }
  const offset = HEADER_WORDS * 4 + headerPadded;
  const expected = offset + count * BRAIN_FLOATS * 4 + eliteCount * 4;
  if (buffer.byteLength !== expected) {
    throw new Error(`A population of ${count} with ${eliteCount} elites is ${expected} bytes, not ${buffer.byteLength}.`);
  }
  const brains = new Float32Array(buffer.slice(offset, offset + count * BRAIN_FLOATS * 4));
  const elites = new Uint32Array(buffer.slice(offset + count * BRAIN_FLOATS * 4, expected));
  return unpackPopulation({
    version: header.version,
    generation: header.generation,
    count,
    brains,
    elites,
    best: header.best,
    mean: header.mean,
    savedAt: header.savedAt,
  });
}
