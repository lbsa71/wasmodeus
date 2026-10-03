export function radius(mass: f64, baseRadius: f64, startMass: f64): f64 {
  return baseRadius * Math.sqrt(mass / startMass);
}
export function speed(mass: f64, startMass: f64, baseSpeed: f64, exponent: f64): f64 {
  return baseSpeed * Math.pow(mass / startMass, exponent);
}
export function canEat(eaterMass: f64, preyMass: f64, ratio: f64): i32 {
  return eaterMass > preyMass * ratio ? 1 : 0;
}
export function touches(ax: f64, ay: f64, ar: f64, bx: f64, by: f64, br: f64): i32 {
  const dx = ax - bx, dy = ay - by, radius = ar + br;
  return dx * dx + dy * dy <= radius * radius ? 1 : 0;
}
