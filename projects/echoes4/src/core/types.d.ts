export interface Vector { x: number; y: number }
export interface Viewport { width: number; height: number }
export interface Config {
  tickRate: number; baseRadius: number; startMass: number; baseSpeed: number;
  turnRate: number; durationSeconds: number; echoDelaySeconds: number;
  growthEfficiency: number; speedExponent: number; turnExponent: number;
  eatRatio: number; spawnPadding: number;
}
export type FishKind = 'player' | 'ghost' | 'echo';
export type FishState = 'active' | 'passive' | 'eaten';
export interface Pose extends Vector { heading: number; mass: number }
export interface Frame extends Pose { tick: number }
export interface Control extends Vector { tick: number }
export interface FishTrack {
  id: string; kind: FishKind; bornTick: number; initial: Pose;
  controls: Control[]; frames: Frame[]; endTick: number;
}
export interface GameEvent {
  id: string; tick: number; type: 'eat' | 'passive' | 'birth'; actorId: string;
  preyId?: string; x: number; y: number; reason?: string; mass?: number;
  eaterMass?: number; preyMass?: number;
}
export interface Run {
  id: string; startedAt: string; finishedAt: string; reason: string;
  durationTicks: number; config: Config; tracks: FishTrack[]; events: GameEvent[];
}
export interface Fish extends Pose {
  effort?: number;
  id: string; kind: FishKind; state: FishState; bornTick: number;
  source?: { trackId: string; mode: 'archive' | 'delay'; delayTicks?: number; rotation?: number };
  controlIndex: number; expectedMeals: GameEvent[]; expectedMealIndex: number;
}
export interface World {
  id: string; tick: number; status: 'playing' | 'eaten' | 'complete';
  config: Config; seed: number; startedAt: string; fish: Fish[]; events: GameEvent[];
  source: Run | null; recording: { tracks: FishTrack[] };
  nextEcho: number; nextEchoTick: number;
}
export interface Database {
  version: 1; revision: number; updatedAt: string; config: Config;
  runs: Run[]; active: World | null;
}
export interface MathPort {
  radius(mass: number, baseRadius: number, startMass: number): number;
  speed(mass: number, startMass: number, baseSpeed: number, exponent: number): number;
  canEat(eaterMass: number, preyMass: number, ratio: number): boolean;
  touches(ax: number, ay: number, ar: number, bx: number, by: number, br: number): boolean;
}
