/**
 * The shader and the JavaScript modules describe the same memory from two
 * sides. Nothing but these assertions stops them drifting apart, and a drift
 * shows up on a GPU as garbage rather than as an error.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { COLOR_MASK, DISLODGE_BIT, OCCUPIED_BIT } from "../src/core/field-format.js";
import { SKY_CELL } from "../src/core/geometry.js";
import {
  COMPUTE_PASSES,
  F_BLAST_X,
  F_DISLODGE_SPEED,
  F_DAMPING,
  F_DT,
  F_FOUNTAIN_SPEED,
  F_FOUNTAIN_SPREAD,
  F_FOUNTAIN_X,
  F_GRAVITY,
  F_INTAKE_CHANCE,
  F_RESTITUTION,
  F_VIEWPORT_X,
  FLAG_ALIVE,
  FLAG_DEPOSIT,
  PARAMS_BYTES,
  PARTICLE_STRIDE_BYTES,
  U_CAPACITY,
  U_FRAME,
  U_INTAKE_ROWS,
  U_REST_THRESHOLD,
  U_RING_MASK,
  U_WORLD_X,
  WORKGROUP_SIZE,
} from "../src/core/layout.js";
import { SKY_HEADROOM } from "../src/core/integrator.js";

const read = (/** @type {string} */ name) =>
  readFileSync(fileURLToPath(new URL(`../src/gpu/shaders/${name}`, import.meta.url)), "utf8");
const simulation = read("simulation.wgsl");
const composite = read("composite.wgsl");

/** Size and alignment, in bytes, of the WGSL types this project uses. */
const TYPES = {
  u32: [4, 4],
  i32: [4, 4],
  f32: [4, 4],
  vec2u: [8, 8],
  vec2f: [8, 8],
  vec4f: [16, 16],
};

/**
 * Computes the WGSL memory layout of a struct declared in `source`.
 *
 * @param {string} source @param {string} name
 * @returns {{ offsets: Record<string, number>, size: number }}
 */
function structLayout(source, name) {
  const body = source.match(new RegExp(`struct\\s+${name}\\s*\\{([\\s\\S]*?)\\}`))?.[1];
  assert.ok(body, `struct ${name} is missing from the shader`);
  /** @type {Record<string, number>} */
  const offsets = {};
  let offset = 0;
  let maxAlign = 1;
  for (const line of body.split("\n")) {
    const field = line.match(/^\s*(\w+)\s*:\s*(?:atomic<)?(\w+)>?\s*,/);
    if (!field) continue;
    const [, member, type] = field;
    const [size, align] = TYPES[/** @type {keyof TYPES} */ (type)] ?? [];
    assert.ok(size, `unhandled WGSL type ${type} on ${name}.${member}`);
    offset = Math.ceil(offset / align) * align;
    offsets[member] = offset;
    offset += size;
    maxAlign = Math.max(maxAlign, align);
  }
  return { offsets, size: Math.ceil(offset / maxAlign) * maxAlign };
}

test("the shader constants match the JavaScript cell encoding", () => {
  for (const [name, value] of [
    ["OCCUPIED_BIT", OCCUPIED_BIT],
    ["DISLODGE_BIT", DISLODGE_BIT],
    ["COLOR_MASK", COLOR_MASK],
    ["SKY_CELL", SKY_CELL],
    ["FLAG_ALIVE", FLAG_ALIVE],
    ["FLAG_DEPOSIT", FLAG_DEPOSIT],
  ]) {
    const declared = simulation.match(new RegExp(`const\\s+${name}\\s*:\\s*u32\\s*=\\s*(0x[0-9a-fA-F]+|\\d+)u`))?.[1];
    assert.ok(declared, `${name} is not declared in the shader`);
    assert.equal(Number(declared) >>> 0, Number(value) >>> 0, `${name} differs between shader and JavaScript`);
  }
});

