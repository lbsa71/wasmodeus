# Ground Truth

A WebGPU proof of concept: a procedural cave world of Newtonian sand pixels,
much larger than the screen, that you pan around and blow holes in.

The world is one grid held in two layers. `field` is the settled world — static,
and the thing pixels collide with. `overlay` is this frame's moving pixels. A
pixel is never in both. A fixed pool of particle slots is the entire budget for
motion: a pixel can only leave the world if a slot is free, and a slot only
frees when a pixel comes to rest and blends back in.

Everything runs on the GPU. There is no per-particle CPU work at all — the only
thing read back each frame is a 48-byte counter block, and even that is read
without blocking.

## Cohesion

Every cell carries a **bond**: how many of its eight neighbours it needs in
order to stay put. That one number spans the whole range of material behaviour.

| bond | behaves like |
| --- | --- |
| 0 | bedrock — needs nothing, and only an explosion moves it |
| 2 | stone — a cave roof rests on its neighbours to either side, so caverns and overhangs hold, but a one-pixel spar left hanging drops |
| 3 | rubble — settles on flat ground, runs off anything steep |
| 4 | packed dirt — holds a gentle slope, collapses when dug into |
| 5-6 | sand and gravel — needs to be nearly buried, so it flows off every edge |

This replaced a loose/static flag, and that flag was what made the ground look
wrong. A binary offers two bad choices: material that creeps forever, because a
rasterised slope has a one-pixel step every few columns and any step releases
it; or material that hangs unsupported in mid-air because nothing can move it.
Soil was the first and trees were the second.

A bond gives you the thing in between — material glued together until something
takes its neighbours away. **Generation then lowers every cell's bond to the
support it actually has**, so the world starts perfectly still however steep the
slope it was carved into. Blow a hole in a bank and the cells around the crater
are suddenly one neighbour short of the bond they were pinned at, so they let
go — and the deficit walks outward through the pile, a ring per frame, as a
collapse. Undisturbed, the world sits at exactly zero pixels in motion.

Debris always settles at bond 3, whatever it was before, so blasted stone
behaves like gravel from then on instead of re-freezing into cliff face. Three
is deliberate, and it is the largest value that works: a lone grain on flat
ground has exactly three neighbours — below-left, below and below-right — so ask
for four and a stray pixel can never settle anywhere, and slides for ever.

## The sand rule

Cohesion decides **whether** a pixel moves. The three cells beneath it decide
**which way**.

- **Nothing directly below** → it drops.
- **Solid below, but an open diagonal** → it slumps sideways into the gap, with
  probability `flow`. This is what turns a heap into a slope rather than a stack
  of columns.
- **All three solid** → it stays where it is.

The same three-cell test applies to pixels already in flight: one that lands on
the shoulder of a heap gets a sideways nudge and rolls off instead of stacking
into a needle. That one is collision response, not a probability — it always
applies.

The **Flow** slider is how fluid released material looks, not whether it
releases at all. That is the bond's job.

## Lemmings

Small creatures walk the world, tunnel through it, and occasionally sit down and
light a bomb.

They are not part of the field — sand does not rest on one — but they read it
for every decision, so a tunnel one digs is a real tunnel and a floor blown out
from under one really drops it. The walking rule is three lines and enough to
follow the contour of a cave: nothing underfoot and it falls, whatever else it
was doing; clear ahead and it walks on; one cell in the way and it steps up;
anything taller and it turns round.

**They come apart.** A lemming is drawn as a little block of pixels, and when
something tears through it fast enough that block is released into the particle
pool — the creature decoheres into its own pixels and they fall, pile and settle
like anything else. It is the same bargain the rest of the simulation makes:
hold together until something takes you apart.

Digging and detonating both **pop free slots from the same pool budget the world
uses**, which is why `step_agents` runs before `emit` rather than after. A
lemming that cannot find a slot simply waits a frame.

### Two markers in the overlay

A lemming needs to know whether something is hitting it, and both the moving
pixels and its own sprite live in the overlay. Without telling them apart it
reads the body it drew last frame and shatters itself on the spot.

So `splat` sets `OVERLAY_FAST` on cells a pixel is tearing through — the overlay
has no room for a velocity, and this is the one bit of it that matters — and
`draw_agents` sets `OVERLAY_AGENT` on its own sprite. Both sit above the colour
bits, so `atomicMax` keeps a fast pixel visible over a lemming and a lemming
over ordinary material, and the composite masks them off.

Lost lemmings are replaced after a delay. Without that the population only ever
falls — a bomb kills the bomber and the debris takes its neighbours — and the
world goes quiet inside half a minute. Measured over 1 700 frames it holds
steady: 600 spawned, 534 alive after 500 frames, 540 after 1 700, with around a
hundred digging at any moment and forty-five cells excavated a frame.

