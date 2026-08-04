const DIRECTIONS = 4;

/**
 * Return whether two encoded junction movements may occupy a conflict tile
 * together. Movements encode incoming * 4 + outgoing.
 *
 * @param {number} left
 * @param {number} right
 * @returns {boolean}
 */
export function areMovementsCompatible(left, right) {
  if (left === right) {
    return true;
  }

  const leftIncoming = Math.floor(left / DIRECTIONS);
  const leftOutgoing = left % DIRECTIONS;
  const rightIncoming = Math.floor(right / DIRECTIONS);
  const rightOutgoing = right % DIRECTIONS;

  if (leftIncoming === rightIncoming || leftOutgoing === rightOutgoing) {
    return false;
  }

  const pathsAreOpposite =
    leftIncoming === (rightOutgoing + 2) % DIRECTIONS &&
    leftOutgoing === (rightIncoming + 2) % DIRECTIONS;
  if (pathsAreOpposite) {
    return true;
  }

  const leftTurn = (leftOutgoing - leftIncoming + DIRECTIONS) % DIRECTIONS;
  const rightTurn = (rightOutgoing - rightIncoming + DIRECTIONS) % DIRECTIONS;
  return leftTurn === 1 && rightTurn === 1;
}

/**
 * Calculate the speed allowed by a leader in the same lane.
 *
 * @param {{
 *   desiredSpeed: number,
 *   leaderDistance: number,
 *   vehicleLength?: number,
 *   minimumGap?: number,
 *   padding?: number,
 *   timeHeadway?: number,
 * }} options
 * @returns {number}
 */
export function followingTargetSpeed({
  desiredSpeed,
  leaderDistance,
  vehicleLength = 0.16,
  minimumGap = 0.06,
  padding = 0.02,
  timeHeadway = 0.18,
}) {
  const usableDistance = Math.max(
    0,
    leaderDistance - vehicleLength - minimumGap - padding,
  );
  return Math.min(desiredSpeed, usableDistance / timeHeadway);
}

/**
 * Follow a route through consecutive conflict tiles so reservations can be
 * acquired atomically before a vehicle enters the first tile.
 *
 * @param {{
 *   firstConflict: string,
 *   isConflict: (tile: string) => boolean,
 *   nextStep: (tile: string) => { movement: number, next: string } | undefined,
 *   maxTiles: number,
 * }} options
 * @returns {{
 *   complete: boolean,
 *   exit: string,
 *   movements: number[],
 *   tiles: string[],
 * }}
 */
export function planConflictCorridor({
  firstConflict,
  isConflict,
  nextStep,
  maxTiles,
}) {
  const movements = [];
  const tiles = [];
  let current = firstConflict;

  while (isConflict(current) && tiles.length < maxTiles) {
    const step = nextStep(current);
    if (step === undefined) {
      return { complete: false, exit: current, movements, tiles };
    }
    tiles.push(current);
    movements.push(step.movement);
    current = step.next;
  }

  return {
    complete: !isConflict(current),
    exit: current,
    movements,
    tiles,
  };
}

/**
 * Return the deterministic first hop on a shortest path in a small graph.
 * Neighbor order is the tie-breaker.
 *
 * @param {Map<string, string[]>} graph
 * @param {string} start
 * @param {string} target
 * @returns {string}
 */
export function shortestNextHop(graph, start, target) {
  if (start === target) {
    return target;
  }

  /** @type {string[]} */
  const queue = [start];
  const parents = new Map([[start, start]]);

  for (let index = 0; index < queue.length; index += 1) {
    const node = queue[index];
    for (const neighbor of graph.get(node) ?? []) {
      if (parents.has(neighbor)) {
        continue;
      }
      parents.set(neighbor, node);
      if (neighbor === target) {
        let hop = target;
        while (parents.get(hop) !== start) {
          hop = /** @type {string} */ (parents.get(hop));
        }
        return hop;
      }
      queue.push(neighbor);
    }
  }

  return start;
}
