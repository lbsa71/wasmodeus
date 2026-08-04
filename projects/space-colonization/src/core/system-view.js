export const AU_IN_PARSECS = 1 / 206_264.806;
const FRAME_MARGIN = 1.2;
const MINIMUM_SYSTEM_ZOOM_PARSECS = 2 * AU_IN_PARSECS;
const PLANET_FRAME_MARGIN = 1.5;
const MINIMUM_PLANET_ZOOM_PARSECS = 0.1 * AU_IN_PARSECS;

/**
 * Computes the orthographic half-height that encloses a generated system.
 * The furthest moon's apoapsis is included in its planet's envelope.
 * @param {{ planets: Array<{ semiMajorAxisAu: number, eccentricity: number, moons: Array<{ semiMajorAxisAu: number, eccentricity: number }> }> }} system
 */
export function systemZoomParsecs(system) {
  let outerRadiusAu = 0;
  for (const planet of system.planets) {
    let planetEnvelopeAu = planet.semiMajorAxisAu * (1 + planet.eccentricity);
    for (const moon of planet.moons) planetEnvelopeAu += moon.semiMajorAxisAu * (1 + moon.eccentricity);
    outerRadiusAu = Math.max(outerRadiusAu, planetEnvelopeAu);
  }
  return Math.max(MINIMUM_SYSTEM_ZOOM_PARSECS, outerRadiusAu * FRAME_MARGIN * AU_IN_PARSECS);
}

/** @param {number} bodyPath */
export function planetIndexFromBodyPath(bodyPath) {
  return ((bodyPath >>> 24) & 0xff) - 1;
}

/** @param {{ moons: Array<{ semiMajorAxisAu: number, eccentricity: number }> }} planet */
export function planetZoomParsecs(planet) {
  const outerMoonAu = planet.moons.reduce((outer, moon) => Math.max(outer, moon.semiMajorAxisAu * (1 + moon.eccentricity)), 0);
  return Math.max(MINIMUM_PLANET_ZOOM_PARSECS, outerMoonAu * PLANET_FRAME_MARGIN * AU_IN_PARSECS);
}
