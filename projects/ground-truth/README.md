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

## Two properties, and the two materials that have only one

Every cell in the world answers two questions, and for almost everything the
answers are the same: **does it stop a moving pixel**, and **does it hold its
neighbours up**. Rock does both. Empty sky does neither. Two materials do
exactly one, and between them they account for most of what happens
underground:

| | blocks a pixel | bears load |
| --- | --- | --- |
| rock, soil, sand, gold | yes | yes |
| **water** | yes | **no** — so things sink through it |
| **the placeholder** | **no** — so things fall through it | yes — so tunnels keep their roofs |
| sky | no | no |

`blocked_at` and `open_at` answer the first question; `solid_at` answers the
second. Keeping them separate is what lets water and the placeholder exist at
all.

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

## Water

Water is a bond of **15**, and that is nearly the whole of it.

Fifteen is a number eight neighbours can never reach, so every "is this cell
held?" test already in the simulation answers *no* for water, everywhere,
always — generation, cohesion, the collapse, the brush. Nothing had to learn
about liquid. Water is simply material that nothing can hold, and it is released
every frame it has anywhere to go.

What is genuinely new is one rule about **which way** it goes:

- **Anything open below** → down, then a down-diagonal, exactly like sand.
- **Boxed in below, with water above** → *sideways along the flat*. This is the
  whole difference between water and sand, and it is what lets a pool find its
  level instead of standing up in a heap.
- **Nowhere at all** → it stays put. Without that last line a still pool churns
  for ever, because every cell in it would keep claiming a slot to go nowhere.

"With water above" is the pressure condition, and it was learned the hard way.
Without it the surface of every pool is a partial row of cells each with an
open side, and they slide back and forth for ever — ninety-odd pixels
permanently in flight over a tank that should have been at rest. With it a film
one cell deep is already level, and a pool levels itself from below: buried
cells are squeezed out sideways and the cells above them drop. A sealed tank of
6 300 cells of water comes to complete rest — zero pixels in motion — within a
hundred frames.

Three consequences had to be handled explicitly:

- Generation's settle-every-bond-to-its-support pass **skips water**, or the
  seams would be pinned at whatever support they happened to have and would
  never flow.
- `settle` deposits water **as water**. Everything else lands as rubble, and a
  river that silted into a sandbank the moment it stopped would not be a river.
- Water is exempt from `settle`'s check-what-is-underneath guard. That guard
  exists to stop pixels freezing at the apex of an arc; water needs to be able
  to come to rest on top of other water, which is how a shaft fills from the
  bottom.

Seam water drains and pools on its own: 33 896 cells of it are laid down in
seams, and it finds the cavern floors and goes still: with nobody digging, the
seams have drained by 900 frames and the whole world is at rest — no water
moving, nothing falling, only the entombed residue still holding slots. In a world
with lemmings in it the flow never quite reaches zero, and that is the lemmings:
every tunnel that breaks into a seam is a new outlet.

### Sinking

Sand sinks through water, and the mechanism is the second row of the table
above: **water holds nothing up.** A grain resting on a pool has three water
cells beneath it, and counting those as support is exactly what made sand float
on water like a raft. Discount them and the cohesion test the grain was already
running answers "not held" all by itself.

What it does then is the one new rule. A cell with water directly beneath it
**trades places with it**: the grain takes the cell below, the water takes the
cell it left, one cell a frame, both conserved. No pool slot is involved — two
field cells simply exchange contents — so sinking carries on working in a world
whose pool has run dry. It is the only place in the simulation where anything
writes a cell other than its own, so the cell below is *claimed* with a
compare-exchange rather than stored into: the water's own invocation may be
releasing it in the same pass, and exactly one of the two may have it. For the
same reason every release in `emit` now claims its cell before it spends
anything from the pool, so a loser costs nothing and leaves nothing half-done.

Granular material — anything that needs as many neighbours as rubble does —
**always** sinks. On land that bond is what holds a heap together; in water it
has no cohesion at all. Gate sinking on cohesion instead and a slab of sand
floats on its own bottom row's neighbours, and loose sand knits into a crust on
the surface and floats too: 183 grains sitting on water after 600 frames,
measured. Stone keeps its cohesion, so a rock ledge over a flooded pocket stays
a ledge, while a lone stone dropped in a pool goes under. Bedrock is asked for
no neighbours at all, so it is held by definition and stands in the water.