## The brush

A **smudge** is the better tool, and not merely because it is gentler.

A blast fires everything radially, which inside a pocket means into the crater
wall a few dozen cells away — where most of the rock is far too well bonded to
break. The debris reflects, comes straight back inward, and mills about in a
closed space until the collapse buries it. That bounce-back is visible, and it
is where most of the entombed pixels come from.

A drag sends material somewhere it can actually go. Measured on the same world,
900 frames after the gesture:

| | pixels left entombed |
| --- | --- |
| smudge | **0** |
| blast | 1 534 |

The smudge also has to know its limits. Releasing everything under the brush is
the obvious implementation and it is much worse than the blast — it liquefies
solid rock for as long as the pointer is held down, far faster than any of it
can settle, and leaves twenty thousand pixels entombed. So the brush only takes
what it can reach: a cell with little support to spare, meaning a surface, or
something bonded loosely enough to drag out of a heap.

That threshold is what gives the tool its feel. Sand comes away readily, because
a buried grain has barely more support than its bond asks for. Stone gives up
only its surface and erodes as the drag exposes more of it. Bedrock does not
move at all — only a blast shifts that.

## Nothing is ever skipped over

A pixel's step is **swept**, a cell at a time, and it stops at the first solid
cell in its path.

Testing only the cell a pixel would land in is the obvious thing and it is
wrong: at blast speed a pixel covers about six cells in a substep, so it jumps
clean over whatever lies between. Pixels pass through pixels, land underneath
floors, and material appears tucked under a pile instead of on top of it.

The step is therefore divided into at most eight moves of at most one cell each,
the distance capped so that even at the limit no single move can span more than
a cell. A contact ends the sweep, because the velocity has just changed and the
remainder of the stride points the wrong way; the next substep continues with
the new one.

Measured over a frame of a large collapse: **no pixel crosses a solid cell**,
and new cells appear with open sky above them 122 times for every 1 that appears
tucked underneath existing material.

## The other rules

**A pixel settles when it stops moving, on something.** Rest is measured in
whole cells, not in velocity: a pixel that has not changed grid cell for `rest`
consecutive frames is written back into `field` and its slot returns to the pool.

Both halves of that are needed. A pixel above the world is exempt, or a
ballistic apex would look identical to sitting still — and `settle` takes one
last look at the cell underneath before committing, because at the apex of an
arc *inside* the world a pixel barely moves from one frame to the next. Without
that check it settles in mid-air, and a brushful of pixels reaching apex
together forms a clump whose interior satisfies its own bond, which then hangs
there permanently. Smudging straight upward produced exactly that.

**Impacts hand over momentum.** A pixel that strikes a cell hard enough gives it
part of its momentum as a vector, and the cell launches with exactly that when
it is released — so a blow splashes in the direction it came from instead of
dropping limply. The striker keeps the rest. See the section below.

**The brush comes in two kinds.** A *smudge* drags material the way the pointer
goes; a *blast* fires it radially and is the only rule that ignores a cell's
bond entirely, so it is the only thing that shifts bedrock. Either way what it
throws lands as rubble, which is why a crater stays a crater. See below.

**There is a hard cap on motion.** Every cell that wants to move must claim a
slot from the free-slot ring first. When the pool is full the request is
refused, the cell stays put, and the `denied` counter goes up. That counter is
the interesting one: `denied > 0` means the *pool* is the limit, while `free >
0` with `denied == 0` means the world simply has nothing more it wants to move.

## Momentum

An impact is a collision between two equal masses, and one coefficient of
restitution `e` — the **Elasticity** slider — covers the whole of it:

| | striker keeps | target takes |
| --- | --- | --- |
| knocks the cell loose | `v · (1−e)/2` | `v · (1+e)/2` |
| hits something immovable | `−v · e` | — |

The two shares always sum to `v`, so momentum is handed over rather than
destroyed. Energy is not conserved unless `e` is 1, and that difference is the
elasticity: at 1 the collision is perfectly elastic — Newton's cradle, the
striker stops dead and the target leaves at full speed — and nothing ever
removes energy, so a disturbed pile trades it back and forth indefinitely.
Below 1 every impact bleeds some and the world comes to rest. The default is
0.18 — sand barely bounces — which keeps 51% of the energy in each collision.

The distinction between the two rows matters. Reversing the striker *and*
launching the target would invent momentum out of nothing — a rebound at −25
plus a departure at +100 is more than the +100 that arrived. Reversal is only
right against something that will not move at all, where the wall absorbs the
difference.

The momentum has to survive from the frame of the impact to the frame the cell
is released, so it lives in a per-cell buffer, two `f16` to a word, 85 MB across
the grid. WGSL has no atomic float add, so accumulating several strikes on one
cell is the usual compare-exchange loop.

