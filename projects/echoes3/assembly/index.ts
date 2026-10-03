// A growable preorder representation. Parents always precede their children;
// completed branches cannot be re-entered by a later append.
let parents = new Array<i32>();
let depths = new Array<i32>();
let malformed: bool = false;
let regrown: bool = false;

export function clear(): void {
  parents = new Array<i32>();
  depths = new Array<i32>();
  malformed = false;
  regrown = false;
}

export function appendNode(parent: i32): i32 {
  if (malformed) return 0;
  const count = parents.length;
  if (count == 0) {
    if (parent != -1) { malformed = true; return 0; }
    parents.push(-1);
    depths.push(0);
    return 1;
  }
  if (parent < 0 || parent >= count) { malformed = true; return 0; }
  let ancestor = count - 1;
  while (ancestor >= 0 && ancestor != parent) ancestor = parents[ancestor];
  if (ancestor != parent) { malformed = true; return 0; }
  parents.push(parent);
  depths.push(depths[parent] + 1);
  return 1;
}

export function canMove(index: i32): i32 {
  if (malformed || index <= 0 || index >= parents.length) return 0;
  return index + 1 == parents.length || parents[index + 1] != index ? 1 : 0;
}

// The cut and regrowth occur here, independently of the JavaScript rules.
// Copy only the surviving parent subtree and insert it beside that parent.
export function play(index: i32): i32 {
  if (canMove(index) == 0) return 0;
  const parent = parents[index];
  regrown = parent != 0;
  let end = parent + 1;
  while (end < parents.length && depths[end] > depths[parent]) end++;
  const output = new Array<i32>();
  const mapped = new Array<i32>(parents.length);
  const copied = new Array<i32>(parents.length);
  for (let at = 0; at < parents.length; at++) {
    if (at != index) {
      mapped[at] = output.length;
      output.push(at == 0 ? -1 : mapped[parents[at]]);
    }
    if (regrown && at == end - 1) {
      for (let copy = parent; copy < end; copy++) {
        if (copy == index) continue;
        copied[copy] = output.length;
        output.push(copy == parent ? mapped[parents[parent]] : copied[parents[copy]]);
      }
    }
  }
  parents = output;
  depths = new Array<i32>(parents.length);
  for (let at = 1; at < parents.length; at++) depths[at] = depths[parents[at]] + 1;
  return parents.length;
}

export function getParent(index: i32): i32 {
  if (malformed || index < 0 || index >= parents.length) return -2;
  return parents[index];
}

export function didRegrow(): i32 { return regrown ? 1 : 0; }
