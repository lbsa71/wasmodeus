const DEADZONE = 0.15;

/** @param {number} stickY @param {number} [deadzone] */
export function radialIntent(stickY, deadzone = DEADZONE) {
  if (!Number.isFinite(stickY) || Math.abs(stickY) <= deadzone) return 0;
  return stickY < 0 ? 1 : -1;
}

/** @param {ReadonlySet<string>} keys */
export function keyboardControls(keys) {
  return { radial: Number(keys.has("ArrowUp") || keys.has("KeyW")) - Number(keys.has("ArrowDown") || keys.has("KeyS")) };
}

export class PilotInput {
  constructor() {
    /** @type {Set<string>} */
    this.keys = new Set();
    this.onKeyDown = (/** @type {KeyboardEvent} */ event) => {
      if (isPilotKey(event.code)) event.preventDefault();
      if (!this.keys.has(event.code)) {
        if (event.code === "KeyQ") this.switchIntent = -1;
        if (event.code === "KeyE") this.switchIntent = 1;
        if (event.code === "Space") this.fireRequested = true;
      }
      this.keys.add(event.code);
    };
    this.onKeyUp = (/** @type {KeyboardEvent} */ event) => { this.keys.delete(event.code); };
    this.switchIntent = 0;
    this.fireRequested = false;
    this.previousLeftShoulder = false;
    this.previousRightShoulder = false;
    this.previousPrimaryButton = false;
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
  }

  sample() {
    const gamepad = navigator.getGamepads?.().find((candidate) => candidate?.connected && candidate.axes.length >= 2);
    const gamepadRadial = gamepad ? radialIntent(gamepad.axes[1] ?? 0) : 0;
    const keyboard = keyboardControls(this.keys);
    const leftShoulder = Boolean(gamepad?.buttons[4]?.pressed);
    const rightShoulder = Boolean(gamepad?.buttons[5]?.pressed);
    const primaryButton = Boolean(gamepad?.buttons[0]?.pressed);
    if (!this.previousLeftShoulder && leftShoulder) this.switchIntent = -1;
    if (!this.previousRightShoulder && rightShoulder) this.switchIntent = 1;
    if (!this.previousPrimaryButton && primaryButton) this.fireRequested = true;
    this.previousLeftShoulder = leftShoulder;
    this.previousRightShoulder = rightShoulder;
    this.previousPrimaryButton = primaryButton;
    const result = { radial: gamepadRadial === 0 ? keyboard.radial : gamepadRadial, switch: this.switchIntent, fire: this.fireRequested };
    this.switchIntent = 0;
    this.fireRequested = false;
    return result;
  }

  dispose() {
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
  }
}

/** @param {string} code */
function isPilotKey(code) { return code === "ArrowUp" || code === "ArrowDown" || code === "KeyW" || code === "KeyS" || code === "KeyQ" || code === "KeyE" || code === "Space"; }
