export type Tree = Tree[];
export type Position = string;
export type Move = number[];
export type Actor = 1 | 2;
export interface Resolution { position: Position; regrown: boolean; beforePieces: number; afterPieces: number }
export interface Source { gameId: string; turnIndex: number }
export interface Turn { actor: Actor; move: Move | null; before: Position; after: Position; source: Source | null; discovery: boolean }
export interface Game {
  id: string; createdAt: string; endedAt: string | null;
  status: "playing" | "human" | "ghost" | "abandoned";
  turn: 0 | Actor; initialPosition: Position; position: Position; turns: Turn[];
  archiveIds: string[]; startSource?: Source;
}
export interface Database {
  schemaVersion: 1; ruleset: "echoes3-v1"; revision: number;
  createdAt: string; updatedAt: string; games: Game[]; activeGameId: string | null;
}
export interface Reply { move: Move; after: Position; source: Source; wins: number; losses: number }
export interface Presentation { actor: Actor; turn: Turn; resolution: Resolution }
