Here’s a compact developer-facing brief built around validating the **fun hypothesis before building the game around it**.

# STARSHIP PUZZLER — Proof-of-Enjoyability Brief

## Elevator pitch

**A real-time spatial puzzle game where you instantly switch between a tiny fleet of strange starships, each with one simple movement or interaction rule, and improvise solutions to tactical situations by combining them.**

Internal shorthand:

**“A platform-puzzler, except the characters are starships and the platforms are orbital routes.”**

The fantasy is not commanding a fleet from above. The player **inhabits the fleet one ship at a time**, switching instantly between vessels and using each as a tool.

A level might appear to require moving a giant laser into position—but this time the player has no tug. Instead they lure an enemy into firing at an asteroid, knocking it aside and opening the laser’s line of sight.

The satisfaction should be:

**“Wait… I can use THAT to solve THIS.”**

---

# 1. Hypothesis of fun

The game is fun if the following loop is intrinsically satisfying:

1. **Read** a small spatial problem.
2. **Understand** the absolute rules of the available ships and objects.
3. **Form a plan** involving an unexpected interaction between them.
4. **Execute it directly with a controller**, with enough analogue movement to feel like piloting rather than issuing orders.
5. **Watch the plan snap into place** through clear, deterministic consequences.
6. Often realize there was an even more elegant solution.

The central design principle is:

> **Simple individual rules; complex combinations.**

Ships should not primarily differ through stats.

They should differ through verbs.

Examples:

* Tug: attaches to and moves heavy objects.
* Scout: fast and agile; useful for baiting enemies.
* Wormhole ship: creates two connected transit points.
* Laser platform: devastating fixed-line weapon, but difficult or impossible to move itself.
* Bulwark: maintains a directional shield.
* Rammer: can leave a route in a straight-line charge.
* Hunter enemy: chases the last ship that enters its detection zone.

Likewise, environmental objects follow tiny deterministic rules:

* Laser fires until something blocks it.
* Asteroid moves when struck by sufficient force.
* Enemy pursues a detected target.
* Wormholes connect two valid route anchors.
* Shield blocks attacks crossing one side.
* Heavy objects remain locked to orbital routes.

The game should produce surprising results from **interactions between simple rules**, not from hidden simulation complexity.

---

# 2. Movement hypothesis

This is **not a grid tactics game**, but it should have a board-like logical structure underneath.

The useful analogy is a 2D platformer.

A platformer gives the player analogue control, but the geometry continually returns them to meaningful discrete states:

**platform → jump → platform**

This game should behave similarly:

**route → excursion → route**

The battlefield contains readable orbital routes, transit lanes, gravity paths, station approaches, etc.

While attached to one of these routes, movement is constrained and predictable.

The player can temporarily steer away from it:

* approach an enemy,
* bait detection,
* dodge,
* take a shortcut,
* cross toward another route,

but ships naturally return or snap into another valid movement structure.

Thus the player gets **controller expressiveness during transitions**, while the puzzle remains built from a manageable number of meaningful spatial states.

Most consequences should remain digital:

* in line of sight / not in line of sight;
* attached / unattached;
* detected / undetected;
* on route A / route B;
* portal valid / invalid;
* shield blocking / not blocking.

Avoid puzzles whose solution depends on pixel-perfect placement.

---

# 3. Core control hypothesis

Controller-first.

Suggested baseline:

* Left stick: analogue movement / excursion from route.
* Shoulder buttons: instant previous/next ship.
* Face button: primary ship ability.
* Face button: contextual interaction / attach / deploy.
* Optional right stick: orientation only where genuinely necessary.

**Ship switching must be effectively instantaneous.**

Inactive ships continue their simple current behavior where appropriate:

* orbiting,
* travelling a lane,
* holding a shield,
* towing,
* maintaining a portal,
* continuing straight.

The interesting execution challenge should come from coordinating several simple machines—not wrestling with controls.

---

# 4. Prototype strategy

Do **not** build a generalized game framework first.

Each prototype should answer exactly one question about whether the game is enjoyable.

