import { sweptContact } from './physics.js';
import { predatorFor } from './dominance.js';
/** @typedef {import('./types.js').World} World */
/** @typedef {import('./types.js').Fish} Fish */

/** @param {World} world @param {Map<string, import('./types.js').Vector>} before @param {import('./types.js').MathPort} math */
export function resolveCollisions(world, before, math) {
  const alive = world.fish.filter(fish => fish.state !== 'eaten');
  /** @type {{a:Fish,b:Fish,time:number}[]} */ const contacts = [];
  for (let i = 0; i < alive.length; i++) for (let j = i + 1; j < alive.length; j++) {
    const a = alive[i], b = alive[j];
    const radius = math.radius(a.mass, world.config.baseRadius, world.config.startMass) + math.radius(b.mass, world.config.baseRadius, world.config.startMass);
    const time = sweptContact(before.get(a.id) ?? a, a, before.get(b.id) ?? b, b, radius);
    if (time !== null) contacts.push({ a, b, time });
  }
  contacts.sort((a, b) => a.time - b.time || Math.max(b.a.mass, b.b.mass) - Math.max(a.a.mass, a.b.mass)
    || a.a.id.localeCompare(b.a.id) || a.b.id.localeCompare(b.b.id));
  for (const { a, b } of contacts) {
    if (a.state === 'eaten' || b.state === 'eaten') continue;
    const eater = predatorFor(a, b);
    if (!eater) continue;
    const prey = eater === a ? b : a;
    const eaterMass = eater.mass;
    eater.mass += prey.mass * world.config.growthEfficiency;
    prey.state = 'eaten';
    world.events.push({ id: `${world.id}:event:${world.events.length}`, type: 'eat', tick: world.tick,
      actorId: eater.id, preyId: prey.id, x: prey.x, y: prey.y, mass: eater.mass, eaterMass, preyMass: prey.mass });
    if (prey.kind === 'player') world.status = 'eaten';
    if (prey.kind === 'echo') world.nextEchoTick = world.tick + 1;
  }
}
