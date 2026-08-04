import assert from "node:assert/strict";
import test from "node:test";

import {
  WebGpuUnavailableError,
  createRendererWithFallback,
} from "../src/renderer-factory.js";

test("the renderer factory prefers WebGPU", async () => {
  let fallbackCalls = 0;
  const primary = { backendName: "WebGPU" };

  const result = await createRendererWithFallback(
    async () => primary,
    () => {
      fallbackCalls += 1;
      return { backendName: "Canvas 2D fallback" };
    },
  );

  assert.equal(result.renderer, primary);
  assert.equal(result.warning, null);
  assert.equal(fallbackCalls, 0);
});

test("the renderer factory reports and recovers from missing WebGPU", async () => {
  const fallback = { backendName: "Canvas 2D fallback" };
  const result = await createRendererWithFallback(
    async () => {
      throw new WebGpuUnavailableError("No GPU adapter.");
    },
    () => fallback,
  );

  assert.equal(result.renderer, fallback);
  assert.equal(result.warning, "No GPU adapter.");
});

test("shader and programming errors are never hidden by the fallback", async () => {
  const shaderError = new Error("WGSL compile error");

  await assert.rejects(
    createRendererWithFallback(
      async () => {
        throw shaderError;
      },
      () => ({ backendName: "Canvas 2D fallback" }),
    ),
    shaderError,
  );
});
