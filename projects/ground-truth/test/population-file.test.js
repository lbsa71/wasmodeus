import test from "node:test";
import assert from "node:assert/strict";

import { BRAIN_FLOATS, randomBrain } from "../src/core/brain.js";
import { POPULATION_VERSION, packPopulation } from "../src/core/population.js";
import {
  FILE_MAGIC,
  FILE_VERSION,
  LATEST_POPULATION_FILE,
  decodePopulationFile,
  encodePopulationFile,
  populationFileName,
} from "../src/core/population-file.js";

/** @param {number} count */
function saved(count) {
  const brains = new Float32Array(count * BRAIN_FLOATS);
  for (let i = 0; i < count; i += 1) randomBrain(900 + i, brains, i * BRAIN_FLOATS);
  return packPopulation({ generation: 42, count, brains, elites: Uint32Array.from([2, 0]), best: 1234.5, mean: 67.25 }, 1_700_000_000_000);
}

test("a population survives the round trip to bytes and back, bit for bit", () => {
  const before = saved(7);
  const bytes = encodePopulationFile(before);
  const after = decodePopulationFile(bytes);
  assert.deepEqual(after.brains, before.brains);
  assert.deepEqual(after.elites, before.elites);
  assert.equal(after.generation, 42);
  assert.equal(after.count, 7);
  assert.equal(after.best, 1234.5);
  assert.equal(after.mean, 67.25);
  assert.equal(after.savedAt, 1_700_000_000_000);
  assert.equal(after.version, POPULATION_VERSION);
});

test("the file starts with a magic word and its version, little-endian", () => {
  const bytes = encodePopulationFile(saved(1));
  const view = new DataView(bytes);
  assert.equal(view.getUint32(0, true), FILE_MAGIC);
  assert.equal(new TextDecoder().decode(new Uint8Array(bytes, 0, 4)), "GTPO");
  assert.equal(view.getUint32(4, true), FILE_VERSION);
  assert.equal(bytes.byteLength % 4, 0, "the weights land on a word boundary");
});

test("the file is compact: a few dozen bytes of header over the raw weights", () => {
  const count = 600;
  const bytes = encodePopulationFile(saved(count));
  const raw = count * BRAIN_FLOATS * 4 + 2 * 4;
  assert.ok(bytes.byteLength - raw < 200, `${bytes.byteLength - raw} bytes of overhead`);
});

test("anything that is not a population file is refused, never guessed at", () => {
  const good = encodePopulationFile(saved(3));
  assert.throws(() => decodePopulationFile(new ArrayBuffer(4)), /too short/);
  const wrongMagic = good.slice(0);
  new DataView(wrongMagic).setUint32(0, 0x89504e47, true);
  assert.throws(() => decodePopulationFile(wrongMagic), /Not a population file/);
  const wrongVersion = good.slice(0);
  new DataView(wrongVersion).setUint32(4, FILE_VERSION + 1, true);
  assert.throws(() => decodePopulationFile(wrongVersion), /version/);
  assert.throws(() => decodePopulationFile(good.slice(0, good.byteLength - 4)), /bytes/);
  const truncatedHeader = good.slice(0);
  new DataView(truncatedHeader).setUint32(8, 1 << 20, true);
  assert.throws(() => decodePopulationFile(truncatedHeader), /runs off the end/);
});

test("a poisoned weight in the file is caught by the same checks the database gets", () => {
  const bytes = encodePopulationFile(saved(2));
  const view = new DataView(bytes);
  const headerPadded = Math.ceil(view.getUint32(8, true) / 4) * 4;
  view.setFloat32(12 + headerPadded + 8, Number.NaN, true);
  assert.throws(() => decodePopulationFile(bytes), /not a number/);
});

test("snapshot names sort themselves, and the latest has a fixed name", () => {
  assert.equal(populationFileName(42), "gen-00042.pop");
  assert.equal(populationFileName(7), "gen-00007.pop");
  assert.ok(populationFileName(99) < populationFileName(100));
  assert.equal(LATEST_POPULATION_FILE, "latest.pop");
});
