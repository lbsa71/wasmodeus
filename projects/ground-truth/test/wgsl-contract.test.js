/**
 * The shader and the JavaScript modules describe the same memory from two
 * sides. Nothing but these assertions stops them drifting apart, and a drift
 * shows up on a GPU as garbage rather than as an error.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { BOND_MASK, BOND_SHIFT, COLOR_MASK, DISLODGE_BIT, MATERIAL_MASK, OCCUPIED_BIT, WATER_BOND } from "../src/core/field-format.js";
import { SKY_CELL } from "../src/core/geometry.js";
import { SUPPORT_FALL, SUPPORT_FIRM, SUPPORT_SLUMP } from "../src/core/sand.js";
import {
  COMPUTE_PASSES,
  F_BLAST_X,
  F_CAMERA_SCALE,
  F_CAMERA_X,

  F_DRAG_X,
  F_DAMPING,
  F_DISLODGE_SPEED,
  F_DT,
  F_GRAVITY,
  F_RESTITUTION,
  F_SLIDE_SPEED,
  F_SLUMP_CHANCE,
  F_VIEWPORT_X,
  MAX_REST,
  PARAMS_BYTES,
  PARTICLE_STRIDE_BYTES,
  U_CAPACITY,
  U_FRAME,
  STATE_ALIVE_BIT,
  STATE_REST_MASK,
  STATE_REST_SHIFT,
  U_RUBBLE_BOND,
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
    ["MATERIAL_MASK", MATERIAL_MASK],
    ["BOND_MASK", BOND_MASK],
    ["BOND_SHIFT", BOND_SHIFT],
    ["SKY_CELL", SKY_CELL],
    ["STATE_ALIVE_BIT", STATE_ALIVE_BIT],
    ["STATE_REST_SHIFT", STATE_REST_SHIFT],
    ["STATE_REST_MASK", STATE_REST_MASK],
    ["MAX_REST", MAX_REST],
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
    ["slump_chance", F_SLUMP_CHANCE],
    ["slide_speed", F_SLIDE_SPEED],
    ["dislodge_speed", F_DISLODGE_SPEED],
    ["blast", F_BLAST_X],
    ["viewport", F_VIEWPORT_X],
    ["camera_origin", F_CAMERA_X],
    ["camera_scale", F_CAMERA_SCALE],
    ["rubble_bond", U_RUBBLE_BOND],
    ["brush_drag", F_DRAG_X],
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
  // Scalars, not vectors: a vec2f would align the struct to eight bytes and pad
  // it back to 24, costing a fifth of the pool ceiling.
  assert.deepEqual(offsets, { pos_x: 0, pos_y: 4, vel_x: 8, vel_y: 12, last_cell: 16 });
});

test("every pass tests liveness against the state array, not the particle", () => {
  // The point of splitting state out is that an idle slot costs four bytes to
  // skip instead of twenty, which is what makes a mostly-empty hundred-million
  // pool affordable at all.
  for (const pass of ["integrate", "advance", "settle", "splat"]) {
    const body = simulation.match(new RegExp(`\\nfn\\s+${pass}\\([\\s\\S]*?\\n\\}`))?.[0] ?? "";
    assert.match(body, /states\[i\][\s\S]*?STATE_ALIVE_BIT/, `${pass} does not check states[i] for liveness`);
    const aliveCheck = body.indexOf("STATE_ALIVE_BIT");
    const particleRead = body.indexOf("particles[i]");
    assert.ok(aliveCheck >= 0 && (particleRead < 0 || aliveCheck < particleRead),
      `${pass} reads the particle before it knows the slot is alive`);
  }
});

test("cohesion gates every rule but the explosion", () => {
  // A cave ceiling exists only because its bond is satisfied. If `is_held`
  // stops gating `emit`, the world caves in on the first frame.
  const emit = simulation.match(/\nfn\s+emit\([\s\S]*?\n\}/)?.[0] ?? "";
  const blast = emit.indexOf("REASON_BLAST;");
  const held = emit.indexOf("!is_held(");
  assert.ok(blast >= 0 && held > blast, "the blast branch must come before the cohesion test");
  const isHeld = simulation.match(/\nfn\s+is_held\([\s\S]*?\n\}/)?.[0] ?? "";
  assert.match(isHeld, /bond == 0u/, "a bond of zero must be immovable");
  assert.match(isHeld, /orthogonal >= bond/, "the orthogonal neighbours must short-circuit the diagonals");
});

test("every dispatched pass exists in the shader with the expected workgroup size", () => {
  for (const pass of [...COMPUTE_PASSES, "init_pool"]) {
    const declared = simulation.match(new RegExp(`@compute\\s+@workgroup_size\\((\\d+)\\)\\s*\\nfn\\s+${pass}\\b`));
    assert.ok(declared, `entry point ${pass} is missing`);
    // `prepare` is a single-thread bookkeeping pass; the rest are wide.
    assert.equal(Number(declared[1]), pass === "prepare" ? 1 : WORKGROUP_SIZE, `${pass} workgroup size`);
  }
});

test("only settle pushes to the free ring; everything else only pops", () => {
  // The ring is safe because pushes and pops never mix within a dispatch, and
  // every popper spends the budget `prepare` snapshotted. Lemmings pop too —
  // digging and coming apart both take slots — so they must be pop-only as well.
  const bodies = Object.fromEntries(
    [...simulation.matchAll(/\nfn\s+(\w+)\([\s\S]*?\n\}/g)].map((match) => [match[1], match[0]]),
  );
  for (const pass of ["release_cell", "shatter"]) {
    assert.doesNotMatch(bodies[pass], /counters\.tail/, `${pass} must not push to the ring`);
    assert.match(bodies[pass], /atomicSub\(&counters\.pop_budget, 1\)/,
      `${pass} must claim from the budget before popping`);
  }
});

/**
 * The shader's whole definition of one function, from its `fn` to the closing
 * brace in column zero.
 *
 * @param {string} name @returns {string}
 */
