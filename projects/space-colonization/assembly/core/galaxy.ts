import { philoxUnit } from "./prng";

export const GALAXY_STAR_COUNT: f64 = 100000000000.0;
export const ROOT_EDGE_PARSECS: f64 = 256000.0;
export const OCTREE_DEPTH: i32 = 14;

let galaxySeed: u64 = 0x5EEDC0DE;

export function initializeGalaxy(seedLow: u32, seedHigh: u32): void {
  galaxySeed = (<u64>seedHigh << 32) | <u64>seedLow;
}

/** Root octants have equal volume and are exactly apportioned in v1. */
export function rootChildStarCount(child: i32): f64 {
  if (child < 0 || child > 7) return 0.0;
  const base = Math.floor(GALAXY_STAR_COUNT / 8.0);
  const remainder = <i32>(GALAXY_STAR_COUNT - (base * 8.0));
  return base + (child < remainder ? 1.0 : 0.0);
}

/** Kroupa-like, low-mass-dominated stellar mass sampling in solar masses. */
export function seededMass(sectorHi: u32, sectorLo: u32, ordinal: u32): f64 {
  const branch = philoxUnit(galaxySeed, sectorHi, sectorLo, ordinal, 0);
  const sample = philoxUnit(galaxySeed, sectorHi, sectorLo, ordinal, 1);
  if (branch < 0.7) return 0.08 + 0.42 * Math.pow(sample, 1.35);
  return Math.min(50.0, 0.5 * Math.pow(1.0 - sample, -0.72));
}

export function seededTemperatureKelvin(sectorHi: u32, sectorLo: u32, ordinal: u32): f64 {
  return 2600.0 + 5800.0 * Math.min(1.0, Math.pow(seededMass(sectorHi, sectorLo, ordinal), 0.45));
}