In a sealed tank: a slab of 720 grains eight deep goes from the surface to
exactly the floor, the 6 300 cells of water rise by exactly eight rows, a loose
scatter of 648 grains all reach the bottom, and matter is conserved to the cell.

**Lemmings drown.** Water is checked before the debris test, and it is fatal on
contact — a lemming caught by a flood does not decohere into a spray of its own
pixels the way one crushed by falling rock does, it simply goes under, so there
is nothing to release. Dropped into a flooded seam, 351 of 600 went under in a
single frame; the same 600 on dry ground lost none over sixty frames.

## The placeholder

A tunnel is not the absence of pixels. Underground, emptiness is made of a
**black placeholder**: a cell that is present — it counts as a neighbour, so a
cave roof rests on it and a tunnel a lemming digs keeps its shape — but that
stops nothing. A pixel falls straight through it to the real floor, water runs
along it, a lemming walks through it, and whatever comes to rest in it
*replaces* it. It is black, has no colour and no bond, and is never carried
anywhere. Only the sky above the skyline is truly empty.

It is water's mirror image, and that symmetry is the whole design: water
blocks and bears nothing, the placeholder bears and blocks nothing. Both fall
out of keeping "can a pixel move into it?" separate from "does it hold its
neighbours?".

Generation carves the caves and then fills every hollow below the skyline with
it — last, so the passes that grow moss and vines can still tell a cave from a
wall. A world of twenty-one million cells has about five million of placeholder,
and not one genuinely empty cell under the ground.

Three things had to be told about it explicitly:

- **Settling claims either.** A pixel comes to rest in empty space or in the
  placeholder, and each is its own compare-exchange, so losing a race for either
  leaves nothing half-done. "Becomes whatever perturbs it" is that one function.
- **It is never released.** Neither cohesion, the brush nor a blast can move it:
  a tunnel is not material.
- **Impacts and the brush do not count it as cover.** What resists a blow and
  what the brush has to reach through is the matter packed round a cell, not
  the shape of the tunnel it lines. Count the placeholder and every cave wall
  reads as buried eight deep — unsmudgeable, and too well packed for any impact
  to splash.

A blast is different from digging on purpose: it leaves *real* emptiness
behind, so the crater's walls lose their neighbours and collapse exactly as
before. Measured: a blast in a cave wall brings down 1 107 cells over the next
ninety frames; 30 000 cells of lemming tunnels over ten seconds bring down
3 000, most of those from the bombs.

## Lemmings

Small creatures walk the world and tunnel through it, each steered by a brain
of its own. See **Brains**, below.

They are not part of the field — sand does not rest on one — but they read it
for every decision, so a tunnel one digs is a real tunnel and a floor blown out
from under one really drops it. Beneath the brain there is a reflex of three
lines, enough to follow the contour of a cave: nothing underfoot and it falls,
whatever else it was doing; clear ahead and it walks on; one cell in the way
and it steps up; anything taller and it turns round. The brain decides whether
to walk, dig or turn; the reflex does the rest.

**They come apart.** A lemming is drawn as a little block of pixels, and when
something tears through it fast enough that block is released into the particle
pool — the creature decoheres into its own pixels and they fall, pile and settle
like anything else. It is the same bargain the rest of the simulation makes:
hold together until something takes you apart.

**Digging turns cells into the placeholder.** Nothing is released and nothing
is spent from the pool: the tunnel keeps its shape, holds its own roof up, and
stays. A tunnel is one cell bigger than the lemming in every direction it can
be — its own height plus headroom, cut two columns ahead so the working face is
always clear of the sprite. Bedrock is beyond a lemming, and water is not dug
but drowned in. Six hundred of them excavate fifty to ninety cells a frame.

Coming apart is the one thing a lemming does that **pops free slots from the
same pool budget the world uses**, which is why `step_agents` runs before
`emit` rather than after.

There used to be a bomb. It is gone: with survival part of the score, a
self-destruct is just a way to score nothing, and a three-action space evolves
faster than a four.

### Two markers in the overlay

A lemming needs to know whether something is hitting it, and both the moving
pixels and its own sprite live in the overlay. Without telling them apart it
reads the body it drew last frame and shatters itself on the spot.

So `splat` sets `OVERLAY_FAST` on cells a pixel is tearing through — the overlay
has no room for a velocity, and this is the one bit of it that matters — and
`draw_agents` sets `OVERLAY_AGENT` on its own sprite. Both sit above the colour
bits, so `atomicMax` keeps a fast pixel visible over a lemming and a lemming
over ordinary material, and the composite masks them off.

