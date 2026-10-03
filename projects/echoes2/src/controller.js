import { currentGame, startEncounter, humanMove, advanceGhost } from "./core/game.js";
import { applyMove } from "./core/rules.js";
/** @typedef {import('./core/types.js').Database} Database */
/** @typedef {import('./core/types.js').Board} Board */
/** @typedef {import('./core/types.js').Turn} Turn */
/** @typedef {import('./core/types.js').Actor} Actor */
/** @typedef {import('./core/types.js').Presentation} Presentation */
/** @typedef {{load:()=>Promise<Database>,save:(db:Database)=>Promise<Database>}} Storage */
/** @typedef {{applyMove:(board:Board,index:number,actor:Actor)=>import('./core/types.js').Resolution}} Engine */

export class GameController {
  /** @param {Storage} storage @param {()=>void} [onChange] @param {(p:Presentation)=>Promise<void>} [present] @param {Engine | null} [engine] */
  constructor(storage,onChange=()=>{},present=async()=>{},engine=null) {
    this.storage=storage;this.onChange=onChange;this.present=present;this.engine=engine;this.busy=false;
    /** @type {Database | null} */ this.database=null;
    /** @type {Presentation | null} */ this.presentation=null;
  }
  async load() {
    if(this.busy)return;this.busy=true;this.onChange();
    try {
      const db=await this.storage.load();
      this.database=db.activeGameId ? db : await this.storage.save(startEncounter(db));
      if(currentGame(this.database).turn===2)await this.resolveGhost();
    } finally {this.busy=false;this.onChange();}
  }
  /** @param {Turn} turn */
  resolution(turn) {
    if(turn.move===null)throw new Error("A pass has no cascade.");
    const result=this.engine ? this.engine.applyMove(turn.before,turn.move,turn.actor) : applyMove(turn.before,turn.move,turn.actor);
    if(result.board.size!==turn.after.size || result.board.cells.length!==turn.after.cells.length || result.board.cells.some((cell,i)=>cell.owner!==turn.after.cells[i].owner || cell.charge!==turn.after.cells[i].charge))throw new Error("The cascade engines disagree; reload saved progress.");
    return result;
  }
  /** @param {Turn} turn @param {import('./core/types.js').Resolution} result */
  async showTurn(turn,result) {
    const db=/** @type {Database} */(this.database);
    const sourceIndex=turn.source ? db.games.findIndex(g=>g.id===turn.source?.gameId) : -1;
    const sourceLabel=turn.actor===1 ? "Your charge" : `Remembered from match ${sourceIndex+1}, turn ${(turn.source?.turnIndex ?? 0)+1}`;
    this.presentation={actor:turn.actor,turn,frames:result.frames,bursts:result.bursts,sourceLabel};
    this.onChange();
    try {await this.present(this.presentation);}
    finally {this.presentation=null;this.onChange();}
  }
  async resolveGhost() {
    const next=advanceGhost(/** @type {Database} */(this.database));
    const turn=/** @type {Turn} */(currentGame(next).turns.at(-1));
    const result=turn.move===null ? null : this.resolution(turn);
    this.database=await this.storage.save(next);
    if(result)await this.showTurn(turn,result);else this.onChange();
  }
  /** @param {number} index */
  async play(index) {
    if(this.busy||!this.database)return;this.busy=true;this.onChange();
    try {
      const next=humanMove(this.database,index);
      const turn=/** @type {Turn} */(currentGame(next).turns.at(-1));
      const result=this.resolution(turn);
      this.database=await this.storage.save(next);
      await this.showTurn(turn,result);
      if(currentGame(this.database).turn===2)await this.resolveGhost();
    } finally {this.busy=false;this.onChange();}
  }
  async nextGame() {
    if(this.busy||!this.database)return;this.busy=true;this.onChange();
    try {this.database=await this.storage.save(startEncounter(this.database));}
    finally {this.busy=false;this.onChange();}
  }
  async replayGhost() {
    if(this.busy||!this.database)return;
    const turn=currentGame(this.database).turns.at(-1);
    if(!turn||turn.actor!==2||turn.move===null)return;
    this.busy=true;this.onChange();
    try {await this.showTurn(turn,this.resolution(turn));}
    finally {this.busy=false;this.onChange();}
  }
}
