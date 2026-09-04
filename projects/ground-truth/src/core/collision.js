/**
 * What happens along one axis when a moving pixel meets something solid.
 *
 * There are two cases and they are not the same, which matters more than it
 * looks. Hitting something that will not move — bedrock, a wall, material whose
 * bond holds it — reflects the striker. Hitting something it knocks loose is a
 * collision between two equal masses, and there the striker *slows* rather than
 * reversing: reversing would invent momentum, a striker rebounding at -25 plus a
 * target leaving at +100 being more than the +100 you started with.
 *
 * One coefficient of restitution `e` covers both. It is the elasticity: at 1 the
 * collision is perfectly elastic and no energy leaves the system, which is what
 * makes a pile jitter for ever; below 1 each impact bleeds energy and the world
 * comes to rest.
 *
 * Mirrored by `reflect_axis` and `transfer_axis` in
 * `src/gpu/shaders/simulation.wgsl`.
 */

/**
 * Bouncing off something immovable.
 *
 * @param {number} velocity along the collision axis
 * @param {number} restitution
 * @returns {number} the striker's velocity afterwards
 */
export function reflect(velocity, restitution) {
  return -velocity * restitution;
}

/**
 * An equal-mass collision. The two results always sum to the incoming
 * velocity — momentum is handed over, never destroyed and never invented.
 *
 * @param {number} velocity along the collision axis
 * @param {number} restitution
 * @returns {{ striker: number, target: number }}
 */
export function transfer(velocity, restitution) {
  return {
    striker: velocity * (1 - restitution) / 2,
    target: velocity * (1 + restitution) / 2,
  };
}

/**
 * Fraction of kinetic energy that survives an equal-mass transfer. Anything
 * below one is what stops a heap bouncing for ever.
 *
 * @param {number} restitution
 * @returns {number}
 */
export function energyRatio(restitution) {
  const { striker, target } = transfer(1, restitution);
  return striker * striker + target * target;
}

/** Perfectly inelastic: the two move off together at half speed. */
export const MIN_RESTITUTION = 0;
/**
 * Perfectly elastic. Allowed, but nothing then removes energy on impact and a
 * disturbed pile will keep trading it back and forth indefinitely.
 */
export const MAX_RESTITUTION = 1;

/** @param {number} restitution @returns {number} */
export function clampRestitution(restitution) {
  return Math.min(MAX_RESTITUTION, Math.max(MIN_RESTITUTION, restitution));
}