function body(name) {
  const start = simulation.indexOf(`
fn ${name}(`);
  if (start < 0) return "";
  const end = simulation.indexOf(`
}`, start);
  return end < 0 ? "" : simulation.slice(start, end + 2);
}

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

test("the shader agrees with sand.js on what the three support cases are", () => {
  for (const [name, value] of [
    ["SUPPORT_FIRM", SUPPORT_FIRM],
    ["SUPPORT_FALL", SUPPORT_FALL],
    ["SUPPORT_SLUMP", SUPPORT_SLUMP],
  ]) {
    const declared = simulation.match(new RegExp(`const\\s+${name}\\s*:\\s*i32\\s*=\\s*(-?\\d+)`))?.[1];
    assert.equal(Number(declared), value, `${name} differs between shader and JavaScript`);
  }
});

test("a pixel settles as rubble, unless it is water", () => {
  // Blasted stone must not re-freeze into cliff face that holds a ceiling up,
  // so `settle` overwrites the bond it carried with the rubble bond. Water has
  // to be the exception: settle a drop as rubble and it turns to sand the first
  // time it lands, so a river would silt up into a sandbank.
  const settle = simulation.match(/\nfn\s+settle\([\s\S]*?\n\}/)?.[0] ?? "";
  assert.ok(settle, "settle is missing from the shader");
  assert.match(settle, /&\s*~BOND_MASK/, "the carried bond must be cleared");
  assert.match(settle, /landed_bond << BOND_SHIFT/, "and replaced deliberately");
  assert.match(settle, /var landed_bond = params\.rubble_bond;/);
  assert.match(settle, /if \(is_water\(state\)\) \{ landed_bond = WATER_BOND; \}/,
    "water must settle as water");
});

test("water is held by nothing, and knows where to go on its own", () => {
  // A bond of fifteen cannot be met by eight neighbours, so every existing
  // "is this held?" already answers no for water. Only the direction is new,
  // and the flat sideways step is what separates it from sand.
  const bond = Number(simulation.match(/const\s+WATER_BOND\s*:\s*u32\s*=\s*(\d+)u/)?.[1]);
  assert.equal(bond, WATER_BOND);
  assert.ok(bond > 8, "eight neighbours must never be able to satisfy it");

  const flow = simulation.match(/\nfn\s+water_flow\([\s\S]*?\n\}/)?.[0] ?? "";
  assert.ok(flow, "water_flow is missing from the shader");
  assert.match(flow, /open_at\(x, y - 1\)[\s\S]*?return vec2i\(0, -1\)/, "down first");
  assert.match(flow, /open_at\(x - 1, y\)/, "then flat sideways, which sand never does");
  assert.match(flow, /return vec2i\(0, 0\)/, "and it must be able to stop, or a pool churns for ever");

  // The water branch has to come before the cohesion test, which would
  // otherwise release it with the sand rule's idea of a direction.
  const emit = simulation.match(/\nfn\s+emit\([\s\S]*?\n\}/)?.[0] ?? "";
  const water = emit.indexOf("is_water(value)");
  const held = emit.indexOf("!is_held(");
  assert.ok(water >= 0 && water < held, "water must be handled before cohesion");
});