Every phase inherits only the mechanics that passed the previous phase.

Use placeholder graphics throughout.

---

## Prototype 0 — Does moving through constrained space feel good?

### Question

**Can analogue controller movement constrained by orbital routes feel both expressive and predictable?**

### Contents

One screen.

* One circular asteroid or planet.
* Two concentric orbital routes.
* One player ship.
* One transfer path between the routes.
* No combat.
* No objectives beyond moving around.

The player should be able to:

* cruise naturally along an orbit;
* push inward/outward with analogue input;
* temporarily leave the route;
* be recaptured by the same route;
* intentionally transition to another route.

### Success criterion

Without explanation, a tester should quickly develop an intuition for:

> “If I steer this way, I know roughly which route I'll end up on.”

Movement should feel satisfying even before there is a puzzle.

### Kill criterion

If movement feels like either:

* a disguised grid, or
* slippery free-flight,

the foundation needs redesign before proceeding.

---

# Prototype 1 — Is baiting an enemy a puzzle verb?

### Question

**Does free-ish piloting become interesting when used to manipulate deterministic enemy behavior?**

### Contents

Keep Prototype 0.

Add:

* one enemy;
* one detection radius;
* one deterministic behavior:

> When the player enters detection range, enemy pursues that ship until it reaches a route.

Add a safe destination or marked zone.

Goal:

**Lure the enemy into the target zone.**

No shooting yet.

### Desired experience

The player approaches cautiously, sees the enemy react, turns, flees along an orbital path, and realizes they can manipulate where the pursuer ends up.

This establishes analogue movement as part of the **solution**, rather than merely traversal.

### Success criterion

Players deliberately manipulate pursuit trajectories and can explain why the enemy ended up where it did.

---

# Prototype 2 — Does an indirect “Aha!” interaction work?

### Question

**Is solving a situation indirectly more satisfying than simply attacking the objective?**

### Contents

Keep previous systems.

Add:

* stationary giant laser;
* destructible/movable asteroid blocking it;
* enemy capable of firing;
* player scout;
* instant ship switching if needed.

Goal:

**Destroy a target behind the asteroid.**

The player cannot move the laser.

Intended discovery:

1. Bait enemy.
2. Position its attack.
3. Dodge.
4. Enemy hits asteroid.
5. Asteroid moves out of the lane.
6. Laser now has line of sight.
7. Fire laser.

### Critical requirement

The game should not explicitly tell the player this sequence.

The mechanics themselves must be readable enough for the player to discover it.

### Success criterion

The moment of realization produces something close to:

> “Oh! I can make HIM move the asteroid.”

This prototype is the first real **proof of the game’s hypothesized fun**.

If this interaction is intellectually understandable but emotionally flat, reconsider the concept.

---

# Prototype 3 — Does instant fleet switching improve the puzzle?

### Question

**Is controlling several ships directly more enjoyable than controlling one multifunctional ship?**

### Contents

Build a small 5–10 minute level.

Available:

### Scout

Fast. Can bait enemies.

### Laser

Stationary or route-bound. Fires along one clear direction.

### Tug

Can attach to a heavy object and pull it along valid routes.

Three small puzzle situations should require switching between them.

Example:

1. Tug moves debris.
2. Scout draws enemy through the newly opened path.
3. Switch to Laser.
4. Fire as enemy crosses its lane.

Then create a variation where Tug is absent and the player must solve a similar spatial problem using enemy behavior instead.

### Success criterion

Players begin thinking in terms of:

> “What can each member of my fleet do for the others?”

rather than:

> “Which ship is strongest?”

Switching should feel almost subconscious by the end.

---

# Prototype 4 — Does capability substitution create depth?

### Question

**Can removing the obvious tool create satisfying new solutions without introducing new mechanics?**

### Contents

Create 4–6 micro-levels using only mechanics already proven.

Each level should revolve around a familiar requirement with one expected tool missing.

Examples:

### Need to move something, but no Tug

Use:

