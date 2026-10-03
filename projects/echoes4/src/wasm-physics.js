/** @param {WebAssembly.Exports} exports */
export function wasmPhysics(exports) {
  /** @param {string} name @param {number[]} args */
  const call = (name, args) => {
    const fn = exports[name];
    if (typeof fn !== "function") throw new Error(`Missing physics function: ${name}`);
    return Number(fn(...args));
  };
  return {
    /** @param {number} mass @param {number} baseRadius @param {number} startMass */
    radius: (mass, baseRadius, startMass) => call("radius", [mass, baseRadius, startMass]),
    /** @param {number} mass @param {number} startMass @param {number} baseSpeed @param {number} exponent */
    speed: (mass, startMass, baseSpeed, exponent) => call("speed", [mass, startMass, baseSpeed, exponent]),
    /** @param {number} mass @param {number} prey @param {number} ratio */
    canEat: (mass, prey, ratio) => Boolean(call("canEat", [mass, prey, ratio])),
    /** @param {number} ax @param {number} ay @param {number} ar @param {number} bx @param {number} by @param {number} br */
    touches: (ax, ay, ar, bx, by, br) => Boolean(call("touches", [ax, ay, ar, bx, by, br])),
  };
}
