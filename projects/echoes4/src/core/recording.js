/** @typedef {import('./types.js').World} World */
/** @typedef {import('./types.js').Fish} Fish */
/** @typedef {import('./types.js').Vector} Vector */

/** @param {World} world @param {Fish} fish */
export function registerFish(world, fish) {
  world.fish.push(fish);
  world.recording.tracks.push({ id: fish.id, kind: fish.kind, bornTick: fish.bornTick,
    initial: { x: fish.x, y: fish.y, heading: fish.heading, mass: fish.mass }, controls: [],
    frames: [{ tick: world.tick, x: fish.x, y: fish.y, heading: fish.heading, mass: fish.mass }], endTick: world.tick });
  world.events.push({ id: `${world.id}:event:${world.events.length}`, type: 'birth', tick: world.tick,
    actorId: fish.id, x: fish.x, y: fish.y, mass: fish.mass });
}

/** @param {World} world @param {Fish} fish @param {Vector | null} control */
export function recordFish(world, fish, control) {
  const track = world.recording.tracks.find(track => track.id === fish.id);
  if (!track) throw new Error('Fish has no recording.');
  const previous = track.controls.at(-1);
  if (control && (!previous || previous.x !== control.x || previous.y !== control.y)) track.controls.push({ tick: world.tick, ...control });
  if (fish.state !== 'eaten' || world.events.some(event => event.type === 'eat' && event.tick === world.tick && event.preyId === fish.id)) {
    const event = world.events.some(event => event.tick === world.tick && (event.actorId === fish.id || event.preyId === fish.id));
    if (event || (fish.state === 'active' && world.tick % 3 === 0)) {
      track.frames.push({ tick: world.tick, x: fish.x, y: fish.y, heading: fish.heading, mass: fish.mass });
    }
    track.endTick = world.tick;
  }
}

/** @param {World} world @param {Fish} fish @param {string} reason */
export function makePassive(world, fish, reason) {
  if (fish.state !== 'active') return;
  fish.state = 'passive';
  world.events.push({ id: `${world.id}:event:${world.events.length}`, type: 'passive', tick: world.tick,
    actorId: fish.id, x: fish.x, y: fish.y, mass: fish.mass, reason });
}
