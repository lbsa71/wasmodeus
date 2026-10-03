// Eight shared stones; authoritative browser legality in WebAssembly.
const xs = new StaticArray<i32>(8);
const ys = new StaticArray<i32>(8);
let resting: i32 = -1;
let count: i32 = 0;

export function clear(): void { count = 0; resting = -1; }
export function putStone(index: i32, x: i32, y: i32): void {
  if (index < 0 || index >= 8) return;
  xs[index] = x; ys[index] = y;
  count = max(count, index + 1);
}
export function setResting(index: i32): void { resting = index; }
export function canMove(index: i32, x: i32, y: i32): i32 {
  if (count != 8 || index < 0 || index >= count || index == resting) return 0;
  if (max(abs(x - xs[index]), abs(y - ys[index])) != 1) return 0;
  for (let i = 0; i < count; i++) if (xs[i] == x && ys[i] == y) return 0;
  const oldX = xs[index], oldY = ys[index];
  xs[index] = x; ys[index] = y;
  let visited: u32 = 1;
  for (let round = 0; round < 8; round++) {
    for (let i = 0; i < count; i++) {
      if ((visited & (1 << i)) == 0) continue;
      for (let j = 0; j < count; j++) {
        if (abs(xs[i] - xs[j]) + abs(ys[i] - ys[j]) == 1) visited |= 1 << j;
      }
    }
  }
  xs[index] = oldX; ys[index] = oldY;
  return visited == 255 ? 1 : 0;
}
