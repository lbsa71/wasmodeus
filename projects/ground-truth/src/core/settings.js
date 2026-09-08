/**
 * Tuning for the simulation, in world units (one unit is one cell) and seconds.
 */
import { DEFAULT_CAPACITY } from "./capacity.js";
import { DEFAULT_REST_THRESHOLD } from "./rest.js";
import { DEFAULT_WORLD_HEIGHT, DEFAULT_WORLD_SIZE, DEFAULT_WORLD_WIDTH, WORLD_SIZES } from "./world-gen.js";

export { DEFAULT_WORLD_SIZE, WORLD_SIZES };

/**
 * How many lemmings a world has room for: one per eight cells of width, so
 * the crowd on the surface is the same in every arena. Six hundred three-cell
 * lemmings on a 1 536-cell surface is more lemming than ground, and they
 * cannot pass each other.
 *
 * @param {{ width: number }} world
 * @returns {number}
 */
export function suggestedLemmings({ width }) {
  return Math.min(600, Math.max(100, Math.round(width / 8)));
}
import { RUBBLE_BOND } from "./palette.js";

/**
 * @typedef {{
 *   world: { width: number, height: number },
 *   seed: number,
 *   capacity: number,
 *   restThreshold: number,
 *   substeps: number,
 *   frameSeconds: number,
 *   gravity: number,
 *   damping: number,
 *   restitution: number,
 *   dislodgeSpeed: number,
 *   slumpChance: number,
 *   rubbleBond: number,
 *   slideSpeed: number,
 *   brushRadius: number,
 *   blastStrength: number,
 *   smudgeStrength: number,
 *   agents: { count: number, speed: number },
 *   evolution: {
 *     generationFrames: number, eliteFraction: number, mutationRate: number, mutationStrength: number,
 *     snapshotEvery: number
 *   },
 *   waterSpread: number
 * }} Settings
 */

/** @returns {Settings} */
export function defaultSettings() {
  return {
    world: { width: DEFAULT_WORLD_WIDTH, height: DEFAULT_WORLD_HEIGHT },
    seed: 1,
    capacity: DEFAULT_CAPACITY,
    restThreshold: DEFAULT_REST_THRESHOLD,
    // Four substeps keep a fast pixel under about two cells per step, which is
    // what stops an explosion firing debris straight through a cave wall.
    substeps: 4,
    frameSeconds: 1 / 60,
    gravity: 500,
    damping: 0.999,
    // Elasticity of every impact, and the only thing that removes energy from
    // a collision. A striker that knocks a pixel loose keeps `(1-e)/2` of its
    // velocity and hands over `(1+e)/2`; one that hits immovable material
    // simply reflects at `-e`. See `src/core/collision.js`.
    restitution: 0.18,
    // Speed an impact needs to shake a *marginally held* cell loose. A cell
    // with support to spare needs this much again for every surplus neighbour,
    // so a surface splashes while buried material ignores the same blow.
    dislodgeSpeed: 110,
    // Once a cell's bond has let go, how eagerly it slumps sideways rather than
    // waiting. Cohesion decides whether material moves at all; this decides how
    // fluid it looks when it does. See `src/core/sand.js`.
    slumpChance: 0.6,
    // Debris settles with this bond, so a blasted bank behaves like gravel from
    // then on rather than re-freezing into the cliff it came from.
    rubbleBond: RUBBLE_BOND,
    // Sideways speed given to a pixel rolling off a heap. Fast enough to change
    // cell inside `restThreshold` frames, or it would settle before it moved.
    slideSpeed: 60,
    brushRadius: 90,
    // A blast fires material radially, which in a confined pocket mostly means
    // into the nearest wall. A smudge carries it along the drag instead, so it
    // is far gentler and needs a fraction of the speed.
    blastStrength: 700,
    smudgeStrength: 240,
    // Lemmings: how many walk the world, and how fast.
    agents: { count: suggestedLemmings(WORLD_SIZES[DEFAULT_WORLD_SIZE]), speed: 26 },
    // How brains breed. A generation is twenty seconds; the top tenth keep
    // their weights and everyone else is a mutated cross of two of them. See
    // `src/core/brain.js`.
    // `snapshotEvery`: besides `latest.pop`, keep a numbered file every this
    // many generations when saving to a folder.
    evolution: { generationFrames: 1200, eliteFraction: 0.1, mutationRate: 0.1, mutationStrength: 0.5, snapshotEvery: 50 },
    // How briskly water creeps sideways. Water is released every frame it has
    // anywhere to go, so this only has to be enough to carry a drop into the
    // next cell; a real shove would make it arc away like grit.
    waterSpread: 46,
  };
}
