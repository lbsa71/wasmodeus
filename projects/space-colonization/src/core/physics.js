const DAYS_PER_YEAR = 365.25;
const SOLAR_MU_AU_DAY = (4 * Math.PI ** 2) / (DAYS_PER_YEAR ** 2);

/** @param {number} z */
function stumpffC(z) {
  if (z > 1e-8) return (1 - Math.cos(Math.sqrt(z))) / z;
  if (z < -1e-8) return (Math.cosh(Math.sqrt(-z)) - 1) / -z;
  return 0.5 - (z / 24) + ((z * z) / 720);
}

/** @param {number} z */
function stumpffS(z) {
  if (z > 1e-8) { const root = Math.sqrt(z); return (root - Math.sin(root)) / (root ** 3); }
  if (z < -1e-8) { const root = Math.sqrt(-z); return (Math.sinh(root) - root) / (root ** 3); }
  return (1 / 6) - (z / 120) + ((z * z) / 5_040);
}

/** @param {number[]} left @param {number[]} right */
function dot(left, right) { return left[0] * right[0] + left[1] * right[1] + left[2] * right[2]; }
/** @param {number[]} vector */
function magnitude(vector) { return Math.sqrt(dot(vector, vector)); }
/** @param {number[]} left @param {number[]} right @param {number} leftScale @param {number} rightScale */
function combine(left, right, leftScale, rightScale) { return [left[0] * leftScale + right[0] * rightScale, left[1] * leftScale + right[1] * rightScale, left[2] * leftScale + right[2] * rightScale]; }

/**
 * Universal-variable two-body propagation in AU, days, and solar masses.
 * @param {{ positionAu: number[], velocityAuPerDay: number[], primaryMassSolar: number }} orbit
 * @param {number} deltaDays
 */
export function advanceKeplerOrbit(orbit, deltaDays) {
  const r0 = orbit.positionAu;
  const v0 = orbit.velocityAuPerDay;
  const r0Length = magnitude(r0);
  const mu = SOLAR_MU_AU_DAY * orbit.primaryMassSolar;
  const radialVelocity = dot(r0, v0) / r0Length;
  const alpha = (2 / r0Length) - (dot(v0, v0) / mu);
  let x = Math.sqrt(mu) * Math.abs(alpha) * deltaDays;
  if (Math.abs(alpha) < 1e-12) x = Math.sqrt(mu) * deltaDays / r0Length;
  for (let iteration = 0; iteration < 32; iteration += 1) {
    const z = alpha * x * x;
    const c = stumpffC(z);
    const s = stumpffS(z);
    const f = ((r0Length * radialVelocity) / Math.sqrt(mu)) * x * x * c + ((1 - (alpha * r0Length)) * x ** 3 * s) + (r0Length * x) - (Math.sqrt(mu) * deltaDays);
    const derivative = ((r0Length * radialVelocity) / Math.sqrt(mu)) * x * (1 - (z * s)) + ((1 - (alpha * r0Length)) * x * x * c) + r0Length;
    const correction = f / derivative;
    x -= correction;
    if (Math.abs(correction) < 1e-13) break;
  }
  const z = alpha * x * x;
  const c = stumpffC(z);
  const s = stumpffS(z);
  const f = 1 - ((x * x / r0Length) * c);
  const g = deltaDays - ((x ** 3 / Math.sqrt(mu)) * s);
  const positionAu = combine(r0, v0, f, g);
  const radius = magnitude(positionAu);
  const fDot = (Math.sqrt(mu) / (radius * r0Length)) * ((alpha * x ** 3 * s) - x);
  const gDot = 1 - ((x * x / radius) * c);
  return { positionAu, velocityAuPerDay: combine(r0, v0, fDot, gDot) };
}

/** @param {number} radiusKpc */
export function circularVelocityKmPerSecond(radiusKpc) {
  const disk = 220 * (1 - Math.exp(-radiusKpc / 2.6));
  const halo = 220 * (radiusKpc / Math.sqrt((radiusKpc * radiusKpc) + 64));
  const bulge = 90 * Math.exp(-radiusKpc / 1.2);
  const raw = Math.hypot(disk, halo, bulge);
  return raw * (220 / Math.hypot(220 * (1 - Math.exp(-8 / 2.6)), 220 * (8 / Math.sqrt(128)), 90 * Math.exp(-8 / 1.2)));
}

/** @param {{ mass: number, radius: number, velocity: number[] }} left @param {{ mass: number, radius: number, velocity: number[] }} right */
export function mergeBodies(left, right) {
  const mass = left.mass + right.mass;
  return { mass, radius: Math.cbrt((left.radius ** 3) + (right.radius ** 3)), velocity: combine(left.velocity, right.velocity, left.mass / mass, right.mass / mass) };
}
