/**
 * Tuning for the simulation, in world units (one unit is one cell) and seconds.
 */
import { DEFAULT_CAPACITY } from "./capacity.js";
import { DEFAULT_REST_THRESHOLD } from "./rest.js";
import { DEFAULT_WORLD_HEIGHT, DEFAULT_WORLD_WIDTH } from "./world-gen.js";
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
 *   agents: { count: number, speed: number, bombChance: number, blastRadius: number }
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
    // Lemmings: how many walk the world, how fast, how readily one sits down
    // and lights a bomb, and how big a hole that leaves.
    agents: { count: 600, speed: 26, bombChance: 0.12, blastRadius: 20 },
  };
}
