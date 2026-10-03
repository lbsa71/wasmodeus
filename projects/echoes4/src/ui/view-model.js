import { predatorFor } from '../core/dominance.js';
/** @typedef {{id:string, name?:string, kind:string, state:string, x:number, y:number, heading:number, mass:number, bornTick:number,effort?:number}} Fish */
/** @typedef {{startMass:number, baseRadius:number, tickRate?:number}} ViewConfig */
/** @typedef {{x:number,y:number,width:number,height:number,radius:number,scale:number,worldWidth:number,worldHeight:number}} Camera */

export const PLAYER_RADIUS = 18;
export const COLORS = Object.freeze({ player: "#ffe0a0", threat: "#ee9180", food: "#83d5c9", echo: "#c7b9ef", passive: "#d1e7df", peer: "#aacfd4" });

/** @param {number} mass @param {ViewConfig} config */
export function bodyRadius(mass, config) {
  return config.baseRadius * Math.sqrt(Math.max(0.001, mass) / config.startMass);
}

/** @param {Fish} player @param {ViewConfig} config @param {number} width @param {number} height @returns {Camera} */
export function cameraFor(player, config, width, height) {
  const radius = bodyRadius(player.mass, config);
  const scale = PLAYER_RADIUS / radius;
  return { x: player.x, y: player.y, width, height, radius, scale, worldWidth: width / scale, worldHeight: height / scale };
}

/** @param {{x:number,y:number}} point @param {Camera} camera */
export function projectPoint(point, camera) {
  return { x: (point.x - camera.x) * camera.scale + camera.width / 2, y: (point.y - camera.y) * camera.scale + camera.height / 2 };
}

/** @param {Fish} fish @param {number} playerMass @param {string} [playerId] @param {number} [playerEffort] */
export function fishAppearance(fish, playerMass, playerId = 'you', playerEffort = 0) {
  const player = { ...fish, id: playerId, mass: playerMass, state: 'active', effort: playerEffort };
  const winner = predatorFor(fish, player);
  const edible = winner === player;
  if (fish.kind === "player") return { color: COLORS.player, role: "player", edible: false };
  if (fish.state === "passive") return { color: COLORS.passive, role: "passive", edible };
  if (winner === fish) return { color: COLORS.threat, role: "threat", edible: false };
  if (fish.kind === "echo") return { color: COLORS.echo, role: "echo", edible };
  return { color: edible ? COLORS.food : COLORS.peer, role: edible ? "food" : "peer", edible };
}

/** @param {{x:number,y:number}} point @param {Camera} camera @param {number} padding */
export function edgeIndicator(point, camera, padding = 34) {
  if (point.x >= 0 && point.x <= camera.width && point.y >= 0 && point.y <= camera.height) return null;
  const dx = point.x - camera.width / 2;
  const dy = point.y - camera.height / 2;
  const boundX = Math.max(1, camera.width / 2 - padding);
  const boundY = Math.max(1, camera.height / 2 - padding);
  const factor = Math.min(boundX / Math.max(0.001, Math.abs(dx)), boundY / Math.max(0.001, Math.abs(dy)));
  return { x: camera.width / 2 + dx * factor, y: camera.height / 2 + dy * factor, angle: Math.atan2(dy, dx) };
}

/** @param {Fish[]} fish @param {Fish} player @param {Camera} camera */
export function nearestOffscreen(fish, player, camera) {
  /** @type {{food:null|{fish:Fish,distance:number,marker:{x:number,y:number,angle:number}},threat:null|{fish:Fish,distance:number,marker:{x:number,y:number,angle:number}}}} */
  const nearest = { food: null, threat: null };
  for (const swimmer of fish) {
    if (swimmer.id === player.id || swimmer.state === "eaten") continue;
    const appearance = fishAppearance(swimmer, player.mass, player.id, player.effort);
    const category = appearance.role === "threat" ? "threat" : appearance.edible ? "food" : null;
    if (!category) continue;
    const marker = edgeIndicator(projectPoint(swimmer, camera), camera);
    if (!marker) continue;
    const distance = Math.hypot(swimmer.x - player.x, swimmer.y - player.y);
    if (!nearest[category] || distance < nearest[category].distance) nearest[category] = { fish: swimmer, distance, marker };
  }
  return nearest;
}
