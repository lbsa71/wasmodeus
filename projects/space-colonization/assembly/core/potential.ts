function rawCircularVelocity(radiusKpc: f64): f64 {
  const disk = 220.0 * (1.0 - Math.exp(-radiusKpc / 2.6));
  const halo = 220.0 * radiusKpc / Math.sqrt(radiusKpc * radiusKpc + 64.0);
  const bulge = 90.0 * Math.exp(-radiusKpc / 1.2);
  return Math.sqrt(disk * disk + halo * halo + bulge * bulge);
}

const SOLAR_NORMALIZATION: f64 = 220.0 / rawCircularVelocity(8.0);

export function circularVelocityKmPerSecond(radiusKpc: f64): f64 {
  if (radiusKpc <= 0.0) return 0.0;
  return rawCircularVelocity(radiusKpc) * SOLAR_NORMALIZATION;
}
