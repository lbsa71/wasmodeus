# Echoes 4

A controller-first aquarium where recorded swimmers meet new outcomes. Eat smaller fish to grow; larger active swimmers can eat you. There is no hunger in this prototype. Your fish stays 18 pixels in radius while the camera shows a larger world as you grow.

Run `npm run dev:echoes4` from the workspace root, then open http://localhost:4180. Run `npm run check:echoes4` for ESLint, strict JavaScript static analysis, business tests, compiled WASM tests and the browser build.

## Xbox controller

Connect the controller by USB-C and press A while the game page is focused. The page polls the browser's Gamepad API every frame and displays its connection status. Left stick direction steers; stick strength controls swimming speed. A radial 18% dead zone suppresses drift.

| Control | Action |
| --- | --- |
| Left stick | Swim; return to center to stop |
| A | Start or resume |
| Menu | Pause or resume |
| View | Open tuning and pause |
| D-pad up/down | Select a tuning slider |
| D-pad left/right | Adjust the selected slider |
| B | Leave tuning |
| X while paused | Record this dive and begin the next |
| Y | Show or hide upcoming meal connections |

A disconnected active controller pauses the shared timeline. Pointer, touch and WASD/arrow keys are fallbacks when no controller is detected. If the embedded browser does not expose the connected device, open the same localhost URL in Chrome. No USB driver is installed or changed by this project. Button positions follow the [standard browser gamepad layout](https://www.w3.org/TR/gamepad/); browser hardware exposure is described by [MDN](https://developer.mozilla.org/en-US/docs/Web/API/Gamepad_API/Using_the_Gamepad_API).

## Historical rules

- Each dive starts the shared simulation clock at zero. Archived fish born later enter at their original tick, once each.
- Steering inputs replay while movement, mass and collisions are simulated again. Incidental collisions between ghosts are real meals and appear in the new history.
- A ghost continues until an expected meal's original tick. If it has not eaten that prey, it becomes stationary passive food. Earlier valid meals stay valid; eating the required prey early counts.
- A fish whose recorded predator disappears keeps its recorded steering until the recording ends, then becomes passive.
- Passive fish retain earned mass and cannot feed. They still require a sufficiently larger swimmer to eat them. Equal or nearly equal fish pass through; the default required mass ratio is 1.08.
- The current player gets one renewable five-second-delayed self-echo, born at one quarter of the recorded player's mass (half its radius). It is relocated and rotated outside the human viewport, away from overlapping bodies. Consuming this live self-echo allows one replacement. Archived echoes never respawn.
- The next dive replays the latest completed dive's entire revised ecosystem. This preserves one coherent set of identities and meal dependencies. Earlier complete dives remain in the database; independently conflicting game worlds are not combined.

Timed dives build the archive automatically, with a short result animation between them. The first dive is a recording and food-chasing round. Later dives introduce past swimmers and their feeding dependencies. Larger fish are faster but less agile. Tuning changes apply to the next dive.

## Saving

The complete database is stored at `projects/echoes4/data/dives.json`, independently of Echoes 1–3. Use `ECHOES4_DATABASE_PATH` to select another database and `PORT` to select another port.

Every meal, passive transition and birth requests a full snapshot; movement also requests one each second. Writes are serialized with revision checks, an atomic file rename, fsync and a previous-revision `.bak`. Acknowledgments update only revision metadata, so they cannot rewind movement that happened during a write. Save errors pause swimming. A reload restores the saved tick, roster, controls and deterministic spawn state, starting paused. An abrupt process termination can lose movement after the last acknowledged checkpoint.

The archive contains all swimming input changes, motion samples at 10 Hz plus encounter frames, actual event identities/sizes, and the complete live checkpoint. Static passive frames and unchanged controls are compacted. The first prototype has a 64 MiB snapshot limit; the interface supports exporting the whole archive.

## Implementation

The pure fixed-step simulation, collision resolution, recordings, session lifecycle, rendering, gamepad input and storage are separate modules. Radius, mass eligibility and size-dependent speed use compiled AssemblyScript WASM in the browser, with a JavaScript reference for business tests. The timeline pauses when hidden or unfocused and never catches up to wall-clock time.

Regression tests cover delayed dead ends, earlier and incidental meals, rescued prey, passive food, mass conservation, swept collisions, late births, self-echo replacement, deterministic restoration, controller drift/button edges/reconnects, automatic session transitions, complete snapshot persistence and stale writes.
