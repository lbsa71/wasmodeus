import { bodyRadius, cameraFor, COLORS, fishAppearance, nearestOffscreen, projectPoint } from './view-model.js';
/** @typedef {import('../core/types.js').World} World */
/** @typedef {import('../core/types.js').Fish} Fish */
/** @typedef {import('./view-model.js').Camera} Camera */

/** @param {HTMLCanvasElement} canvas @param {World} world */
export function viewportFor(canvas, world) {
  const player = world.fish.find(fish => fish.kind === 'player');
  if (!player) return { width: 1000, height: 650 };
  const camera = cameraFor(player, world.config, canvas.clientWidth, canvas.clientHeight);
  return { width: camera.worldWidth, height: camera.worldHeight };
}
/** @param {CanvasRenderingContext2D} ctx @param {Fish} fish @param {Fish} player @param {Camera} camera @param {World} world @param {number} time */
function drawFish(ctx, fish, player, camera, world, time) {
  const point = projectPoint(fish, camera), radius = bodyRadius(fish.mass, world.config) * camera.scale;
  if (point.x < -radius * 2 || point.x > camera.width + radius * 2 || point.y < -radius * 2 || point.y > camera.height + radius * 2) return;
  const appearance = fishAppearance(fish, player.mass, player.id, player.effort);
  const active = fish.state === 'active';
  ctx.save(); ctx.translate(point.x, point.y); ctx.rotate(fish.heading);
  ctx.globalAlpha = active ? 1 : .72;
  ctx.fillStyle = appearance.color;
  const flutter = active ? Math.sin(time * 10 + fish.bornTick) * .18 : 0;
  ctx.beginPath(); ctx.moveTo(-radius * .55, 0); ctx.lineTo(-radius * 1.45, radius * (.5 + flutter));
  ctx.lineTo(-radius * 1.45, -radius * (.5 - flutter)); ctx.closePath(); ctx.fill();
  ctx.beginPath(); ctx.ellipse(0, 0, radius, radius * .64, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#1b5662'; ctx.beginPath(); ctx.arc(radius * .55, -radius * .17, Math.max(1.3, radius * .10), 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#07394750'; ctx.lineWidth = Math.max(1, radius * .06);
  ctx.beginPath(); ctx.moveTo(-radius * .12, -radius * .30); ctx.quadraticCurveTo(radius * .15, 0, -radius * .12, radius * .30); ctx.stroke();
  if (fish.kind === 'player') { ctx.strokeStyle = '#fff0c1'; ctx.lineWidth = 1.3; ctx.beginPath(); ctx.ellipse(0, 0, radius + 4, radius * .64 + 4, 0, 0, Math.PI * 2); ctx.stroke(); }
  ctx.restore();
  if (radius >= 5) {
    ctx.textAlign = 'center'; ctx.font = '11px "Avenir Next", sans-serif'; ctx.fillStyle = appearance.color;
    const label = fish.kind === 'player' ? 'You' : fish.state === 'passive' ? 'Passive' : fish.kind === 'echo' ? 'Your echo' : 'Ghost';
    ctx.fillText(`${label}  ${Number(fish.mass.toFixed(1))}`, point.x, point.y + radius + 16);
  }
}
/** @param {CanvasRenderingContext2D} ctx @param {World} world @param {Camera} camera */
function drawLinks(ctx, world, camera) {
  for (const fish of world.fish) {
    if (fish.state !== 'active' || !fish.expectedMeals.length) continue;
    const meal = fish.expectedMeals[fish.expectedMealIndex];
    const prey = world.fish.find(other => other.id === meal?.preyId && other.state !== 'eaten');
    if (!meal) continue;
    const a = projectPoint(fish, camera);
    const b = prey ? projectPoint(prey, camera) : { x: a.x + 30, y: a.y - 30 };
    ctx.save(); ctx.setLineDash([3, 7]); ctx.lineWidth = 1; ctx.strokeStyle = prey ? '#a3d9cd60' : '#ee918090';
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); ctx.restore();
    ctx.font = '10px sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = prey ? '#a3d9cd' : COLORS.threat;
    const remaining = Math.max(0, (meal.tick - world.tick) / world.config.tickRate);
    ctx.fillText(`${prey ? 'Meal' : 'Missing meal'} in ${remaining.toFixed(1)}s`, (a.x + b.x) / 2, (a.y + b.y) / 2 - 7);
  }
}

