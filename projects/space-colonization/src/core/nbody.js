/** @param {Array<{ mass: number, velocity: number[] }>} bodies */
export function totalLinearMomentum(bodies) {
  return bodies.reduce((momentum, body) => [momentum[0] + (body.mass * body.velocity[0]), momentum[1] + (body.mass * body.velocity[1]), momentum[2] + (body.mass * body.velocity[2])], [0, 0, 0]);
}

/** @param {Array<{ mass: number, position: number[], velocity: number[] }>} bodies @param {number} gravitationalConstant */
function accelerations(bodies, gravitationalConstant) {
  const result = bodies.map(() => [0, 0, 0]);
  for (let leftIndex = 0; leftIndex < bodies.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < bodies.length; rightIndex += 1) {
      const left = bodies[leftIndex];
      const right = bodies[rightIndex];
      const dx = right.position[0] - left.position[0];
      const dy = right.position[1] - left.position[1];
      const dz = right.position[2] - left.position[2];
      const inverseDistanceCubed = 1 / ((dx * dx + dy * dy + dz * dz) ** 1.5);
      const factor = gravitationalConstant * inverseDistanceCubed;
      result[leftIndex][0] += factor * right.mass * dx;
      result[leftIndex][1] += factor * right.mass * dy;
      result[leftIndex][2] += factor * right.mass * dz;
      result[rightIndex][0] -= factor * left.mass * dx;
      result[rightIndex][1] -= factor * left.mass * dy;
      result[rightIndex][2] -= factor * left.mass * dz;
    }
  }
  return result;
}

/** Mutates an isolated system using kick-drift-kick leapfrog integration. @param {Array<{ mass: number, position: number[], velocity: number[] }>} bodies @param {number} deltaTime @param {number} gravitationalConstant */
export function leapfrogStep(bodies, deltaTime, gravitationalConstant) {
  const initial = accelerations(bodies, gravitationalConstant);
  bodies.forEach((body, index) => {
    body.velocity = body.velocity.map((value, axis) => value + (initial[index][axis] * deltaTime / 2));
    body.position = body.position.map((value, axis) => value + (body.velocity[axis] * deltaTime));
  });
  const final = accelerations(bodies, gravitationalConstant);
  bodies.forEach((body, index) => { body.velocity = body.velocity.map((value, axis) => value + (final[index][axis] * deltaTime / 2)); });
}
