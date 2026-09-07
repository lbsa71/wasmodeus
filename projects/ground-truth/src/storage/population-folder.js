/**
 * A folder on disk the app writes populations into, so they can be committed
 * and shared.
 *
 * Chromium's File System Access API lets a page keep a handle to a folder the
 * user picked once, and write files into it from then on without another
 * dialog. The handle survives a reload in the browser's database, but its
 * permission does not: after a reload the browser wants a click before it will
 * let the page write again, so there is a "resume" step that has to come from
 * a user gesture. Browsers without the API get a download instead.
 */

/**
 * @typedef {{
 *   loadHandle(): Promise<FileSystemDirectoryHandle|undefined>,
 *   saveHandle(handle: FileSystemDirectoryHandle): Promise<void>,
 *   clearHandle(): Promise<void>
 * }} HandleStore
 */

export class PopulationFolder {
  /** @param {HandleStore} store where the handle is kept between visits */
  constructor(store) {
    this.store = store;
    /** @type {FileSystemDirectoryHandle|null} a folder we may write to now */
    this.handle = null;
    /** @type {FileSystemDirectoryHandle|null} a remembered folder awaiting a click */
    this.pending = null;
  }

  /** Whether this browser can write to a folder at all. */
  static get supported() {
    return typeof window !== "undefined" && typeof window.showDirectoryPicker === "function";
  }

  /** The folder's name, for the button label; null when none is chosen. */
  get name() {
    return (this.handle ?? this.pending)?.name ?? null;
  }

  /** Whether writes will go through right now. */
  get writable() {
    return this.handle !== null;
  }

  /**
   * Asks the user for a folder. Must come from a click.
   *
   * @returns {Promise<string>} the folder's name
   */
  async pick() {
    if (!window.showDirectoryPicker) throw new Error("This browser cannot write to a folder.");
    const handle = await window.showDirectoryPicker({ id: "ground-truth-populations", mode: "readwrite" });
    this.handle = handle;
    this.pending = null;
    await this.store.saveHandle(handle);
    return handle.name;
  }

  /**
   * Brings back the folder chosen on an earlier visit. Writable straight away
   * only if the browser still grants it; otherwise it is remembered as pending
   * and {@link resume} needs a click.
   *
   * @returns {Promise<boolean>} whether writes will go through without a click
   */
  async restore() {
    const handle = await this.store.loadHandle();
    if (!handle) return false;
    const state = await handle.queryPermission?.({ mode: "readwrite" });
    if (state === "granted") {
      this.handle = handle;
      return true;
    }
    this.pending = handle;
    return false;
  }

  /**
   * Re-asks permission for the remembered folder. Must come from a click.
   *
   * @returns {Promise<boolean>}
   */
  async resume() {
    if (!this.pending) return false;
    const state = await this.pending.requestPermission?.({ mode: "readwrite" });
    if (state !== "granted") return false;
    this.handle = this.pending;
    this.pending = null;
    return true;
  }

  /**
   * @param {string} name
   * @param {ArrayBuffer} bytes
   */
  async write(name, bytes) {
    if (!this.handle) throw new Error("No folder to write to.");
    const file = await this.handle.getFileHandle(name, { create: true });
    const stream = await file.createWritable();
    await stream.write(bytes);
    await stream.close();
  }

  async forget() {
    this.handle = null;
    this.pending = null;
    await this.store.clearHandle();
  }
}

/**
 * The fallback for browsers without a folder: hand the file to the user.
 *
 * @param {string} name
 * @param {ArrayBuffer} bytes
 */
export function downloadFile(name, bytes) {
  const url = URL.createObjectURL(new Blob([bytes], { type: "application/octet-stream" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