test("the ballistic ceiling matches the integrator's", () => {
  const declared = simulation.match(/const\s+SKY_HEADROOM\s*:\s*f32\s*=\s*([\d.]+)/)?.[1];
  assert.equal(Number(declared), SKY_HEADROOM);
});

test("the Params struct is laid out where writeParams writes", () => {
  const { offsets, size } = structLayout(simulation, "Params");
  assert.equal(size, PARAMS_BYTES, "params buffer size");
  /** @type {[string, number][]} */
  const expected = [
    ["world", U_WORLD_X],
    ["capacity", U_CAPACITY],
    ["ring_mask", U_RING_MASK],
    ["gravity", F_GRAVITY],
    ["dt", F_DT],
    ["damping", F_DAMPING],
    ["restitution", F_RESTITUTION],
    ["rest_threshold", U_REST_THRESHOLD],
    ["frame", U_FRAME],
    ["intake_chance", F_INTAKE_CHANCE],
    ["intake_rows", U_INTAKE_ROWS],
    ["fountain_x", F_FOUNTAIN_X],
    ["fountain_spread", F_FOUNTAIN_SPREAD],
    ["fountain_speed", F_FOUNTAIN_SPEED],
    ["dislodge_speed", F_DISLODGE_SPEED],
    ["blast", F_BLAST_X],
    ["viewport", F_VIEWPORT_X],
  ];
  for (const [member, word] of expected) {
    assert.equal(offsets[member], word * 4, `Params.${member}`);
  }
});

test("the composite pass reads the same Params block as the simulation", () => {
  assert.deepEqual(structLayout(composite, "Params"), structLayout(simulation, "Params"));
});

test("the Particle struct matches the declared stride", () => {
  const { offsets, size } = structLayout(simulation, "Particle");
  assert.equal(size, PARTICLE_STRIDE_BYTES);
  assert.deepEqual(offsets, { pos: 0, vel: 8, color: 16, last_cell: 20, rest: 24, flags: 28 });
});

test("every dispatched pass exists in the shader with the expected workgroup size", () => {
  for (const pass of [...COMPUTE_PASSES, "init_pool"]) {
    const declared = simulation.match(new RegExp(`@compute\\s+@workgroup_size\\((\\d+)\\)\\s*\\nfn\\s+${pass}\\b`));
    assert.ok(declared, `entry point ${pass} is missing`);
    // `prepare` is a single-thread bookkeeping pass; the rest are wide.
    assert.equal(Number(declared[1]), pass === "prepare" ? 1 : WORKGROUP_SIZE, `${pass} workgroup size`);
  }
});

test("only settle pushes to the free ring and only emit pops from it", () => {
  // This is the whole reason a slot can never be handed to two pixels at once.
  const bodies = Object.fromEntries(
    [...simulation.matchAll(/\nfn\s+(\w+)\([\s\S]*?\n\}/g)].map((match) => [match[1], match[0]]),
  );
  assert.match(bodies.settle, /atomicAdd\(&counters\.tail/);
  assert.doesNotMatch(bodies.settle, /counters\.head/);
  assert.match(bodies.emit, /atomicAdd\(&counters\.head/);
  assert.doesNotMatch(bodies.emit, /counters\.tail/);
  for (const pass of ["integrate", "advance", "splat"]) {
    assert.doesNotMatch(bodies[pass], /counters\.(head|tail)/, `${pass} must not touch the ring`);
  }
});

test("emit refuses to pop without budget, which is what caps pixels in motion", () => {
  const emit = simulation.match(/\nfn\s+emit\([\s\S]*?\n\}/)?.[0] ?? "";
  const budgetCheck = emit.indexOf("atomicSub(&counters.pop_budget");
  const pop = emit.indexOf("atomicAdd(&counters.head");
  assert.ok(budgetCheck >= 0 && pop > budgetCheck, "the budget must be claimed before the ring is popped");
  assert.match(emit, /atomicAdd\(&counters\.denied/);
});
