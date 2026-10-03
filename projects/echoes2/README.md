# Echoes 2

A new Wasmodeus experiment: charge territory, trigger cascades, and play against
local decisions remembered from earlier human games. Echoes 1 remains a separate
project with its own database and rules.

## Play

```sh
npm run dev:echoes2
```

Open http://localhost:4178. Blue is yours; coral is the ghost's. Click one of your
cells to add a charge, or expand into an empty cell sharing an edge with your
territory. You cannot directly charge enemy territory or a remote empty cell.

Cells hold three charges. Adding a fourth sends one charge north, east, south
and west. Incoming charges capture their destination and can trigger further
bursts. Charges that leave the board disappear. The complete cascade resolves
before the next turn. Capturing all opposing territory wins immediately; after
16 human turns and the final ghost response, the side controlling more cells
wins. Equal territory is a draw. Completed matches restart automatically, while
history review pauses progression. New matches prefer a safe earlier position where
the ghost passed, with colours reversed. Playing that side teaches the archive
a response to a situation it previously could not answer. The source is saved
and shown, and reload preserves the selected opening.

The first match teaches the archive. With no matching memory, the ghost visibly
passes; a previously unawarded full-board position earns one breakthrough point.
After that match, your choices become possible ghost replies. An early ghost
will be weak: resistance comes from the recorded human vocabulary, rather than
a hidden fallback opponent.

## What the ghost remembers

A human decision records the charged cell and its four immediate neighbours,
including charges, empty cells and board boundaries. Colours are interpreted
relative to the actor, so a human blue action becomes a coral ghost action.
Rotations and reflections are allowed. More distant cells may differ: the
remembered action is checked and simulated on the entire current board, then
ranked among the available real memories by capture and territorial result.

Each match freezes the eligible earlier games. New decisions cannot answer
themselves during the same match. Automatic passes and ghost moves do not count
as new human knowledge. A replay retains its original game, turn and spatial
orientation. Breakthrough scoring normalises full-board rotations/reflections
and prevents repeated awards for the same unanswered position.

The position space remains finite. This prototype tests charge timing, threats,
captures and reusable local memories as sources of strategic variety.

## Persistence and verification

Every human action, ghost reply, pass and new match rewrites the entire independent
`data/games.json` database. Writes are atomic, synced and backed up in
`data/games.json.bak`. Revision checks reject stale tabs. Corrupt files are retained
and reported instead of being reset. Pending ghost turns resume after reload;
animations run only after their result has been saved. Download database exports
the full confirmed history.

`PORT` defaults to `4178`. `ECHOES2_DATABASE_PATH` overrides the file location.
The server binds to localhost. Runtime databases and built assets are git-ignored.

```sh
npm run check:echoes2
```

The check runs ESLint, strict JavaScript static analysis, pure-rule/history/game/
storage/controller/API tests, compiled AssemblyScript/WASM parity tests, and the
web build. Production play cross-checks its saved transitions against the WASM
cascade engine before publishing an action.

Rules, archive matching, game state, validation, persistence, animation and UI are
separate modules. Edge dissipation makes cascades terminate: a nonnegative
position-weighted charge energy decreases on every burst. Tests cover dense
cascades, capture waves, all eight orientations and malformed engine inputs.