* enemy weapon recoil;
* asteroid collision;
* gravity route;
* rammer.

### Need to reach somewhere, but no Wormhole

Use:

* enemy pursuit;
* route transfer;
* moving object as temporary bridge/path.

### Need an enemy moved, but cannot attack it

Use:

* baiting;
* threat zones;
* environmental hazards.

### Need line of sight

Instead of moving the weapon:

* move the blocker;
* move the target;
* rotate the route structure;
* force enemy movement.

### Success criterion

Players start asking:

> “What else causes movement?”

or:

> “What other rule can substitute for the missing ability?”

At this point the game has demonstrated systemic puzzle depth.

---

# Prototype 4b — Do chained planetary systems make traversal richer?

### Question

**Does timing a transfer between two planets' outer orbital routes create a legible, satisfying spatial puzzle?**

### Contents

Keep the proven route → excursion → route movement. Add a second planet whose outer route periodically passes within jump reach of the first planet's outer route. Each planet owns its own four route levels; the two outer levels form a moving transfer opportunity rather than a permanent bridge.

The player should be able to:

* read the approaching alignment from the route geometry;
* jump from one planet's outer route to the other at the right time;
* miss cleanly and return to their departure planet rather than enter ambiguous free flight;
* use the transfer timing as a meaningful route choice, not a reflex-only gate.

### Success criterion

Players anticipate the handoff and say something like: “I can catch the other planet on its next pass.” The system succeeds if the transfer feels like an extension of the same platform language, with each outer route becoming the other's next platform.

### Kill criterion

If players cannot predict whether a jump will transfer, miss, or recapture—or if waiting dominates the decision—the planetary chain should remain a visual idea rather than a core traversal layer.

---

# Prototype 5 — Add the Wormhole

Only after the previous prototypes work.

### Question

**Can a new ship create genuinely new combinations rather than simply serving as a key for portal-shaped locks?**

Add one vessel:

### Wormhole ship

Can establish two portal anchors at valid positions.

Possible interactions:

* move Tug through portal;
* tow Laser through portal;
* redirect an asteroid;
* create a shortcut during enemy pursuit;
* relocate an attack trajectory;
* escape after baiting something.

Create three levels:

1. Obvious portal tutorial.
2. Portal combined with Tug.
3. Puzzle where the portal is not used for the player ship at all.

The third is the important one.

The system is succeeding when abilities become tools for manipulating **other systems**, rather than bespoke locks and keys.

---

# 5. Prototype content rules

During validation:

* Levels should fit mostly on one screen.
* Use very few objects.
* Introduce no more than one new rule at a time.
* Restart should be instant.
* Failure should be cheap.
* Avoid health systems unless absolutely necessary.
* Avoid inventories.
* Avoid skill trees.
* Avoid upgrades.
* Avoid randomized combat.
* Avoid procedural levels.
* Avoid narrative systems.
* Avoid economy/metagame.
* Avoid generalized AI.

The purpose is to prove the **moment-to-moment thought process**, not progression.

---

# 6. Graphics

Do not commission production art for these prototypes.

Use an intentionally schematic visual language.

### Recommended

* primitive circles, capsules and triangles;
* simple low-poly 3D models viewed from above;
* flat billboard icons;
* line renderers for orbital routes;
* translucent circles/cones for detection zones;
* extremely obvious beam previews;
* simple particle burst when something fires or collides.

Ships should be recognizable by silhouette alone.

Example:

* Scout = small triangle.
* Tug = squat rectangle with visible tether.
* Laser = long cannon shape.
* Wormhole ship = ring or twin-pronged shape.

Environment:

* Asteroids = circles / cheap low-poly rocks.
* Planet = large sphere/circle.
* Routes = thin curves.
* Portals = animated rings.
* Targets = obvious geometric markers.

### Asset sourcing

Prefer, in order:

1. Engine primitives and procedural shapes.
2. Existing internal prototype assets.
3. CC0/public-domain generic space assets.
4. Cheap generic asset packs only if they save actual development time.

Do not spend time creating a coherent visual universe yet.