Lost lemmings are replaced after a delay. Without that the population only
ever falls — floods and falling rock take them — and the world goes quiet inside
half a minute. Who comes back is the interesting part: see below.

## Brains

Every lemming carries its own neural net, and no lemming was ever trained: they
are **evolved**. This is neuroevolution — a genetic algorithm over the weights,
not a GAN and not gradient descent — and it is why the whole thing fits inside
the compute pass that already existed.

The net is tiny: fifteen senses, eight `tanh` hidden units, four actions, 164
weights. It lives *inline in the lemming's record*, after its body, so the
forward pass, the elite clone on respawn and the once-a-generation readback all
touch one buffer through one binding. Inference runs on the GPU in
`step_agents`, once every four frames per lemming; a forward pass this size
costs less than the sand rule costs per cell, and there are at most four
thousand of them. Nothing off the shelf does per-agent nets inside a compute
shader, and the whole of it — `think` in WGSL, `forward` in JavaScript, and a
contract test pinning them to the same topology — is a few dozen lines.

**What it feels.** Everything is in the lemming's own frame — "ahead" is the way
it faces — so a brain does not have to learn the world twice over:

| sense | |
| --- | --- |
| bias | always one |
| drop ahead | nothing under the cell ahead: a pit, a cliff, a tunnel's end |
| ahead, above ahead | the cell ahead is solid; the one above it is too |
| hardness, hardness below | how hard the cell ahead, and the floor underfoot, is to dig: 0 open to 1 bedrock |
| water | water within a few cells ahead — fatal, so worth a sense of its own |
| facing | −1 or 1 |
| scent | direction to the nearest gold, ahead-positive, and how near it is |
| gold ahead | gold in one of the two cells ahead |
| gold near, gold below | how much of the block around it is gold, and whether the floor is — what tells it to dig *around* a nugget rather than straight through |
| digging | whether it is digging now, so it can learn to keep at it |

The **scent** is baked once at generation: a coarse grid holding the centre of
the nearest nugget to each cell, 64 KB, in a uniform. The grid only decides
*which* nugget is nearest; the vector to it is taken from the lemming's true
position, so its coarseness costs nothing but a little error on the boundary
between two nuggets' territories. A lemming smells gold within 1 024 cells.

**What it does.** Walk, dig ahead, turn, or **dig down** — whichever output is
largest, held for four frames, then asked again. Digging down takes out the
floor under the sprite and a cell either side, so the shaft is one wider than
the lemming, and the fall rule does the rest; a decision later it may dig
again. Twenty generations never dug downwards before this existed, for the
simple reason that no action did: the only way down was off a ledge.

**What it is scored on.** Fifty per cell of gold dug **ahead** — mined — which
is what the whole thing is for, and *nothing* per cell of gold dug **down**,
since gold taken out from under your own feet goes down the shaft with you: it
is destroyed rather than collected, and it is paid for as such. Paid in full a
shaft through a nugget was worth as much as mining it, and brains dug through
gold and kept going; at a tenth it was still a third of the population's gold
income and mining decayed generation by generation. At nothing, the only way
to score from gold is to dig along a seam — and a shaft is still how a lemming
reaches a deep one, because what pays is what it does when it arrives. But gold is rare, and a
first generation of random brains would all score exactly zero with nothing
to select on — so a lemming is also paid a tenth of a point per cell for
getting *nearer to gold than it has ever been*, a twentieth of a point per cell
of rock dug ahead, nothing at all per cell of rock dug down, and docked five
hundred for dying.

That tenth is small on purpose, and it was not always. At a full point per
cell the approach was worth up to a thousand over a lifetime — as much as
mining twenty cells of gold and far easier to collect — and it quietly became
the thing being optimised: brains learned to dive at a nugget and never mine
it. Measured over eight generations, 1 100 cells of gold shafted through
against 11 mined, with mining bred *out* as the generations went by. A
bootstrap that has done its job has to get out of the way. The approach term is what turns a
flat landscape into a slope evolution can climb. The digging term is small on
purpose — a few hundred a generation for a constant tunneller, about what
approaching is worth and far short of one nugget. Digging down earns nothing
in itself because, paid the same as digging ahead, brains dug down to a fault:
it is the quickest way to rack up cells, straight through nuggets and on
towards the bottom. A shaft has to earn its keep by what it reaches.

