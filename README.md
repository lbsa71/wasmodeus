# WASMODEUS

WASMODEUS is a browser-based, WebGPU-first massive traffic simulator with a
WebAssembly simulation core. Version 1 models a logical 1,000 × 1,000 terrain
grid. Roughly 20% of its 1,000,000 tiles form clustered non-buildable islands;
the remaining terrain supports a sparse hierarchy of endpoints, straights,
corners, T-junctions, and four-way crossings. The simulator gives 100,000 cars
individual positions, speeds, destinations, and tile-aware wayfinding. Every
road is bidirectional with one lane in each direction.

![rendering](https://img.shields.io/badge/rendering-WebGPU-005a9c)
![simulation](https://img.shields.io/badge/simulation-WebAssembly-654ff0)
![tests](https://img.shields.io/badge/tests-Node.js-5fa04e)

## Run it

Requirements: Node.js 24+, Python 3, and a browser with WebGPU enabled.

WebGPU is always attempted first. If the browser exposes no compatible GPU
adapter, the UI reports that limitation and uses a Canvas 2D compatibility
renderer; the telemetry panel always names the active backend. The WASM
simulation remains identical in either mode.

```sh
npm install
npm run dev
```

Open [http://localhost:4173](http://localhost:4173). Drag to pan, scroll to
zoom, press <kbd>Space</kbd> to pause or resume, and press <kbd>0</kbd> to
reset the view. The **Demand** slider selects 25,000–100,000 requested cars.
Manual mode applies that number immediately. Enable **Dynamic cars** to use it
as a ceiling while the controller reduces or restores the active population in
response to sustained junction pressure.

## Verify it

```sh
npm test
npm run test:scale
npm run check
npm run check:full
npm run build
```

`npm test` runs the deterministic small-map JavaScript suite and is the fast
default for local TDD. `npm run test:scale` compiles the AssemblyScript core and
runs the real 1,000 x 1,000, 100,000-car acceptance suite. The scale suite is
intentionally explicit because recreating several million-cell worlds makes it
much slower than the focused policy tests.

`npm run check` runs ESLint, strict JavaScript type analysis, compiles the
AssemblyScript core, and runs the fast suite. `npm run check:full` adds the
full-scale acceptance suite and production web build for CI or release gates.

## Design

- `assembly/index.ts` contains the deterministic WebAssembly simulation core.
  It stores terrain and N/E/S/W road connectivity in one byte per tile: the
  lower four bits contain road directions and a fifth bit distinguishes
  buildable land from blocked terrain. Every road connection is reciprocal,
  no road exits the world boundary, and every road belongs to one connected
  network.
- Terrain suitability comes from deterministic fractal value noise at
  continental, regional, and local scales. Selecting the lowest 20th percentile
  gives a stable land budget without relying on a seed-sensitive fixed
  threshold, while several morphology passes remove isolated pixels and narrow
  unusable tendrils.
- Road demand is generated recursively rather than assigning a road to every
  usable tile. The world is divided into nested areas; each area receives a
  noise-jittered hub, child hubs connect to their parent, and selected sibling
  links add economically useful redundancy. Routes retain a direction for
  several tiles before turning, producing long branches and recognizable
  arterials rather than a dense grid. Roads occupy less than one quarter of the
  world while retaining enough unique road tiles for all 100,000 cars.
- Car state is stored in compact, contiguous typed arrays inside WASM memory.
  The WebGPU renderer uploads those arrays directly to GPU storage buffers,
  without constructing 100,000 JavaScript objects every frame.
- Trip demand is distributed across 256 recursive-area activity centers, with
  most trips staying regional and a small share crossing the map. A packed
  two-bit-per-center flow field gives every road tile an exact, constant-time
  next direction on the full road graph. A topology tree remains available as
  a deterministic fallback and for route-parity tests. Individual desired
  speeds range from 2 to 8 tiles per second; each direction selects the
  right-hand lane, so opposite flows occupy opposite sides of the road.
- Collision avoidance is authoritative in WASM. Cars are inserted into sparse,
  directed-lane buckets keyed by `(tile, direction)`, then inspect only their
  own and four upcoming segments for a leader. Desired and actual speed are
  separate arrays; a time-headway controller accelerates or brakes each car,
  and the final movement clamp preserves the configured vehicle length and
  minimum gap without an all-pairs search. This changes proximity work from
  all-pairs `O(cars²)` comparisons to bounded bucket scans.
- Only true T-junctions and crossings require conflict control; bends and dead
  ends remain ordinary two-lane segments. Each approach requests a specific
  incoming-to-outgoing movement. Compatible opposing or right-turn movements
  can proceed together, while wait age provides deterministic fairness.
  Grants persist until entry, avoiding one-tick stop/go thrashing.
- Junction admission applies a "do not block the box" rule: a car may reserve
  the central conflict zone only when its receiving lane has enough measured
  space to clear it. Occupants retain their movement reservation through the
  conflict zone. Adjacent T-junctions and crossings are planned as one atomic
  corridor, preventing a car from holding the first junction while waiting to
  acquire the next. Tiles behind the car are released progressively, identical
  movements may platoon under the lane-headway rule, and rotating wait-age
  priority supplies deterministic right-of-way without starving either
  junction. The UI reports grants, candidates, and downstream holds. Initial
  placement also uses unique tiles, so the simulation never begins with stacked
  cars.
- Dynamic population mode is a hysteretic feedback controller over junction
  candidates, grants, conflict waits, and downstream holds. Three sustained
  high-pressure windows retire 2,000 cars; eight low-pressure windows restore
  500 toward the user-selected demand ceiling, preventing rapid oscillation.
  WASM retains capacity for 100,000 cars, simulates and renders only the active
  prefix, and safely respawns returning cars onto currently empty road tiles.
  Disabling the mode applies the selected demand directly.
- The million terrain/connectivity bytes are uploaded once to a packed GPU storage
  buffer. A WGSL full-screen shader decodes four tile masks per 32-bit word and
  rasterizes the correct straight, corner, T, or crossing shape with two lanes
  separated by a center divider.
- A second WebGPU pipeline draws the complete car population as instanced
  quads. Camera transforms, culling, and rasterization happen on the GPU.
- At close zoom, tile boundaries and individual road topology become visible.
  At overview zoom, the shader widens sub-pixel roads while continuing to draw
  all 100,000 cars.

### WebGPU compute path

The traffic rules live in WASM first so they can be tested deterministically,
but their layout is deliberately compute-friendly: structure-of-arrays vehicle
state, integer segment keys, flat bucket heads/links, compact flow fields,
bounded lookahead, bitmasked junction movements, and sparse reset lists. The
layered noise and topology passes are likewise bounded grid passes. A WebGPU
compute implementation can mirror these buffers, build buckets with atomic
insertion, run leader-following/admission/reservation passes, and feed the
existing render pipeline without a CPU readback. The WASM implementation
remains the reference model for parity tests during that migration.

## Project layout

```text
assembly/        WebAssembly simulation
src/             Camera, WASM adapter, WebGPU data/shaders/renderer, and UI
public/          HTML and CSS
test/            Fast deterministic JavaScript tests
test-scale/      Real 1,000 x 1,000 WASM acceptance tests
test-support/    Shared integration-test helpers
```
