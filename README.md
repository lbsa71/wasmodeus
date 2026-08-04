# WASMODEUS Workspaces

WASMODEUS is now organized as a multi-project workspace.
`projects/traffic-simulator` contains the existing traffic project, and
`projects/space-colonization` is a scaffold for your secondary simulation.

Traffic version 1 remains a browser-based, WebGPU-first massive traffic
simulator with a WebAssembly simulation core. Version 1 models a logical 1,000 ×
1,000 terrain grid. Roughly 20% of its 1,000,000 tiles form clustered
non-buildable islands; the remaining terrain supports a sparse hierarchy of
endpoints, straights, corners, T-junctions, and four-way crossings. The
simulator gives 100,000 drivers persistent homes, workplaces, work schedules,
cars, and tile-aware wayfinding.

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
reset the view. The **Demand** slider selects 25,000–100,000 enabled drivers.
The slider controls enabled drivers rather than the momentary number of cars on
the road. Manual mode applies that population immediately. Enable **Dynamic
cars** to use it as a ceiling while the controller reduces or restores the
enabled population in response to sustained junction pressure.

**Dynamic roads** is enabled by default. The simulator records each junction's
highest simultaneous demand and a rolling pressure score. Every 30 simulated
minutes it may spend a small construction budget on one high-value bypass;
disable the toggle to freeze the generated topology.

The 24-hour clock begins at 07:30 and advances by one simulated minute per real
second at 1x speed. One tile represents 50 metres, so the 1,000 × 1,000 world
spans 50 × 50 kilometres. Drivers depart early enough for their estimated
free-flow journey plus a deterministic 0–45 minute arrival buffer. Blue plots
are homes; orange plots are workplaces. The telemetry panel lists the total
driver population and the mutually exclusive on-road, at-home, and at-work
counts.

## Verify it

```sh
npm test
npm run test:scale
npm run check
npm run check:full
npm run build
```

`npm run dev` and all `npm run test:*` commands execute against
`projects/traffic-simulator` by default. Use `npm run build:traffic` or
`npm run build:space-colonization` to target a specific workspace directly.

`npm test` runs the deterministic small-map JavaScript suite and is the fast
default for local TDD. `npm run test:scale` compiles the AssemblyScript core and
runs the real 1,000 x 1,000, 100,000-car acceptance suite. The scale suite is
intentionally explicit because recreating several million-cell worlds makes it
much slower than the focused policy tests.

`npm run check` runs ESLint, strict JavaScript type analysis, compiles the
AssemblyScript core, and runs the fast suite. `npm run check:full` adds the
full-scale acceptance suite and production web build for CI or release gates.

## Design

- `projects/traffic-simulator/assembly/index.ts` contains the deterministic
  WebAssembly simulation core.
  It stores terrain and N/E/S/W road connectivity in one byte per tile: the
  lower four bits contain road directions, a fifth bit distinguishes buildable
  land from blocked terrain, and a sixth marks four-lane arterial tiles. Every
  road connection is reciprocal, no road exits the world boundary, and every
  road belongs to one connected network.
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
- Four-lane eligibility is derived from maximal uninterrupted straight
  corridors. A corridor must span at least 20 tiles, and four transition tiles
  at both ends remain two-lane. This keeps widening away from bends and
  junctions and prevents lane counts from flickering along short road pieces.
- Car state is stored in compact, contiguous typed arrays inside WASM memory.
  The WebGPU renderer uploads those arrays directly to GPU storage buffers,
  without constructing 100,000 JavaScript objects every frame.
- Every driver has a persistent shared home plot, work plot, desired speed,
  schedule, and commute state. Schedule assignment is approximately 80% day
  shift (09:00-17:00), 10% evening shift (17:00-01:00), and 10% night shift
  (01:00-09:00). Work departures account for each driver's estimated journey
  and spread arrivals up to 45 minutes before the shift; return departures are
  spread across the first 45 minutes after work. Parked drivers are excluded
  from lane buckets, movement, junction reservations, and rendering; shared
  plots admit cars onto each outgoing lane only when the minimum headway is
  available.
- Trip demand is distributed across 256 recursive-area activity centers. Each
  home is paired with its nearest workplace by actual shortest road distance,
  not straight-line distance. Assignments are capped at 240 tiles (12 km);
  the slowest free-flow trip therefore takes at most 40 simulated minutes.
  Congestion may exceed that margin, making late arrivals a network-capacity
  result rather than a unit mismatch. A packed two-bit-per-center flow field
  gives every road tile an exact, constant-time next direction on the full road
  graph. A topology tree remains available as a deterministic fallback and for
  route-parity tests. Individual desired speeds range from 6 to 12 rendered
  tiles per second, equivalent to 18–36 km/h in simulated time. Cars keep to
  the outer right-hand slow lane, enter the inner lane only when blocked by a
  slower leader and the bounded front/rear clearance checks pass, then return
  right when safely clear. A passing car that cannot merge before an arterial
  ends waits at the merge line rather than entering a two-lane tile in the
  wrong lane.
- Collision avoidance is authoritative in WASM. Cars are inserted into sparse,
  directed-lane buckets keyed by `(tile, direction, lane)`, then inspect only
  their own and four upcoming segments for a leader. Lane changes also inspect
  bounded front and rear buckets and claim at most one change per directed
  segment per substep. Desired and actual speed are separate arrays; a
  time-headway controller accelerates or brakes each car, and the final
  movement clamp preserves the configured vehicle length and minimum gap
  without an all-pairs search. This changes proximity work from
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
- Dynamic-road mode ranks eligible T-junctions and crossings by accumulated
  pressure relief per newly constructed tile. A selected junction becomes a
  3 × 3 square loop:
  the old center closes, the four corners connect the existing approaches, and
  one conflict point becomes four distributed T-junctions. Existing road tiles
  are reused—so an upgrade needs at most five new tiles—while blocked terrain
  and home/work plots are never consumed. Upgrades
  wait until the center is clear, and the total construction budget is capped
  at 256 new tiles. Route fields, commute distances, arterial markings, and
  active-car directions are rebuilt after each topology revision.
- The million terrain/connectivity bytes are uploaded to a packed GPU storage
  buffer and refreshed only when the road revision changes. A WGSL full-screen
  shader decodes four tile masks per 32-bit word and
  rasterizes the correct straight, corner, T, or crossing shape. Arterials are
  widened in the shader and receive a second directional lane with dashed lane
  markings, while all roads retain their center divider.
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
projects/
  traffic-simulator/
    assembly/        WebAssembly simulation
    src/             Camera, WASM adapter, WebGPU data/shaders/renderer, and UI
    public/          HTML and CSS
    test/            Fast deterministic JavaScript tests
    test-scale/      Real 1,000 x 1,000 WASM acceptance tests
    test-support/    Shared integration-test helpers
  space-colonization/
    public/          Placeholder web entrypoint
    src/             Space colonization implementation (pending)
```
