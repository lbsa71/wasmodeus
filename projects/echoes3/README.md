# Echoes 3 — Branching futures

A Wasmodeus experiment in growing game trees and exact historical opponents.
Run `npm run dev:echoes3` from the workspace root, then open
[localhost:4179](http://localhost:4179).

## One operation

Cut any tip of the shared tree. A tip directly attached to the permanent root
simply disappears. Otherwise, remove the tip and make a second copy of its
now-pruned parent branch, attached beside the original at the grandparent.
Take the final branch to win. Both players use the same rule and the same tree.

A cut can make the tree larger. The opening has five branches; one of its cuts
creates a seven-branch tree. The small seed is a tutorial. Other seed shapes can
produce much longer games, and **Grow seed** adds another tip to an initial
branch. The rules have no fixed board dimensions or node-count cap. The family
of possible initial trees is unbounded, although each individual match ends.

To see why play cannot loop, assign a leaf weight one and every other node
weight `3^(sum of its children's weights)`. Cutting divides the parent's weight
by three. Two copies of the pruned parent together retain only two-thirds of
its old weight. Ancestor weights, including the root's positive integer weight,
therefore strictly decrease. This is a mathematical argument only; the engine
never computes these enormous numbers.

## Exact memories

A leaf is encoded as `()`. Any other node is encoded as parentheses containing
its recursively sorted child encodings. The outermost node is the permanent
root. This identifies a complete unordered rooted tree, independently of its
screen layout or sibling order. Different tree structures keep different keys.

The ghost can act only when an earlier real human decision began at precisely
the same complete canonical tree. It replays that decision's leaf path and
records its source match and turn. Equivalent symmetric cuts are grouped by
their resulting canonical position. Available memories are ranked by immediate
victory and historical outcomes; no search solver supplies missing moves.

Each encounter freezes its eligible earlier games. With no matching memory,
the ghost saves a pass and the human plays from that identical position. That
human response becomes an exact answer for a future encounter. A previously
unrewarded unanswered position earns one breakthrough point. Match victory
always requires taking the last branch.

Completed matches advance automatically to an underplayed historical position
with meaningful choices, or to the opening if none is available. Selecting a
saved position pauses advancement; merely expanding the archive does not.
Seed choices and **Grow seed** provide fresh starting structures.

## Save and verify

Every cut, ghost pass, and new encounter saves the entire independent
`data/games.json`. Atomic writes, file/directory syncing, a `.bak` snapshot, and
revision checks protect progress. Interrupted ghost turns resume after reload.
Animations begin after their results have been saved. Corrupt saves are reported
and retained. The archive exports the complete confirmed database.

`PORT` defaults to `4179`; `ECHOES3_DATABASE_PATH` overrides the save location.
The server listens only on localhost. Runtime data and generated assets are
ignored by Git. Echoes 1 and 2 retain their own projects and databases.

```sh
npm run check:echoes3
```

The check runs ESLint, strict JavaScript static analysis, rules/history/game/
controller/storage/API/UI tests, compiled AssemblyScript parity tests, and the
web build. The browser cross-checks every cut with the WASM engine before saving
or presenting it. Rules, matching, game flow, validation, persistence, layout,
and animation are separate modules.
