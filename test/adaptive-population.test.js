import assert from "node:assert/strict";
import test from "node:test";

import { AdaptivePopulationController } from "../src/adaptive-population.js";

function sample(controller, count, telemetry) {
  let result;
  for (let index = 0; index < count; index += 1) {
    result = controller.observe(telemetry);
  }
  return result;
}

test("sustained junction pressure removes cars in bounded batches", () => {
  const controller = new AdaptivePopulationController({
    capacity: 100_000,
    evaluationSteps: 1,
  });
  const congested = {
    activeCars: 100_000,
    candidates: 10_000,
    downstreamBlocked: 6_300,
    grants: 800,
  };

  assert.equal(sample(controller, 2, congested).targetCarCount, 100_000);
  assert.equal(controller.observe(congested).targetCarCount, 98_000);
});

test("recovery is slower and cannot oscillate inside the hysteresis band", () => {
  const controller = new AdaptivePopulationController({
    capacity: 100_000,
    evaluationSteps: 1,
  });
  const neutral = {
    activeCars: 80_000,
    candidates: 5_000,
    downstreamBlocked: 1_800,
    grants: 1_200,
  };
  assert.equal(sample(controller, 20, neutral).targetCarCount, 80_000);

  controller.reset();
  const recovered = {
    activeCars: 80_000,
    candidates: 3_000,
    downstreamBlocked: 500,
    grants: 1_500,
  };
  assert.equal(sample(controller, 7, recovered).targetCarCount, 80_000);
  assert.equal(controller.observe(recovered).targetCarCount, 80_500);
});

test("pressure reflects queue load relative to the active population", () => {
  const telemetry = {
    candidates: 4_000,
    downstreamBlocked: 2_000,
    grants: 800,
  };
  const roomy = new AdaptivePopulationController({
    capacity: 100_000,
    evaluationSteps: 1,
  }).observe({ ...telemetry, activeCars: 100_000 });
  const overloaded = new AdaptivePopulationController({
    capacity: 100_000,
    evaluationSteps: 1,
  }).observe({ ...telemetry, activeCars: 40_000 });

  assert.ok(overloaded.pressure > roomy.pressure);
});

test("user demand is an immediate ceiling and recovery target", () => {
  const controller = new AdaptivePopulationController({
    capacity: 100_000,
    evaluationSteps: 1,
  });
  const quiet = {
    candidates: 3_000,
    downstreamBlocked: 500,
    grants: 1_500,
  };

  assert.equal(
    controller.observe({
      ...quiet,
      activeCars: 80_000,
      demandCars: 65_000,
    }).targetCarCount,
    65_000,
  );

  controller.reset();
  const recovered = sample(controller, 8, {
    ...quiet,
    activeCars: 64_800,
    demandCars: 65_000,
  });
  assert.equal(recovered.targetCarCount, 65_000);
});
