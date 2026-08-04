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

test("the browser client reserves a typed view for logical lanes", () => {
  const client = new SimulationClient({
    memory: new WebAssembly.Memory({ initial: 1 }),
  });

  assert.ok(client.lanes instanceof Uint8Array);
  assert.equal(client.lanes.length, 0);
  assert.ok(client.activeCars instanceof Uint8Array);
  assert.equal(client.activeCars.length, 0);
  assert.ok(client.junctionPeakDemand instanceof Uint16Array);
  assert.equal(client.junctionPeakDemand.length, 0);
});

test("the browser client controls and reports dynamic road construction", () => {
  let enabled = 1;
  const client = new SimulationClient({
    memory: new WebAssembly.Memory({ initial: 1 }),
    getDynamicRoadsEnabled: () => enabled,
    setDynamicRoadsEnabled: (next) => {
      enabled = next;
      return enabled;
    },
    getRoadRevision: () => 3,
    getRoadUpgradeCount: () => 2,
    getRoadConstructionTileCount: () => 7,
    getBusiestJunctionPeak: () => 11,
  });

  assert.equal(client.dynamicRoadsEnabled, true);
  assert.equal(client.setDynamicRoadsEnabled(false), false);
  assert.equal(client.dynamicRoadsEnabled, false);
  assert.equal(client.roadRevision, 3);
  assert.equal(client.roadUpgradeCount, 2);
  assert.equal(client.roadConstructionTileCount, 7);
  assert.equal(client.busiestJunctionPeak, 11);
});
