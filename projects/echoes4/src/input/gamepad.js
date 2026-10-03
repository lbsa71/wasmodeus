/** @typedef {{id:string,index:number,connected:boolean,mapping:string,axes:readonly number[],buttons:readonly {pressed:boolean,value:number}[]}} Pad */
/** @param {number} x @param {number} y @param {number} [deadZone] */
export function stickVector(x, y, deadZone = .18) {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return { x: 0, y: 0 };
  const length = Math.hypot(x, y);
  if (length <= deadZone) return { x: 0, y: 0 };
  const strength = Math.min(1, (length - deadZone) / (1 - deadZone));
  return { x: x / length * strength, y: y / length * strength };
}
const BUTTONS = /** @type {const} */ ({ 0: 'confirm', 1: 'back', 2: 'bank', 3: 'links', 8: 'tuning', 9: 'pause', 12: 'up', 13: 'down', 14: 'left', 15: 'right' });

export class GamepadReader {
  /** @type {number|null} */ index = null;
  /** @type {boolean[]} */ previous = [];
  /** @param {readonly (Pad|null)[]} pads */
  poll(pads) {
    const compatible = pads.filter(pad => pad?.connected && (pad.mapping === 'standard' || /xbox|xinput|microsoft|045e/i.test(pad.id)));
    const pad = compatible.find(pad => pad?.index === this.index) ?? compatible[0];
    if (!pad) {
      const lost = this.index !== null; this.index = null; this.previous = [];
      return { connected: false, lost, label: '', mapping: '', direction: { x: 0, y: 0 }, actions: /** @type {string[]} */ ([]) };
    }
    if (pad.index !== this.index) this.previous = [];
    this.index = pad.index;
    /** @type {string[]} */ const actions = [];
    for (const [key, action] of Object.entries(BUTTONS)) {
      const index = Number(key), pressed = Boolean(pad.buttons[index]?.pressed || pad.buttons[index]?.value > .5);
      if (pressed && !this.previous[index]) actions.push(action);
    }
    this.previous = pad.buttons.map(button => button.pressed || button.value > .5);
    return { connected: true, lost: false, label: pad.id, mapping: pad.mapping, direction: stickVector(pad.axes[0] ?? 0, pad.axes[1] ?? 0), actions };
  }
}
