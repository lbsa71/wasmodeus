import assert from "node:assert/strict";
import test from "node:test";

import { SimulationClient } from "../src/simulation-client.js";

test("the browser client exposes junction admission telemetry", () => {
  const client = new SimulationClient({
    memory: new WebAssembly.Memory({ initial: 1 }),
    getJunctionCandidateCount: () => 37,
    getJunctionGrantCount: () => 19,
    getDownstreamBlockedCount: () => 11,
  });

  assert.equal(client.junctionCandidates, 37);
  assert.equal(client.junctionGrants, 19);
  assert.equal(client.downstreamBlocked, 11);
});

test("the browser client updates its active population", () => {
  let activeCars = 100_000;
  const client = new SimulationClient({
    memory: new WebAssembly.Memory({ initial: 1 }),
    setActiveCarCount: (requested) => {
      activeCars = requested;
      return activeCars;
    },
  });
  client.carCapacity = 100_000;
  client.carCount = 100_000;

  assert.equal(client.setActiveCarCount(76_000), 76_000);
  assert.equal(client.carCount, 76_000);
  assert.equal(client.carCapacity, 100_000);
});