And what it reaches, if it keeps going, is **the sump**: a cavern spanning the
whole width of the world just above the bedrock, flooded to a level. Every
shaft dug far enough breaks into water, water is fatal, and the death penalty
is bigger than anything a shaft earns on the way down. Digging down is
something a brain has to learn to stop doing — which is what the gold-near and
gold-below senses are for.

**Lemmings cannot pass each other.** Another lemming ahead is a wall as tall as
a lemming, read from the overlay's agent marks a frame stale, in the column
just past this one's own sprite so it never trips over itself. The brain feels
it as a wall; a walker's reflex turns it round, so two meeting head-on both turn
and walk apart, and a digger stops at it rather than walking through.

**How they breed.** A generation is twenty seconds. At the end of it every
record — score and brain — is read back, 2 MB, the top tenth keep their slots
and their weights untouched, and every other slot becomes the mutated cross of
two of them: each weight from one parent or the other, about a tenth of them
nudged. All of it is a pure function of the seed, so a run can be replayed.

**Every generation starts from the same world.** The map is restored before
the new population is dropped in. Without that each generation inherits the
last one's tunnels and mined-out nuggets, and the task drifts under the brains'
feet: a score in generation forty means something different from the same
score in generation four, and selection is comparing apples with the remains of
oranges.

**The arena starts small and is grown.** The default world is 1 536 × 864 —
a sixteenth of the large one, with two dozen nuggets in it, so gold is dense
and a random brain can strike it — and the *World* control grows it to
medium or large once the brains have something to bring to a bigger place. A
brain knows nothing of size, so the population carries over; the choice is
remembered between visits. Two things deliberately do *not* scale with the
world, because a lemming does not: nuggets are 6 to 17 cells in radius in
every arena (scaled down with the world they were twenty cells of gold each,
and the small world taught nothing), and the crew is one lemming per eight
cells of width — 192, 384, 600 — since lemmings cannot pass each other and six
hundred of them is more lemming than a small world has ground.

Restoring the map removes one source of drift but not all of them, and it is
worth being clear about the limit. An elite keeps its brain, its slot and its
starting position, and the world it wakes up in is the same one — but the six
hundred lemmings *around* it are not, and lemmings block each other, dig
tunnels each other fall down, and bury each other. So an elite does not
reliably re-earn its score, and the best score can fall from one generation to
the next even though the best brain was kept. What is fixed is the task; the
crowd is part of the weather.

**Only successful nets are ever respawned.** A lemming that drowns or is
smashed mid-generation comes back, after a delay, as a *clone of a current
elite* — the shader copies the brain out of one of the slots the last selection
named. The elite keep their slots precisely so that list stays valid until the
next generation.

Diggers are drawn orange and walkers green, so you can watch what each brain
decided, and the line under the gold count shows the generation, how far
through it is, the best score bred from, and the frame count.

### Saving, sharing and committing brains

**The population is saved after every generation** — every brain, who the
elite are, and the generation count — in two places:

- **This browser's database**, always, so a reload does not throw away twenty
  minutes of evolution.
- **A folder on disk**, once you have chosen one with *Save to folder…*. Point
  it at `public/populations` and the repository's copy keeps itself current:
  `latest.pop` is rewritten every generation and a numbered `gen-00050.pop`
  kept every fifty, so a good run can be committed and shared. The browser
  remembers the folder but not, across a reload, the permission to write to
  it — that takes one more click, which is what *Resume saving* is.

On start the app takes whichever has come further: the browser's own progress
or `public/populations/latest.pop`, the population **shipped with the
repository**. Pull the repo and you start from wherever that had got to.
*Export* downloads the current population as a `.pop` file and *Import* loads
one, for browsers that cannot write to a folder and for passing a population
around by hand.

The file is a fixed header, a JSON block for everything human, then the raw
weights: 164 floats a brain, so 600 lemmings is 394 KB and the full 4 096 is
2.7 MB. A population bred with an earlier body — twelve senses and three
actions, or thirteen and four — is **migrated** on the way in rather than
refused: every weight lands where it was, a new sense is wired with zeros and a
new action scores zero, so the brains behave exactly as they did and can now
learn what they could not. Everything that comes back — from the database, a folder or a file — is
checked before it is trusted: version, shape, every weight finite, elites in
range. What fails is dropped, not loaded.

Reset, New world and the lemmings slider all keep the brains: more lemmings
than brains and the newcomers are mutated copies of what was learned, fewer and
the rest are dropped. **Forget brains** starts over from generation 0.

