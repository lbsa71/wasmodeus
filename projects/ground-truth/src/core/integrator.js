/**
 * Semi-implicit Euler with per-axis collision resolution, mirroring the
 * `integrate` entry point in `src/gpu/shaders/simulation.wgsl`. Resolving x
 * and y separately is what lets a pixel slide along a surface instead of
 * sticking to the first thing it touches.
 */
import { isBlocked } from "./geometry.js";

/** Keeps a clamped particle strictly inside its cell. */
const EDGE_EPSILON = 1e-3;
/** Pixels are allowed this multiple of the world height as ballistic headroom. */
export const SKY_HEADROOM = 2;

/**
 * @typedef {{ pos: [number, number], vel: [number, number] }} ParticleState
 * @typedef {{ gravity: number, dt: number, damping: number, restitution: number, dislodgeSpeed: number }} PhysicsParams
 * @typedef {{ width: number, height: number }} World
 */

/**
 * @param {ParticleState} particle
 * @param {ArrayLike<number>} field
 * @param {World} world
 * @param {PhysicsParams} params
 * @returns {{ pos: [number, number], vel: [number, number], hits: [number, number][] }}
 *   `hits` lists occupied cells struck hard enough to dislodge.
 */
export function integrate(particle, field, world, params) {
  const { width, height } = world;
  let [px, py] = particle.pos;
  let [vx, vy] = particle.vel;

  vy -= params.gravity * params.dt;
  vx *= params.damping;
  vy *= params.damping;

  const speed = Math.hypot(vx, vy);
  const hard = speed >= params.dislodgeSpeed;
  /** @type {[number, number][]} */
  const hits = [];

  const nextX = px + vx * params.dt;
  if (isBlocked(field, Math.floor(nextX), Math.floor(py), width, height)) {
    if (hard) hits.push([Math.floor(nextX), Math.floor(py)]);
    vx = -vx * params.restitution;
  } else {
    px = nextX;
  }

  const nextY = py + vy * params.dt;
  if (isBlocked(field, Math.floor(px), Math.floor(nextY), width, height)) {
    if (hard) hits.push([Math.floor(px), Math.floor(nextY)]);
    vy = -vy * params.restitution;
  } else {
    py = nextY;
  }

  px = Math.min(width - EDGE_EPSILON, Math.max(0, px));
  py = Math.min(height * SKY_HEADROOM, Math.max(0, py));
  return { pos: [px, py], vel: [vx, vy], hits };
}