What matters visually is **rule readability**.

A tester should be able to see:

* what blocks a laser;
* which route an object occupies;
* whether an enemy detects them;
* where a portal can connect;
* what is being tugged;
* what will happen when they press the button.

Presentation can become spectacular later.

The underlying prototype should remain understandable with circles and lines.

---

# 7. Audio

Minimal but useful.

Use temporary/public-domain/CC0 sounds.

Give every important rule a distinct confirmation:

* route capture;
* enemy aggro;
* tether attach;
* portal deployed;
* laser charged;
* laser fired;
* object struck.

Audio should reinforce state transitions.

No music required for proof-of-fun testing.

---

# 8. Camera

2D logical plane.

Presentation may use 3D models and visual depth, but Z should not initially affect gameplay.

Prefer:

* fixed top-down or shallow perspective camera;
* whole puzzle visible simultaneously;
* minimal/no manual camera control;
* no occlusion of relevant objects.

Ships may roll, pitch and animate dramatically without changing their logical position.

---

# 9. What NOT to validate yet

Do not ask testers whether they would buy the game.

Do not ask whether they like the art.

Do not ask whether they want more ships.

Do not build progression to improve engagement.

The important observations are:

* Do they experiment voluntarily?
* Do they form hypotheses?
* Do they understand why something happened?
* Do they discover interactions without explicit instructions?
* Do they enjoy executing a plan after discovering it?
* Do they restart because they thought of a better solution?
* Do they say things resembling “What if I…?”

The strongest signal is when a player completes a level and immediately sees another possible solution.

---

# 10. Go / no-go milestone

After Prototype 4, there should be a small playable build containing perhaps **15–20 minutes of material**.

Do not expand production until testers repeatedly demonstrate this loop:

**observe → hypothesize → experiment → discover interaction → execute → delight**

The project has passed its proof-of-enjoyability milestone if players are enjoying this loop **with placeholder graphics, no progression system, almost no narrative and only three or four ship types**.

If that stripped-down version is fun, everything else can amplify it.

If it is not, more content will not rescue it.

---

# One-sentence design north star

**Make the player feel like they are piloting a tiny fleet through a space battle while actually solving a beautifully legible mechanical puzzle.**

The key sequencing choice here is that **Prototype 2 tests the actual “aha”**, while 0–1 only prove the movement language needed to support it. That keeps the team from accidentally spending months polishing a novel navigation system before proving it creates interesting puzzles.

---

## Current local prototype

> Update: Prototype 2 is now implemented. Red fires while pursuing; a shot that crosses the blocking asteroid knocks it aside. The fixed laser then charges and automatically destroys the target once its line is clear. The player cannot directly move the laser or asteroid.

The checked-in slice implements Prototype 1: a deterministic WebAssembly movement and pursuer core, direct WebGPU rendering, controller/keyboard input, and four widely spaced orbital levels. The movement language from Prototype 0 remains: holding up starts an outward jump, releasing before the apex falls back, and down starts a committed inward fall. Tangential speed is always derived directly from the current radius using the Newtonian circular-speed equation, including during jump and fall animation; only radial velocity is animated. Red is a second ship governed by the exact same movement state machine: it can only stay on a ring, hold an outward jump, release it, or commit to an inward fall. Its deterministic pursuit policy uses the target ring and angular separation to select those inputs—dropping inward to gain on a target ahead, while holding its ring when the player trails behind. Red only pursues inside its detection radius; contact resets both ships to the start. Bait it into the amber zone; every successful lure relocates the target to a different ring and angle.

```sh
npm run dev --workspace @wasmodeus/starship-puzzler
```

Open [http://localhost:4175](http://localhost:4175). Enter the red detection ring, lead the pursuer toward the amber target zone, then let it capture the route. Hold stick up or W/↑ to jump outward; release before the apex to fall back. Press stick down or S/↓ for a committed inward fall. Use <kbd>R</kbd> to reset.

Verify it with:

```sh
npm run check:full --workspace @wasmodeus/starship-puzzler
```