/** @param {HTMLCanvasElement} canvas @param {World} world @param {number} nowSeconds @param {{paused?:boolean,showLinks?:boolean,reducedMotion?:boolean}} [options] */
export function drawAquarium(canvas, world, nowSeconds, options = {}) {
  const width = canvas.clientWidth, height = canvas.clientHeight;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) { canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr); }
  const ctx = canvas.getContext('2d'); if (!ctx) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const wash = ctx.createLinearGradient(0, 0, 0, height); wash.addColorStop(0, '#0c5665'); wash.addColorStop(1, '#073947');
  ctx.fillStyle = wash; ctx.fillRect(0, 0, width, height);
  const player = world.fish.find(fish => fish.kind === 'player'); if (!player) return;
  const camera = cameraFor(player, world.config, width, height);
  const time = options.reducedMotion || options.paused ? world.tick / world.config.tickRate : nowSeconds;
  const spacing = Math.max(40, 180 * camera.scale);
  ctx.fillStyle = '#c2ede41a';
  const ox = ((-camera.x * camera.scale) % spacing + spacing) % spacing;
  const oy = ((-camera.y * camera.scale) % spacing + spacing) % spacing;
  for (let x = ox; x < width; x += spacing) for (let y = oy; y < height; y += spacing) {
    ctx.beginPath(); ctx.arc(x, y, 1.5, 0, Math.PI * 2); ctx.fill();
  }
  ctx.strokeStyle = '#8ccbb50d'; ctx.lineWidth = 35;
  for (let i = 0; i < 5; i++) { ctx.beginPath(); ctx.moveTo(width * (i / 5), 0); ctx.lineTo(width * (i / 5) + height * .5, height); ctx.stroke(); }
  if (options.showLinks) drawLinks(ctx, world, camera);
  for (const fish of world.fish) if (fish.state !== 'eaten' && fish.kind !== 'player') drawFish(ctx, fish, player, camera, world, time);
  if (player.state !== 'eaten') drawFish(ctx, player, player, camera, world, time);
  for (let i = world.events.length - 1; i >= 0; i--) {
    const event = world.events[i], age = (world.tick - event.tick) / world.config.tickRate;
    if (age > 1.1) break;
    if (event.type === 'birth') continue;
    const point = projectPoint(event, camera);
    ctx.strokeStyle = event.type === 'passive' ? `rgba(209,231,223,${(1 - age / 1.1) * .7})` : `rgba(255,224,160,${(1 - age / 1.1) * .7})`;
    ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(point.x, point.y, 12 + age * 50, 0, Math.PI * 2); ctx.stroke();
  }
  const nearest = nearestOffscreen(world.fish, player, camera);
  for (const category of /** @type {const} */ (['food','threat'])) {
    const target = nearest[category]; if (!target) continue;
    const p = target.marker;
    ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.angle); ctx.fillStyle = category === 'food' ? COLORS.food : COLORS.threat;
    ctx.beginPath(); ctx.moveTo(8, 0); ctx.lineTo(-5, -5); ctx.lineTo(-5, 5); ctx.closePath(); ctx.fill(); ctx.restore();
    ctx.fillStyle = category === 'food' ? COLORS.food : COLORS.threat; ctx.font = '11px sans-serif'; ctx.textAlign = p.x > width / 2 ? 'right' : 'left';
    ctx.fillText(category === 'food' ? 'Food' : 'Larger fish', p.x + (p.x > width / 2 ? -12 : 12), p.y - 10);
  }
}
