export type Actor = 1 | 2;
export interface Cell { owner: 0 | Actor; charge: number }
export interface Board { size: number; cells: Cell[] }
export interface Resolution { board: Board; frames: Board[]; bursts: number[][] }
export interface Source { gameId: string; turnIndex: number; orientation: number }
export interface StartSource { gameId: string; turnIndex: number }
export interface Turn { actor: Actor; move: number | null; before: Board; after: Board; source: Source | null; discovery: boolean }
export interface Game {
  id: string; createdAt: string; endedAt: string | null;
  status: "playing" | "human" | "ghost" | "draw" | "abandoned";
  turn: 0 | Actor; initialBoard: Board; board: Board; turns: Turn[];
  humanTurns: number; limit: number; archiveIds: string[];
  startSource?: StartSource;
}
export interface Database {
  schemaVersion: 1; ruleset: "echoes2-charge-v1"; revision: number;
  createdAt: string; updatedAt: string; games: Game[]; activeGameId: string | null;
}
export interface Reply { move: number; source: Source }
export interface Presentation { actor: Actor; turn: Turn; frames: Board[]; bursts: number[][]; sourceLabel: string }