test("the shader agrees that water holds nothing up", () => {
  // The one line the whole of sinking rests on. `solid_at` feeds every support
  // count in the shader, so discounting water there is what makes a grain on a
  // pool answer "not held" to the cohesion test it was already running.
  const solid = body("solid_at");
  assert.ok(solid, "solid_at is missing from the shader");
  assert.match(solid, /is_water\(/, "water must not be counted as support");
  for (const caller of ["support_count", "is_held"]) {
    assert.match(body(caller), /solid_at\(/, `${caller} must go through solid_at`);
  }
});

test("sand and water trade places, and exactly one of them may have the cell", () => {
  const emit = body("emit");
  assert.ok(emit, "emit is missing from the shader");

  // The swap is the only thing in the simulation that writes a cell other than
  // its own, so the cell it reaches for has to be claimed rather than simply
  // stored into: the water's own invocation may be releasing it in the same
  // pass, and exactly one of the two may end up with it.
  assert.match(emit, /displaces_water\(/, "emit must offer the trade");
  assert.match(
    emit,
    /atomicCompareExchangeWeak\(&field\[below\], under, value\)/,
    "the cell below must be claimed with a compare-exchange",
  );

  // The other side of that race: a release claims its own cell before it spends
  // anything from the pool, so a losing claim costs nothing and leaves nothing
  // half-done.
  const claim = emit.indexOf("atomicCompareExchangeWeak(&field[c], value, 0u)");
  const budget = emit.indexOf("atomicSub(&counters.pop_budget");
  const pop = emit.indexOf("atomicAdd(&counters.head");
  assert.ok(claim >= 0, "emit must claim the cell it releases");
  assert.ok(claim < budget && budget < pop, "claim, then budget, then the slot");
  assert.doesNotMatch(
    emit,
    /atomicStore\(&field\[c\], 0u\)/,
    "an unconditional store would clobber a cell the swap had just claimed",
  );

  // Sinking is free: it moves nothing into the pool, so it must not be gated on
  // a pool that has run out, or a flooded world would stop sinking exactly when
  // it was busiest.
  assert.ok(emit.indexOf("displaces_water(") < budget, "the trade happens before the pool budget");
});

test("a lemming drowns on contact with water", () => {
  const step = simulation.match(/\nfn\s+step_agents\([\s\S]*?\n\}/)?.[0] ?? "";
  const drown = step.indexOf("touches_water(x, y)");
  const debris = step.indexOf("struck_by_debris(x, y)");
  assert.ok(drown >= 0, "step_agents must check for water");
  assert.ok(drown < debris, "and drowning is checked before being hit by debris");
  assert.match(step, /counters\.drowned/, "drownings are counted separately");
});

test("an impact hands over momentum rather than destroying it", () => {
  // A striker that knocks a pixel loose must slow, not reverse: reversing while
  // the target departs would invent momentum out of nothing.
  const strike = simulation.match(/\nfn\s+strike\([\s\S]*?\n\}/)?.[0] ?? "";
  assert.ok(strike, "strike is missing from the shader");
  assert.match(strike, /bond == 0u\) \{ return false/, "bedrock must not absorb an impact");
  assert.match(strike, /atomicStore\(&impulse\[c\], pack2x16float\(momentum\)\)/,
    "the cell must be given the momentum");
  // Without a resistance term proportional to surplus support, every pixel that
  // lands knocks the floor from under itself and one impact liquefies the pile.
  assert.match(strike, /surplus \* IMPACT_RESISTANCE/, "a buried cell must resist an impact");

  // Exactly one striker a frame may move a cell. Summing every striker's share
  // into one grain launches it at a speed no single pixel ever had, and beyond
  // the range of an f16 it becomes an infinity that turns the cell index to
  // garbage — explosions out of nowhere.
  assert.doesNotMatch(simulation, /add_impulse/, "momentum must not accumulate on a cell");
  assert.match(strike, /let previous = atomicOr\(&field\[c\], DISLODGE_BIT\);[\s\S]*?previous & DISLODGE_BIT\) != 0u\) \{ return false/,
    "the claim must be an atomic test-and-set");
  // The threshold must gate every striker, not only the first one through.
  const gate = strike.indexOf("IMPACT_RESISTANCE");
  const claim = strike.indexOf("atomicOr(&field[c]");
  assert.ok(gate >= 0 && gate < claim, "the speed threshold must be checked before the claim");
});

test("a pixel may never skip over what lies in its path", () => {
  // Testing only the destination cell lets a fast pixel jump clean over solid
  // ones — six a substep at blast speed — so pixels pass through pixels, land
  // under floors and pile up from beneath. The step has to be swept.
  const integrate = simulation.match(/\nfn\s+integrate\([\s\S]*?\n\}/)?.[0] ?? "";
  assert.match(integrate, /for \(var step = 0u; step < steps; step \+= 1u\)/, "movement must be swept");
  assert.match(integrate, /if \(span > f32\(MAX_SWEEP_STEPS\)\) \{ travel \*= f32\(MAX_SWEEP_STEPS\) \/ span; \}/,
    "and the distance capped, or a step could still span more than a cell");
  assert.match(integrate, /if \(hit\) \{ break; \}/, "a contact must end the sweep, the velocity having changed");
  const steps = Number(simulation.match(/const\s+MAX_SWEEP_STEPS\s*:\s*u32\s*=\s*(\d+)u/)?.[1]);
  assert.ok(steps >= 2, `a sweep of ${steps} steps cannot catch anything`);

  // `shared` would read better than `absorbed` here, but it is a reserved word
  // in WGSL and the shader fails to compile rather than warning.
  assert.match(integrate, /if \(absorbed\) \{ v\.x = striker_share\(v\.x\); \} else \{ v\.x = reflect_axis\(v\.x\); \}/);
  assert.match(integrate, /if \(absorbed\) \{ v\.y = striker_share\(v\.y\); \} else \{ v\.y = reflect_axis\(v\.y\); \}/);
});

test("the shader splits a collision the same way collision.js does", () => {
  // Otherwise momentum leaks on the GPU while the unit tests stay green.
  const striker = simulation.match(/fn striker_share[\s\S]*?return ([^;]+);/)?.[1] ?? "";
  const target = simulation.match(/fn target_share[\s\S]*?return ([^;]+);/)?.[1] ?? "";
  assert.match(striker, /\(1\.0 - params\.restitution\) \* 0\.5/);
  assert.match(target, /\(1\.0 \+ params\.restitution\) \* 0\.5/);
});

test("a struck cell launches with the momentum it was handed", () => {
  const emit = simulation.match(/\nfn\s+emit\([\s\S]*?\n\}/)?.[0] ?? "";
  assert.match(emit, /REASON_DISLODGE\)[\s\S]*?unpack2x16float\(atomicExchange\(&impulse\[c\], 0u\)\)/,
    "an impact must splash in the direction it came from, not drop limply");
});

test("support_at consults all three cells beneath, not just the one below", () => {
  const support = simulation.match(/\nfn\s+support_at\([\s\S]*?\n\}/)?.[0] ?? "";
  assert.match(support, /open_at\(x, y - 1\)/, "the cell directly below");
  assert.match(support, /open_at\(x - 1, y - 1\)/, "the diagonal to the left");
  assert.match(support, /open_at\(x \+ 1, y - 1\)/, "the diagonal to the right");
});

test("emit refuses to pop without budget, which is what caps pixels in motion", () => {
  const emit = simulation.match(/\nfn\s+emit\([\s\S]*?\n\}/)?.[0] ?? "";
  const budgetCheck = emit.indexOf("atomicSub(&counters.pop_budget");
  const pop = emit.indexOf("atomicAdd(&counters.head");
  assert.ok(budgetCheck >= 0 && pop > budgetCheck, "the budget must be claimed before the ring is popped");
  assert.match(emit, /atomicAdd\(&counters\.denied/);
});

test("every wide pass unfolds a two-dimensional dispatch", () => {
  // Missing this on even one pass reads the wrong slot for every invocation
  // past the first dimension — silent corruption, not an error.
  for (const pass of COMPUTE_PASSES.filter((name) => name !== "prepare").concat("init_pool")) {
    const body = simulation.match(new RegExp(`\\nfn\\s+${pass}\\([\\s\\S]*?\\n\\}`))?.[0] ?? "";
    assert.match(body, /num_workgroups/, `${pass} does not take the workgroup count`);
    assert.match(body, /linear_index\(gid, groups\)/, `${pass} does not unfold the dispatch`);
  }
  const declared = simulation.match(/const\s+WORKGROUP_SIZE\s*:\s*u32\s*=\s*(\d+)u/)?.[1];
  assert.equal(Number(declared), WORKGROUP_SIZE, "the shader's workgroup size must match layout.js");
});

test("a pixel checks what is under it one last time before settling", () => {
  // "Has not changed cell" is not enough on its own. At the apex of an arc a
  // pixel barely moves from one frame to the next, so without this it settles
  // in mid-air — and a brushful of them reaching apex together forms a clump
  // whose interior satisfies its own bond, which then hangs there for good.
  const settle = simulation.match(/\nfn\s+settle\([\s\S]*?\n\}/)?.[0] ?? "";
  const check = settle.indexOf("open_at(x, y - 1)");
  const deposit = settle.indexOf("atomicCompareExchangeWeak");
  assert.ok(check >= 0, "settle must look at the cell underneath");
  assert.ok(check < deposit, "and it must look before it commits");
});

test("a pixel whose cell is taken is never launched", () => {
  // This was the bug behind visible pixels drifting upward through solid rock:
  // the loser of a race for a cell was given upward velocity and had collision
  // switched off so it could climb out. It must be handed a cell instead.
  const settle = simulation.match(/\nfn\s+settle\([\s\S]*?\n\}/)?.[0] ?? "";
  assert.ok(settle, "settle is missing from the shader");
  assert.doesNotMatch(settle, /ESCAPE_SPEED/, "no upward kick may survive here");
  assert.match(settle, /rescue_deposit\(/, "the loser must be offered a nearby cell");
  assert.doesNotMatch(simulation, /ESCAPE_SPEED/, "the constant itself should be gone");
});

test("collision is never switched off, only the pixel's own cell is exempt", () => {
  // A pixel with collision off rises through rock on the way up and sinks
  // through it on the way down. Exempting the cell it already occupies is
  // enough to let a pixel that got built over move again.
  const integrate = simulation.match(/\nfn\s+integrate\([\s\S]*?\n\}/)?.[0] ?? "";
  assert.doesNotMatch(integrate, /embedded/, "there must be no collision bypass");
  assert.match(integrate, /step_x != home_x && blocked_at/, "the home cell must not block a sideways step");
  assert.match(integrate, /home_y \|\| column != home_x\) && blocked_at/, "nor a vertical one");
});

test("a buried pixel stays where it is and looks outward for space", () => {
  // Two earlier cures both put something on screen drifting upward. Swapping
  // with the cell above marches material through solid rock; carrying the pixel
  // up to the surface relocates its matter hundreds of cells, because a pixel
  // built over just inside a crater wall has space two cells sideways and a
  // quarter of a screen of rock above it. It must neither write the field nor
  // travel: it searches radially, and waits if that fails.
  const settle = simulation.match(/\nfn\s+settle\([\s\S]*?\n\}/)?.[0] ?? "";
  assert.doesNotMatch(settle, /atomicExchange/, "the buried path must not write the field");
  const writes = settle.match(/atomic(Store|Exchange|Or|And|Add)\(&field/g) ?? [];
  assert.deepEqual(writes, [], "only the compare-exchange deposits may touch the field");
  assert.doesNotMatch(settle, /p\.pos_y = f32\(y \+ 1\)/, "a buried pixel must not climb");

  // The search has to be radial and to widen over time, or a pixel entombed in
  // a refilled crater never finds the space that exists further out.
  const rescue = simulation.match(/\nfn\s+rescue_deposit\([\s\S]*?\n\}/)?.[0] ?? "";
  assert.match(rescue, /scan_ring\(x, y, bias, value, probe\)/, "the search must widen over frames");
  assert.match(settle, /let probe = RESCUE_RINGS \+ 1 \+/, "and the probe ring must advance");
});

test("buried pixels are not drawn", () => {
  // They sit inside solid material that the field already draws. Splatting them
  // as well is what put moving pixels on screen inside rock.
  const splat = simulation.match(/\nfn\s+splat\([\s\S]*?\n\}/)?.[0] ?? "";
  const guard = splat.indexOf("!open_at(x, y)");
  const draw = splat.indexOf("atomicMax(&overlay");
  assert.ok(guard >= 0 && guard < draw, "the buried check must come before the splat");
});

test("blast debris keeps a floor of speed at the rim", () => {
  // A linear taper reaches zero at the rim, so the outermost debris never moved
  // and the collapsing crater buried tens of thousands of pixels on top of it.
  const emit = simulation.match(/\nfn\s+emit\([\s\S]*?\n\}/)?.[0] ?? "";
  assert.match(emit, /BLAST_RIM \+ \(1\.0 - BLAST_RIM\)/);
  const rim = Number(simulation.match(/const\s+BLAST_RIM\s*:\s*f32\s*=\s*([\d.]+)/)?.[1]);
  assert.ok(rim > 0 && rim < 1, `the rim floor must be a real fraction, got ${rim}`);
});

test("the pointer brush is a smudge unless it has no direction", () => {
  // A blast fires material radially, which inside a pocket means into the
  // nearest wall: too well bonded to break, so the debris reflects and comes
  // straight back inward. A drag carries it somewhere it can actually go.
  const emit = simulation.match(/\nfn\s+emit\([\s\S]*?\n\}/)?.[0] ?? "";
  assert.match(emit, /let smudging = dot\(params\.brush_drag, params\.brush_drag\) > 0\.0/);
  assert.match(emit, /if \(smudging\)[\s\S]*?vel = params\.brush_drag \* params\.blast\.w/,
    "a drag must carry material along the pointer");
  assert.match(emit, /!smudging \|\| smudgeable\(x, y, bond_of\(value\)\)/,
    "a blast takes anything under the brush; a smudge only what it can reach");

  // Releasing everything under the brush liquefies solid rock for as long as
  // the pointer is held, far faster than any of it can settle, and entombs an
  // order of magnitude more pixels than a blast does.
  const smudgeable = simulation.match(/\nfn\s+smudgeable\([\s\S]*?\n\}/)?.[0] ?? "";
  assert.ok(smudgeable, "smudgeable is missing from the shader");
  assert.match(smudgeable, /bond == 0u\) \{ return false/, "a smudge must not shift bedrock");
  assert.match(smudgeable, /support_count\(x, y\)\) - i32\(bond\) <= SMUDGE_REACH/,
    "and must only take material with little support to spare");
});

test("a lemming reads what hit it, not its own sprite", () => {
  // Both live in the overlay, so without separate markers a lemming sees the
  // body it drew last frame and shatters itself on the spot. The fast marker
  // also carries the speed the overlay otherwise has no room for.
  const struck = simulation.match(/\nfn\s+struck_by_debris\([\s\S]*?\n\}/)?.[0] ?? "";
  assert.ok(struck, "struck_by_debris is missing from the shader");
  assert.match(struck, /OVERLAY_FAST/, "it must look for the fast marker");
  assert.doesNotMatch(struck, /OVERLAY_AGENT/, "and must ignore agent sprites");

  const splat = simulation.match(/\nfn\s+splat\([\s\S]*?\n\}/)?.[0] ?? "";
  assert.match(splat, /AGENT_SHATTER_SPEED[\s\S]*?OVERLAY_FAST/,
    "splat must flag the cells a fast pixel is passing through");
  const draw = simulation.match(/\nfn\s+draw_agents\([\s\S]*?\n\}/)?.[0] ?? "";
  assert.match(draw, /OVERLAY_AGENT/, "and an agent must mark its own sprite");
});

test("lemmings draw on the same pool budget the world does", () => {
  // Digging and detonating both pop free slots. `step_agents` runs before
  // `emit`, so they compete for the budget `prepare` snapshotted rather than
  // spending on top of it and overrunning the ring.
  const passes = COMPUTE_PASSES;
  assert.ok(passes.indexOf("step_agents") > passes.indexOf("settle"));
  assert.ok(passes.indexOf("step_agents") < passes.indexOf("emit"));
  // Drawing has to come after emit, which is what clears the overlay.
  assert.ok(passes.indexOf("draw_agents") > passes.indexOf("emit"));
  assert.ok(passes.indexOf("draw_agents") > passes.indexOf("splat"));

  const release = simulation.match(/\nfn\s+release_cell\([\s\S]*?\n\}/)?.[0] ?? "";
  assert.match(release, /atomicSub\(&counters\.pop_budget, 1\)/, "digging must claim a slot");
  const shatter = simulation.match(/\nfn\s+shatter\([\s\S]*?\n\}/)?.[0] ?? "";
  assert.match(shatter, /atomicSub\(&counters\.pop_budget, 1\)/, "and so must coming apart");
});

test("a lost lemming is replaced rather than simply gone", () => {
  // Bombs kill the bomber and the debris takes its neighbours, so without a
  // respawn the population only falls and the world goes quiet.
  const step = simulation.match(/\nfn\s+step_agents\([\s\S]*?\n\}/)?.[0] ?? "";
  assert.match(step, /AGENT_RESPAWN/, "death must leave a countdown");
  assert.match(step, /waiting > 1u/, "which is ticked down");
});
