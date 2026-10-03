/** @type {import('./types.js').MathPort} */
export const referencePhysics = {
  radius: (mass, radius, start) => radius * Math.sqrt(mass / start),
  speed: (mass, start, speed, exponent) => speed * (mass / start) ** exponent,
  canEat: (mass, prey, ratio) => mass > prey * ratio,
  touches: (ax, ay, ar, bx, by, br) => (ax - bx) ** 2 + (ay - by) ** 2 <= (ar + br) ** 2,
};

/** @param {number} angle */
export function normalizeAngle(angle) { return Math.atan2(Math.sin(angle), Math.cos(angle)); }

/** @param {import('./types.js').Fish} fish @param {import('./types.js').Vector} control @param {import('./types.js').Config} config @param {import('./types.js').MathPort} math */
export function moveFish(fish, control, config, math) {
  fish.effort = Math.min(1, Math.hypot(control.x, control.y));
  if (control.x === 0 && control.y === 0) return;
  const desired = Math.atan2(control.y, control.x);
  const turn = config.turnRate / (Math.max(1, fish.mass / config.startMass) ** config.turnExponent * config.tickRate);
  fish.heading = normalizeAngle(fish.heading + Math.max(-turn, Math.min(turn, normalizeAngle(desired - fish.heading))));
  const strength = fish.effort;
  const distance = math.speed(fish.mass, config.startMass, config.baseSpeed, config.speedExponent) * strength / config.tickRate;
  fish.x += Math.cos(fish.heading) * distance;
  fish.y += Math.sin(fish.heading) * distance;
}

/** @param {import('./types.js').Vector} startA @param {import('./types.js').Vector} endA @param {import('./types.js').Vector} startB @param {import('./types.js').Vector} endB @param {number} radius */
export function sweptContact(startA, endA, startB, endB, radius) {
  const x = startA.x - startB.x, y = startA.y - startB.y;
  const vx = (endA.x - startA.x) - (endB.x - startB.x);
  const vy = (endA.y - startA.y) - (endB.y - startB.y);
  const c = x * x + y * y - radius * radius;
  if (c <= 0) return 0;
  const a = vx * vx + vy * vy;
  if (a === 0) return null;
  const b = 2 * (x * vx + y * vy), discriminant = b * b - 4 * a * c;
  if (discriminant < 0) return null;
  const t = (-b - Math.sqrt(discriminant)) / (2 * a);
  return t >= 0 && t <= 1 ? t : null;
}
