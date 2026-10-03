import { layoutTree, tipLabel } from "./view-model.js";
/** @typedef {import('../core/types.js').Move} Move */
/** @typedef {{enabled:boolean,onTip:(path:Move)=>void,actor?:1|2,cut?:Move|null,growth?:Move|null}} DrawSettings */
const svgNamespace = "http://www.w3.org/2000/svg";
/** @param {Move} a @param {Move | null | undefined} b */
const same = (a, b) => Boolean(b && a.length === b.length && a.every((value, index) => value === b[index]));
/** @param {Move} a @param {Move | null | undefined} b */
const within = (a, b) => Boolean(b && a.length >= b.length && b.every((value, index) => a[index] === value));

/** @param {HTMLElement} host @param {string} position @param {DrawSettings} settings */
export function drawTree(host, position, settings) {
  const focused = document.activeElement instanceof HTMLElement && host.contains(document.activeElement) ? document.activeElement.dataset.path : null;
  const layout = layoutTree(position);
  const scene = document.createElement("div"); scene.className = "tree-scene";
  scene.style.width = `${layout.width}px`; scene.style.height = `${layout.height}px`;
  scene.dataset.actor = String(settings.actor ?? 1);
  const svg = document.createElementNS(svgNamespace, "svg");
  svg.setAttribute("viewBox", `0 0 ${layout.width} ${layout.height}`); svg.setAttribute("aria-hidden", "true");
  svg.classList.add("tree-branches");
  for (const edge of layout.edges) {
    const from = layout.nodes[edge.from], to = layout.nodes[edge.to];
    const path = document.createElementNS(svgNamespace, "path");
    path.setAttribute("d", `M${from.x},${from.y} C${from.x},${from.y - 34} ${to.x},${to.y + 34} ${to.x},${to.y}`);
    if (within(to.path, settings.growth)) path.classList.add("branch-grown");
    if (same(to.path, settings.cut)) path.classList.add("branch-cut");
    svg.append(path);
  }
  scene.append(svg);
  for (const node of layout.nodes) {
    const playable = node.leaf && node.path.length > 0;
    const target = document.createElement(playable ? "button" : "span");
    target.className = playable ? "tree-tip" : node.path.length ? "tree-joint" : "tree-root";
    target.style.left = `${node.x}px`; target.style.top = `${node.y}px`;
    target.dataset.path = node.path.join(".");
    if (playable) {
      const button = /** @type {HTMLButtonElement} */ (target);
      button.type = "button"; button.disabled = !settings.enabled;
      button.setAttribute("aria-label", tipLabel(node.path)); button.title = tipLabel(node.path);
      const leaf = document.createElement("span"); leaf.className = "tip-shape"; leaf.setAttribute("aria-hidden", "true"); button.append(leaf);
      button.addEventListener("click", () => settings.onTip(node.path));
      button.addEventListener("pointerenter", () => { host.dataset.preview = node.path.length > 1 ? "copy" : "remove"; });
      button.addEventListener("pointerleave", () => { delete host.dataset.preview; });
      button.addEventListener("focus", () => { host.dataset.preview = node.path.length > 1 ? "copy" : "remove"; });
      button.addEventListener("blur", () => { delete host.dataset.preview; });
    } else target.setAttribute("aria-hidden", "true");
    if (same(node.path, settings.cut)) target.classList.add("tip-cut");
    if (within(node.path, settings.growth)) target.classList.add("tip-grown");
    scene.append(target);
  }
  host.replaceChildren(scene);
  if (focused && settings.enabled) {
    const buttons = /** @type {NodeListOf<HTMLButtonElement>} */ (host.querySelectorAll("button"));
    const next = Array.from(buttons).find(button => button.dataset.path === focused) ?? buttons[0];
    next?.focus({ preventScroll: true });
  }
}
