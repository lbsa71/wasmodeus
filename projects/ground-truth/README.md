# Ground Truth

A WebGPU proof of concept in which a static image and a fixed pool of Newtonian
pixels keep trading places.

The world is one grid held in two layers. `field` is the image — settled,
static, and the thing pixels collide with. `overlay` is this frame's moving
pixels. A pixel is never in both. A fixed pool of particle slots is the entire
budget for motion: a pixel can only leave the image if a slot is free, and a
slot only frees when a pixel comes to rest and blends back in.

Everything runs on the GPU. There is no per-particle CPU work at all — the only
thing read back each frame is a 48-byte counter block, and even that is read
without blocking.

## The rules

**A pixel settles when it stops moving.** Rest is measured in whole cells, not
in velocity: a pixel that has not changed grid cell for `rest_threshold`
consecutive frames is written back into `field` and its slot returns to the
pool. The threshold is a slider, default 2. A pixel at the apex of a ballistic
arc is explicitly exempt — two frames in the sky would otherwise look identical
to two frames sitting still.

**A pixel is dislodged when it is hit.** A moving pixel that strikes a settled
cell above `dislodge_speed` marks that cell, and the next emit pass turns it
into a moving pixel carrying its own colour.

**A pixel is dislodged when what held it up is removed.** Any settled cell with
an empty cell beneath it becomes a moving pixel. This cascades one row per
frame, so digging a hole at the bottom pulls a column down behind it.

**Alpha does not count.** Occupancy is a bit, not a channel. A transparent
source pixel is simply absent from the image, not a black one.

**There is a hard cap on motion.** Every cell that wants to move must claim a
slot from the free-slot ring first. When the pool is full the request is
refused, the cell stays put, and the `denied` counter goes up. That counter is
the interesting one: `denied > 0` means the *pool* is the limit, while `free >
0` with `denied == 0` means the *image* is — it has run out of pixels to give.

## The fountain

The perturbation source does not invent matter. It takes settled pixels out of
the bottom rows of the world and relaunches them from a nozzle, which
undermines the rows above and keeps the whole image churning.

Its intake rate is servo-driven from the number of free slots, so the
simulation actively converges on keeping the pool full rather than drifting
down to a handful of live pixels. Left alone at the default settings it reaches
roughly 999,800 of 1,000,000 pixels in motion after about twenty seconds, at
which point emissions and settlements run in lockstep — one pixel out for every
one back in.

You can also perturb the image by hand: click or drag on it to knock every
settled pixel inside a radius loose.

## Why the world is bigger than the pool

The default world is 2048 × 1152 and its scene holds about 1.55 million pixels,
against a pool of one million. That is deliberate. A world with only a million
cells cannot have a million pixels in motion *and* still be an image — the two
numbers compete for the same pixels, and motion plateaus well short of the pool.
Giving the world half again as much material as the pool is what makes the
headline number actually reachable.

## Running it

```
npm run dev --workspace @wasmodeus/ground-truth      # build and serve on :4175
npm run check:full --workspace @wasmodeus/ground-truth
```

From the repository root: `npm run dev:ground-truth`, `npm run check:ground-truth`.

Requires a browser with WebGPU. Drop in your own picture with the **Image…**
button — it is scaled to fit, stood on the ground, and eroded by the same rules.

## Debug readout

| Row | Meaning |
| --- | --- |
| `moving` / `capacity` | slots handed out, and the hard cap |
| `pool used` | how close the cap is to biting |
| `emitted/f` | pixels that left the image this frame |
| `settled/f` | pixels that blended back in this frame |
| `struck/f` | settled cells knocked loose by an impact or a blast |
| `undermined/f` | settled cells that lost the pixel underneath them |
| `denied/f` | cells that wanted to move and found the pool full |

The **Pixels in motion** slider is exponential — one eighth of an octave per
notch, from 1 024 up to 2 097 152 — so the point where the frame rate falls
over can be found in one sweep. The pool is reallocated on release, not while
dragging.

## Layout

| Path | What lives there |
| --- | --- |
| `src/core/` | Pure logic: cell encoding, geometry, the integrator, the rest rule, the fountain servo, buffer layouts. No GPU, fully unit-tested. |
| `src/gpu/` | Device acquisition, pipelines, buffer ownership, non-blocking readback. |
| `src/gpu/shaders/` | `simulation.wgsl` (seven compute entry points) and `composite.wgsl`. |
| `src/ui/` | Debug-panel formatting and the frame-rate meter. |
| `test/` | `node --test` suites, including a contract test that fails if the shader and the JavaScript memory layouts drift apart. |

## Frame order, and why it is that order

```
prepare  →  integrate ×4  →  advance  →  settle  →  emit  →  splat  →  composite
```

`settle` only ever **pushes** to the free-slot ring and `emit` only ever
**pops** from it. Because they are separate dispatches, a slot can never be
handed to two pixels at once — no compare-and-swap on the ring is needed. `emit`
claims from a pop budget snapshotted by `prepare`, so its head index can never
overrun the tail.

`integrate` runs four substeps to keep a fast jet under about two cells per
step, which is what stops it tunnelling through thin walls. Rest bookkeeping is
split out into `advance` so that `rest_threshold` stays denominated in *frames*
however finely the integrator is stepped.

`emit` walks the grid, so it clears the overlay as it goes — one grid traversal
per frame rather than two.