**Measured**, with generations shortened to 400 frames so several fit a run:
mean score 17 → 18 → 30 → 26 over four generations, best 106 → 135, with 394
of 600 lemmings scoring something 200 frames into a generation and a spread of
19 points across the population — a slope, in other words. A crew of 600
dropped beside a nugget had 571 digging at it a second later. Before the
landing rule every lemming scored the same 750-odd points for falling out of
the sky, generation after generation, and nothing moved.

What this is not, yet, is a solved game: four short generations do not breed
a prospector. It is the loop — sense, act, score, select, respawn the winners —
running end to end on the GPU, with a real signal on the slope.

## Gold

The world is sprinkled with **gold**, and the score is how much of it lemmings
have dug through. The readout at the top of the screen is the whole game so
far: find a nugget, lead a crew to it — a smudged tunnel is a road — and let
them mine it.

Nuggets are compact discs rather than veins, because a vein is a thin line that
vanishes when you zoom out and the whole point is that you can see gold from
across the world. One per 200 000 cells and never fewer than two dozen — a
hundred-odd in the large world — each replacing only
stone — never soil, water, a cave or bedrock — so a nugget embedded in a cave
wall shows its face to the cave and one under the ground has to be dug for.
They are biased towards the surface: most are a short dig down, so a lemming
left to itself strikes one now and then, while the deep ones take leading a
crew all the way.

Gold is the one material told apart by **what it looks like**. A pixel carries
its colour and its bond and nothing else — the state word has no bit to spare
for a material tag — so a nugget blown out of a wall and settled somewhere else
can only still be gold if gold is recognised by its colour. The thresholds sit
outside every other material's grain, and a test proves it stays that way.

A crew placed beside a nugget and set digging mines fifty cells of it in forty
frames. Whether a lemming left to itself finds any is now up to its brain.

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

Three sizes, all the same shape: small, 1 536 × 864, where a run starts;
medium, 3 072 × 1 728; and large, 6144 × 3456 cells — about twenty-one million,
some six times the area of a 1080p screen at 1:1. What follows describes the
large one; every feature is a fraction of the world, so the others are the
same place at a smaller scale. A rolling surface with soil, sand lenses, grass and trees;
a tunnel-and-cavern system carved out of the rock beneath it; a flooded sump
spanning the whole width just above the bedrock; moss, glowcaps,
mushrooms and hanging vines lining the caves; ore veins, water seams and nuggets
of gold; and pockets of loose spoil buried in the stone that run like sand the
moment you breach one. Every hollow below the skyline is made of the black
placeholder, not of nothing.

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
| `flowing/f` | water cells that moved this frame; falls to near zero as pools level |
| `drowned/f` | lemmings lost to water this frame |
| `sank/f` | cells that traded places with the water beneath them this frame |
| `gold mined` | the score: cells of gold mined by digging along a seam |
| `gold shafted` | gold a shaft merely fell through, counted apart; a brain that has learned to stop digging down on a strike keeps this the smaller number |
| `generation` | which generation, and how far through it |
| `best score` / `mean score` / `last gen gold` | how the last generation did before it was bred from |
| `view` / `zoom` | where the camera is and how far in |

## Layout

| Path | What lives there |
| --- | --- |
| `src/core/` | Pure logic: cell encoding, cohesion and the sand rule, geometry, the integrator, the camera, noise, world generation, buffer layouts, the lemming brain and how it breeds, the scent of gold. No GPU, fully unit-tested. |
| `src/gpu/` | Device acquisition, pipelines, buffer ownership, non-blocking readback. |
| `src/gpu/shaders/` | `simulation.wgsl` (ten compute entry points) and `composite.wgsl`. |
| `src/worker/` | World generation, off the main thread. |
| `src/storage/` | Where the population is kept between visits: the browser's database, and a folder on disk. |
| `public/populations/` | The population shipped with the repository. Save to this folder and it keeps itself current. |
| `src/ui/` | Debug-panel formatting and the frame-rate meter. |
| `test/` | `node --test` suites, including a contract test that fails if the shader and the JavaScript memory layouts drift apart. |

## Frame order, and why it is that order

```
prepare  →  integrate ×4  →  advance  →  settle  →  step_agents
         →  emit  →  splat  →  draw_agents  →  composite
```

`settle` only ever **pushes** to the free-slot ring; `emit` and `step_agents`
(for a lemming coming apart — digging costs nothing) only ever **pop** from it. Because they are separate dispatches, a slot can never be
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