### One striker to a cell

Exactly one pixel a frame may knock a given cell loose, claimed with an atomic
test-and-set on its dislodge bit. Everything else that reaches it in the same
frame bounces off instead.

Letting them accumulate was the first attempt and it does not work. A cell is
one grain, and in a collapse dozens of pixels strike the same still-solid cell
in a single frame; summing their shares launches that one grain at a speed no
individual pixel ever had. Past 65504 the packed `f16` becomes an infinity, the
position becomes a NaN, and `i32(floor(NaN))` indexes the grid somewhere
arbitrary. That is what produced explosions out of nowhere.

The same mistake hid a second one: the speed threshold lived inside the
"not yet marked" branch, so every striker after the first skipped it entirely
and transferred at any speed at all. The threshold now gates every striker,
before the claim.

### Why an impact meets resistance

A cell resists in proportion to the support it has **beyond** what its bond asks
for: the threshold is `dislodge_speed × (1 + surplus × 0.6)`. Without that term
every pixel that lands hard enough knocks the floor out from under itself, each
release drives the next one down, and one impact liquefies the whole pile in a
chain reaction that never settles — which is exactly what happened the first
time this was built without it.

With it, a marginally-held pixel goes after a twelve-cell fall, a pile surface
needs about sixty, and buried material needs two hundred, which in practice
means only a blast. Ordinary settling arrives at 50–100 and never erodes
anything. After a large explosion the impact chain attenuates within about eight
hundred frames while the slower bond-driven collapse carries on behind it.

## The world

6144 × 3456 cells — about twenty-one million, some six times the area of a
1080p screen at 1:1. A rolling surface with soil, sand lenses, grass and trees;
a tunnel-and-cavern system carved out of the rock beneath it; moss, glowcaps,
mushrooms and hanging vines lining the caves; ore and crystal veins; and pockets
of loose spoil buried in the stone that run like sand the moment you breach one.

It is a pure function of its seed, and every feature size is a fraction of the
world rather than a pixel count — a fixed size looks like a cave system at one
scale and like gravel at another.

Caves are only cut into stone, never into the soil above them. A final pass
then settles every bond down to the support that cell actually has, so whatever
the noise carved, the world opens perfectly still and stays that way until
something takes a cell's neighbours away.

Carving takes a couple of seconds, so it happens in a worker and the finished
field comes back as a transfer rather than a copy.

## Controls

| Gesture | Effect |
| --- | --- |
| Drag | Pan |
| Wheel | Zoom about the pointer, from whole-world out to 8× in |
| Shift-drag or right-drag | Smudge: drag material the way the pointer goes |
| Alt-drag | Detonate |

A world this size needs the plain drag for navigation, so the tools are the
modified gestures.

**Pixels in motion** is exponential — one eighth of an octave per notch — and
defaults to ten million. The top of the slider is not a constant: it is whatever
this device's largest storage buffer can hold, which on a 2 GB binding is
**107 million**. The pool is reallocated on release, not while dragging.

Two things bound it, and both are worth knowing before reading the frame rate:

- A pixel is twenty bytes, in an array capped at one storage binding, and that
  is what sets the 107 million ceiling. Per-pixel state lives in a separate
  four-byte array so an idle slot costs four bytes to skip rather than twenty,
  which is what makes a mostly-empty pool of that size affordable at all.
- **The world holds about 13.4 million cells of matter**, and a pixel in motion
  has to have come from one of them. Above that the pool cannot fill, and the
  slider is measuring the cost of iterating empty slots rather than more
  simulation. `denied` says which limit you are against: non-zero means the pool
  is the constraint, zero with free slots left means the world is.

The `emit` pass also walks the whole grid every frame regardless of pool size,
so there is a fixed floor under the frame cost that the slider cannot reach.

## Running it

```
npm run dev --workspace @wasmodeus/ground-truth      # build and serve on :4175
npm run check:full --workspace @wasmodeus/ground-truth
```

From the repository root: `npm run dev:ground-truth`, `npm run check:ground-truth`.

Requires a browser with WebGPU.

## Debug readout

| Row | Meaning |
| --- | --- |
| `moving` / `capacity` | slots handed out, and the hard cap |
| `pool used` | how close the cap is to biting |
| `emitted/f` | pixels that left the world this frame |
| `settled/f` | pixels that blended back in this frame |
| `struck/f` | cells that took momentum from an impact, or a blast |
| `fell/slumped` | cells whose neighbours were no longer enough to hold them |
| `denied/f` | cells that wanted to move and found the pool full |
| `crowded/f` | two pixels wanting one cell; normal during a collapse |
| `stuck/f` | pixels with no free cell within reach, widening their search |
| `lemmings` | how many are alive and walking |
| `dug/f` | cells excavated by lemmings this frame |
| `view` / `zoom` | where the camera is and how far in |

