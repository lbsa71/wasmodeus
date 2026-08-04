import { GALAXY_STAR_COUNT, initializeGalaxy, rootChildStarCount, seededMass, seededTemperatureKelvin } from "./core/galaxy";
import { circularVelocityKmPerSecond } from "./core/potential";

export function initialize(seedLow: u32, seedHigh: u32): void {
  initializeGalaxy(seedLow, seedHigh);
}

export function getGalaxyStarCount(): f64 { return GALAXY_STAR_COUNT; }
export function getRootChildStarCount(child: i32): f64 { return rootChildStarCount(child); }
export function getSeededMass(sectorHi: u32, sectorLo: u32, ordinal: u32): f64 { return seededMass(sectorHi, sectorLo, ordinal); }
export function getSeededTemperatureKelvin(sectorHi: u32, sectorLo: u32, ordinal: u32): f64 { return seededTemperatureKelvin(sectorHi, sectorLo, ordinal); }
export function getCircularVelocityKmPerSecond(radiusKpc: f64): f64 { return circularVelocityKmPerSecond(radiusKpc); }
