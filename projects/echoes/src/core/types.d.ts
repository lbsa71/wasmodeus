export type Side = "human" | "ghost";
export type ContestStart = { kind: "default" } | { kind: "history"; gameId: string; step: number };
export interface Contest { owners: Side[]; winner: Side | null; discoveries: number[]; endReason: "line" | "limit" | null; start?: ContestStart }
export interface Point { x: number; y: number }
export interface Board { stones: Point[]; resting: Point }
export interface Move { from: Point; to: Point }
export interface Transform { orientation: number; dx: number; dy: number }
export interface Source { gameId: string; moveIndex: number; transform: Transform }
export interface Turn { actor: "human" | "ghost"; before: Board; after: Board; move: Move; source: Source | null }
export interface Game {
  id: string; createdAt: string; endedAt: string | null;
  status: "playing" | "won" | "held" | "abandoned";
  turn: "human" | "ghost" | "finished";
  contest?: Contest; initialBoard?: Board; openingSource?: Source; handoffs?: number[];
  board: Board; moves: Turn[]; humanTurns: number; turnLimit: number; archiveGameIds: string[];
}
export interface Database {
  schemaVersion: 1; ruleset: string; revision: number; createdAt: string; updatedAt: string;
  games: Game[]; activeGameId: string | null;
}
export interface Reply { move: Move; source: Source }
export interface GhostPresentation { turn: Turn; original: Turn; kind: "reply" | "learning"; replyCount: number; intent?: string; owners?: Side[] }
export interface RulesExports { clear: () => void; putStone: (index: number, x: number, y: number) => void; setResting: (index: number) => void; canMove: (index: number, x: number, y: number) => number }
