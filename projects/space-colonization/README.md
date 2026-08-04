# Space Colonization Galaxy Engine

This workspace now contains a deterministic, browser-first Milky-Way-scale simulation foundation. It represents exactly 100 billion addressable stars through a streamed octree rather than allocating an impossible full catalogue in memory.

## Run

```sh
npm run build:space-colonization
npm run dev --workspace @wasmodeus/space-colonization
```

Open [http://localhost:4174](http://localhost:4174) in a current desktop browser with WebGPU enabled.

## Verify

```sh
npm run check --workspace @wasmodeus/space-colonization
npm run check:full --workspace @wasmodeus/space-colonization
```

The full check runs ESLint, strict JavaScript analysis, AssemblyScript compilation, deterministic unit tests, Wasm integration tests, and the WebGPU browser bundle.

## Current engine boundaries

- `assembly/` owns the stable Philox generator, exact root population, and Milky-Way-like potential exports.
- `src/core/` provides the tested virtual octree, stable `BodyRef` identities, split simulation time, Kepler propagation, isolated-system leapfrog, collision merging, and lazy planetary-system generation.
- A worker streams camera-relative 32-byte star records to WebGPU. The renderer uses additive HDR star billboards and adapter-safe storage-buffer chunks.
- Focused stars generate deterministic planets and moons with conservative mutual-Hill spacing. Planet-surface terrain, colonization, stellar evolution, full global self-gravity, general relativity, and hydrodynamics remain intentionally outside this first engine layer.
