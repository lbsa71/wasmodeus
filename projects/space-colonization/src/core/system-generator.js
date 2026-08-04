import { planetBodyPath } from "./body-ref.js";

const MASK_64 = (1n << 64n) - 1n;

/** @param {bigint} value */
function mix64(value) {
  let result = value & MASK_64;
  result ^= result >> 30n;
  result = (result * 0xbf58476d1ce4e5b9n) & MASK_64;
  result ^= result >> 27n;
  result = (result * 0x94d049bb133111ebn) & MASK_64;
  return (result ^ (result >> 31n)) & MASK_64;
}

/** @param {bigint} seed @param {import("./body-ref.js").BodyRef} star @param {number} channel */
function random(seed, star, channel) {
  const key = seed ^ (BigInt(star.sectorPathHi) << 32n) ^ BigInt(star.sectorPathLo) ^ (BigInt(star.ordinal) << 17n) ^ BigInt(channel);
  return Number(mix64(key) >> 11n) / 9007199254740992;
}

/** @param {{ semiMajorAxisAu: number, massSolar: number }} inner @param {{ semiMajorAxisAu: number, massSolar: number }} outer @param {number} primaryMassSolar */
export function minimumMutualHillSpacing(inner, outer, primaryMassSolar) {
  const meanAxis = (inner.semiMajorAxisAu + outer.semiMajorAxisAu) / 2;
  const mutualHill = meanAxis * (((inner.massSolar + outer.massSolar) / (3 * primaryMassSolar)) ** (1 / 3));
  return (outer.semiMajorAxisAu - inner.semiMajorAxisAu) / mutualHill;
}

/** @param {bigint} seed @param {import("./body-ref.js").BodyRef} star @param {number} primaryMassSolar */
export function generateSystem(seed, star, primaryMassSolar) {
  const planetCount = 1 + Math.floor(random(seed, star, 0) * 6);
  const planets = [];
  let previousAxis = 0.18 + (0.25 * random(seed, star, 1));
  for (let index = 0; index < planetCount; index += 1) {
    const massSolar = 1e-6 * (0.15 + (20 * random(seed, star, 10 + index)));
    const semiMajorAxisAu = index === 0 ? previousAxis : previousAxis * (1.8 + (0.35 * random(seed, star, 30 + index)));
    const planet = {
      bodyPath: planetBodyPath(index + 1),
      massSolar,
      radiusEarth: Math.max(0.35, (massSolar / 3e-6) ** 0.28),
      semiMajorAxisAu,
      eccentricity: random(seed, star, 50 + index) * 0.08,
      inclinationRadians: random(seed, star, 70 + index) * 0.08,
      atmosphere: random(seed, star, 90 + index) > 0.35,
      albedo: 0.08 + (0.62 * random(seed, star, 110 + index)),
      moons: /** @type {Array<{ massSolar: number, semiMajorAxisAu: number, eccentricity: number }>} */ ([]),
      hillRadiusAu: semiMajorAxisAu * ((massSolar / (3 * primaryMassSolar)) ** (1 / 3)),
    };
    const moonCount = Math.floor(random(seed, star, 130 + index) * 3);
    for (let moonIndex = 0; moonIndex < moonCount; moonIndex += 1) {
      planet.moons.push({
        massSolar: massSolar * (1e-4 + (0.01 * random(seed, star, 150 + (index * 4) + moonIndex))),
        semiMajorAxisAu: planet.hillRadiusAu * (0.04 + (0.12 * (moonIndex + 1))),
        eccentricity: random(seed, star, 180 + (index * 4) + moonIndex) * 0.03,
      });
    }
    planets.push(planet);
    previousAxis = semiMajorAxisAu;
  }
  return { primaryMassSolar, planets };
}
