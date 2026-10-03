# Echoes

A playable Wasmodeus experiment: eight shared stones, four blue and four amber,
and an opponent made from transformed human history.

## Play

From the repository root:

```sh
npm install
npm run dev:echoes
```

Open http://localhost:4177. Make a contiguous straight line of **four blue stones**
before the ghost makes four amber. Horizontal, vertical and diagonal lines count.
Either player may move either colour; moving an amber stone can break its threat,
but completing its line gives the ghost the win.

Select a stone, then a highlighted destination. Arrow keys navigate the board;
Enter or Space selects a cell. Move one cell, including diagonals, keep all eight
stones connected through shared edges, and leave the ringed resting stone alone
for one turn. The colours remain attached to their stones.

When history has no reply, the ghost passes and you move again in the same match.
A newly discovered canonical frontier also earns a discovery point. Line wins
and discoveries have separate scores. A match ends after a line or a draw at
24 human moves; a brief result animation leads straight into the next match.
Reviewing history pauses automatic continuation.

Each new match jumps to a weighted random historic constellation when a safe
one is available. Repeated, rotated and mirrored copies count as one candidate.
The weight is `(distinct legal child positions + 1) / (distinct recorded human
child positions + 1)`, favouring positions with room left to explore. Repeated
decisions and ghost moves add no knowledge to this count. When available, the
draw favours starts where at least one legal move allows a recorded ghost reply.

Earlier coloured matches keep their colours; older uncoloured positions receive
four stones per side. Safe starts have equal current line lengths, no completed
line and no immediate winning move. These checks do not establish measured
50–50 win odds. The last match and its opening, pre-win and final shapes are
excluded; a balanced default opening is the fallback. The opening's source is
shown in the match and its history.

Every recorded ghost action has a visible turn: a translucent historical
constellation rotates or reflects into alignment, then its stone travels to its
destination. The cue explains whether it is completing a line, blocking your
winning move or building a threat. The action is saved before motion begins,
and input waits for it to finish. **Replay ghost move** repeats the visual
without changing history or points. Reduced-motion preferences use brief fades.

## Your entire history is saved on every progress

The local Node server atomically rewrites `data/games.json` after initialization,
every human move, every ghost move or frontier result, and every new encounter.
It retains **all** encounters, including abandoned ones, complete before/after
positions, human and ghost actions, resting markers, frozen archive membership,
timestamps, turn limits, and original-human provenance with spatial transforms.
`data/games.json.bak` holds the previous complete save. Writes sync file contents
and the rename to disk before the client advances. A revision check prevents
two tabs from silently overwriting one another. These private runtime files are
git-ignored.

Reloading resumes the active game. An interrupted ghost turn is resolved from
the same frozen archive. The selected historic opening and colours are saved
before play starts, so reloading never rerolls them. Corrupt or incompatible
saves produce an error and are preserved; they are never silently replaced. The **Download database**
button exports the complete last-confirmed database. To recover a corrupt save,
stop the server, retain that file, and copy the valid `.bak` file to `games.json`.

Environment overrides: `PORT` (default `4177`) and `ECHOES_DATABASE_PATH`
(default this project's `data/games.json`). The server binds to localhost.
Persistence requires this server; opening `index.html` directly is unsupported.

## Archive rules

Only previous human decisions are eligible. The eight possible rotations and
reflections plus translation must match the **entire** shape and resting marker.
Each match freezes eligible game IDs at its start, excluding its own new moves.
Colours affect the goal, but do not affect move legality or geometric matching;
this lets all older recordings remain useful. Ghost moves keep their original
human provenance and never count as new human knowledge.

The ghost ranks the available recorded legal replies: complete its amber line,
avoid giving you a blue line, block your immediate win, then build its own
threat. It cannot invent a winning or blocking move missing from the archive.
If there is no reply, play passes back to you. Discovery points count distinct
canonical unanswered positions, including older frontier awards, so rotated or
repeated discoveries cannot inflate the score.

Every match stores its initial board, stone colours, exact pass handoffs,
discovery indices and line/draw outcome. Validation replays the moves and checks
stone identity, recorded reply provenance, earned discoveries and the outcome.
Older encounters retain their original rules and outcomes. On upgrading, an
active older encounter is preserved as abandoned and a coloured match starts.
Abandoned encounters continue contributing their human decisions to the archive.

The eight-stone space is finite. This prototype tests how it feels as the
archive grows; it does not assert an infinite strategy space.

## Verify

```sh
npm run check:echoes
```

ESLint, strict JavaScript static analysis, Node unit/API/persistence tests,
compiled AssemblyScript/WASM parity tests, and the production web build are
included. Pure rules, spatial matching, game transitions, persistence, HTTP,
controller, board layout, and the browser entrypoint are separate modules.