## Layout

| Path | What lives there |
| --- | --- |
| `src/core/` | Pure logic: cell encoding, cohesion and the sand rule, geometry, the integrator, the camera, noise, world generation, buffer layouts. No GPU, fully unit-tested. |
| `src/gpu/` | Device acquisition, pipelines, buffer ownership, non-blocking readback. |
| `src/gpu/shaders/` | `simulation.wgsl` (seven compute entry points) and `composite.wgsl`. |
| `src/worker/` | World generation, off the main thread. |
| `src/ui/` | Debug-panel formatting and the frame-rate meter. |
| `test/` | `node --test` suites, including a contract test that fails if the shader and the JavaScript memory layouts drift apart. |

## Frame order, and why it is that order

```
prepare  →  integrate ×4  →  advance  →  settle  →  step_agents
         →  emit  →  splat  →  draw_agents  →  composite
```

`settle` only ever **pushes** to the free-slot ring; `emit` and `step_agents`
only ever **pop** from it. Because they are separate dispatches, a slot can never be
handed to two pixels at once — no compare-and-swap on the ring is needed. `emit`
claims from a pop budget snapshotted by `prepare`, so its head index can never
overrun the tail.

`integrate` runs four substeps to keep a fast pixel under about two cells per
step, which is what stops blast debris tunnelling through a cave wall. Rest
bookkeeping is split out into `advance` so that `rest` stays denominated in
*frames* however finely the integrator is stepped.

`emit` walks the grid, so it clears the overlay as it goes — one grid traversal
per frame rather than two.

### Buried pixels

Nothing stops two pixels sharing a cell — positions are floats — so when one
wins the deposit the other is left standing inside solid material. In a
collapsing pile that happens tens of thousands of times a frame, and a pixel it
happens to cannot move (collision refuses it every direction at once) and cannot
deposit (its cell is taken), so its slot never returns to the ring.

The obvious cure is the wrong one. Giving the loser an upward kick and switching
its collision off so it could climb out is what put pixels on screen **rising
through solid rock** — and then sinking back down through it once gravity turned
them round. What actually works is four things:

- **The cell a pixel is standing in never blocks it.** A pixel that gets built
  over must still be able to leave; without this exemption the destination of a
  short step is its own, now-solid, cell and it is welded in place by its own
  position. Collision is otherwise never disabled.
- **The loser is handed a nearby cell.** `settle` rings outward from the cell it
  wanted, nearest first and downhill before uphill, so the result is a one- or
  two-cell jostle rather than a jump.
- **Blast debris keeps a floor of speed at the rim.** A linear falloff reaches
  zero at the edge of the blast, so the outermost ring of debris never moved and
  the crater collapsed back on top of it — which is where the buried pixels were
  coming from in the first place.
- **A pixel with nowhere at all to go searches radially, and waits.** The near
  rings are checked every frame; beyond them one further ring is probed per
  frame and the ring advances, so a pixel with nothing close sweeps outward to
  thirty-two cells over about half a second rather than paying for the whole
  disc every frame.

  It must not travel, and two earlier cures did. Swapping with the cell above
  conserves matter but marches material upward through solid rock a cell a
  frame — plainly visible. Carrying the pixel itself up to the surface is
  invisible on the way but relocates its matter enormously: a pixel built over
  just inside a crater wall has open space two cells sideways and *two hundred
  and fifty* cells of solid rock above it, and it surfaces that far from where
  it belonged. That is why the ground appeared to grow from underneath and to
  gain material it had not had.

Matter is conserved exactly, frame by frame, throughout: field cells plus live
pixels stays constant to the unit through an entire collapse. That invariant is
worth keeping — it is the check that caught this, and the one that proves the
splat and the unsplat really are one for one.

A residue remains. After a large blast the crater refills, and around two
thousand pixels end up genuinely entombed with no free cell within reach of the
search. They hold their slots until a reset, and they are invisible, but they
are why `moving` does not always come back to zero. `stuck` in the debug panel
counts them. Removing the residue entirely means stopping two pixels sharing a
cell in the first place, which is a spatial-exclusion pass over the pool rather
than a repair in `settle`.

### Dispatch folding

Twenty-one million cells need 82 944 workgroups, and a dispatch dimension caps
out at 65 535. Over the cap the dispatch is rejected, the whole command buffer
with it, and the frame silently renders nothing — a black screen with no error
anywhere. `dispatchGrid` folds the excess into y and the shaders undo the fold
with `num_workgroups`. The engine also reports uncaptured GPU errors to the
status line, because a swallowed validation failure looks exactly like a bug in
the physics.
