/** @typedef {{id:string,mass:number,state:string,effort?:number,bornTick:number}} Swimmer */
/** @template {Swimmer} T @param {T} a @param {T} b @returns {T|null} */
export function predatorFor(a, b) {
  if (a.state === 'eaten' || b.state === 'eaten' || (a.state !== 'active' && b.state !== 'active')) return null;
  if (a.state !== 'active') return b.mass >= a.mass ? b : null;
  if (b.state !== 'active') return a.mass >= b.mass ? a : null;
  if (a.mass !== b.mass) return a.mass > b.mass ? a : b;
  if ((a.effort ?? 0) !== (b.effort ?? 0)) return (a.effort ?? 0) > (b.effort ?? 0) ? a : b;
  return a.id < b.id ? a : b;
}
