import { archiveReplies, continueEncounter, currentGame, startGame } from "./game.js";
/** @typedef {import('./types.js').Database} Database */

/** Revisit the latest human choice that can lead to an actual archived response.
 * A sparse archive still uses the learning echo until a response has been taught.
 * @param {Database} input @returns {Database} */
export function continueAgainstArchive(input) {
  const previous = currentGame(input);
  if (previous.status === "playing") throw new Error("Continue only a finished encounter.");
  const histories = input.games.filter(game => game.status !== "playing");
  const snapshot = { archiveGameIds: histories.map(game => game.id) };
  for (const history of histories.reverse()) {
    for (let i = history.moves.length - 1; i >= 0; i--) {
      const turn = history.moves[i];
      if (turn.actor === "human" && archiveReplies(input, turn.after, snapshot).length > 0) {
        return startGame(input, { initialBoard: turn.before, turnLimit: previous.turnLimit });
      }
    }
  }
  return continueEncounter(input);
}
