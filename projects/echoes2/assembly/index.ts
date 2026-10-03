// At most 342 topples: each loses at least two units of potential
// sum(charge * x * (6-x)), x=1..5. Bound includes the placed charge.
const MAX_FRAMES: i32 = 344;
const owners = new StaticArray<i32>(25);
const charges = new StaticArray<i32>(25);
const frameOwners = new StaticArray<i32>(MAX_FRAMES * 25);
const frameCharges = new StaticArray<i32>(MAX_FRAMES * 25);
const frameBursts = new StaticArray<u32>(MAX_FRAMES);
let loaded: u32 = 0;
let malformed: bool = false;
let frameCount: i32 = 0;

export function clear(): void {
  loaded = 0;
  malformed = false;
  frameCount = 0;
}

export function putCell(index: i32, owner: i32, charge: i32): void {
  if (index < 0 || index >= 25 || owner < 0 || owner > 2 || charge < 0 || charge > 3 || ((owner == 0) != (charge == 0))) {
    malformed = true;
    return;
  }
  owners[index] = owner;
  charges[index] = charge;
  loaded |= <u32>1 << index;
}

export function canMove(index: i32, actor: i32): i32 {
  if (malformed || loaded != 0x1ffffff || index < 0 || index >= 25 || (actor != 1 && actor != 2)) return 0;
  if (owners[index] == actor) return 1;
  if (owners[index] != 0) return 0;
  const x = index % 5, y = index / 5;
  if (y > 0 && owners[index - 5] == actor) return 1;
  if (x > 0 && owners[index - 1] == actor) return 1;
  if (x < 4 && owners[index + 1] == actor) return 1;
  if (y < 4 && owners[index + 5] == actor) return 1;
  return 0;
}

function record(bursts: u32): void {
  for (let index = 0; index < 25; index++) {
    frameOwners[frameCount * 25 + index] = owners[index];
    frameCharges[frameCount * 25 + index] = charges[index];
  }
  frameBursts[frameCount] = bursts;
  frameCount++;
}

function receive(index: i32, actor: i32): void {
  charges[index]++;
  owners[index] = actor;
}

export function play(index: i32, actor: i32): i32 {
  if (canMove(index, actor) == 0) return 0;
  frameCount = 0;
  receive(index, actor);
  record(0);
  while (true) {
    let wave: u32 = 0;
    for (let at = 0; at < 25; at++) if (charges[at] >= 4) wave |= <u32>1 << at;
    if (wave == 0) return frameCount;
    if (frameCount >= MAX_FRAMES) { malformed = true; return 0; }
    for (let at = 0; at < 25; at++) if ((wave & (<u32>1 << at)) != 0) charges[at] -= 4;
    for (let at = 0; at < 25; at++) {
      if ((wave & (<u32>1 << at)) == 0) continue;
      const x = at % 5, y = at / 5;
      if (y > 0) receive(at - 5, actor);
      if (x > 0) receive(at - 1, actor);
      if (x < 4) receive(at + 1, actor);
      if (y < 4) receive(at + 5, actor);
    }
    for (let at = 0; at < 25; at++) if (charges[at] == 0) owners[at] = 0;
    record(wave);
  }
  return 0;
}

export function getOwner(frame: i32, index: i32): i32 {
  if (frame < 0 || frame >= frameCount || index < 0 || index >= 25) return -1;
  return frameOwners[frame * 25 + index];
}

export function getCharge(frame: i32, index: i32): i32 {
  if (frame < 0 || frame >= frameCount || index < 0 || index >= 25) return -1;
  return frameCharges[frame * 25 + index];
}

export function didBurst(frame: i32, index: i32): i32 {
  if (frame < 0 || frame >= frameCount || index < 0 || index >= 25) return 0;
  return (frameBursts[frame] & (<u32>1 << index)) != 0 ? 1 : 0;
}
