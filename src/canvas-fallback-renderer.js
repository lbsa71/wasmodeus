import { lanePosition } from "./lane-geometry.js";
import { createRoadOverviewPixels } from "./road-overview.js";

export class CanvasFallbackRenderer {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {import("./camera.js").Camera} camera
   * @param {import("./simulation-client.js").SimulationClient} simulation
   */
  constructor(canvas, camera, simulation) {
    const context = canvas.getContext("2d", { alpha: false });
    if (!context) {
      throw new Error("Unable to create a compatibility canvas context.");
    }
    this.backendName = "Canvas 2D fallback";
    this.canvas = canvas;
    this.camera = camera;
    this.context = context;
    this.drawnCarCount = 0;
    this.height = 1;
    this.pixelRatio = 1;
    this.simulation = simulation;
    this.width = 1;
    this.overviewCanvas = document.createElement("canvas");
    this.overviewCanvas.width = simulation.gridSize;
    this.overviewCanvas.height = simulation.gridSize;
    const overviewContext = this.overviewCanvas.getContext("2d", {
      alpha: false,
    });
    if (!overviewContext) {
      throw new Error("Unable to create the road overview canvas.");
    }
    const overviewPixels = createRoadOverviewPixels(
      simulation.roadTiles,
      simulation.gridSize,
    );
    const overviewImage = overviewContext.createImageData(
      simulation.gridSize,
      simulation.gridSize,
    );
    overviewImage.data.set(overviewPixels);
    overviewContext.putImageData(overviewImage, 0, 0);
  }

  /** @param {number} width @param {number} height */
  resize(width, height) {
    this.width = width;
    this.height = height;
    this.pixelRatio = Math.min(2, window.devicePixelRatio || 1);
    this.canvas.width = Math.round(width * this.pixelRatio);
    this.canvas.height = Math.round(height * this.pixelRatio);
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;
    this.camera.resize(width, height);
  }

  render() {
    const context = this.context;
    const camera = this.camera;
    const simulation = this.simulation;
    const origin = camera.worldToScreen(0, 0);

    context.setTransform(this.pixelRatio, 0, 0, this.pixelRatio, 0, 0);
    context.fillStyle = "#07110f";
    context.fillRect(0, 0, this.width, this.height);
    context.save();
    context.beginPath();
    context.rect(
      origin.x,
      origin.y,
      simulation.gridSize * camera.zoom,
      simulation.gridSize * camera.zoom,
    );
    context.clip();
    context.translate(origin.x, origin.y);
    context.scale(camera.zoom, camera.zoom);
    context.fillStyle = "#0f211d";
    context.fillRect(0, 0, simulation.gridSize, simulation.gridSize);

    this.#renderTileGrid();
    this.#renderRoadTiles();
    this.#renderCars();
    context.restore();
  }

  #renderTileGrid() {
    if (this.camera.zoom < 4) {
      return;
    }
    const bounds = this.camera.visibleBounds();
    const left = Math.max(0, Math.floor(bounds.left));
    const right = Math.min(this.simulation.gridSize, Math.ceil(bounds.right));
    const top = Math.max(0, Math.floor(bounds.top));
    const bottom = Math.min(this.simulation.gridSize, Math.ceil(bounds.bottom));

    this.context.beginPath();
    for (let x = left; x <= right; x += 1) {
      this.context.moveTo(x, top);
      this.context.lineTo(x, bottom);
    }
    for (let y = top; y <= bottom; y += 1) {
      this.context.moveTo(left, y);
      this.context.lineTo(right, y);
    }
    this.context.strokeStyle = "rgba(126, 184, 151, 0.09)";
    this.context.lineWidth = 1 / this.camera.zoom;
    this.context.stroke();
  }

  #renderRoadTiles() {
    const bounds = this.camera.visibleBounds();
    const gridSize = this.simulation.gridSize;

    if (this.camera.zoom < 2.5) {
      this.context.imageSmoothingEnabled = true;
      this.context.drawImage(this.overviewCanvas, 0, 0, gridSize, gridSize);
      return;
    }

    this.context.beginPath();
    const startX = Math.max(0, Math.floor(bounds.left));
    const endX = Math.min(gridSize - 1, Math.ceil(bounds.right));
    const startY = Math.max(0, Math.floor(bounds.top));
    const endY = Math.min(gridSize - 1, Math.ceil(bounds.bottom));

    for (let y = startY; y <= endY; y += 1) {
      for (let x = startX; x <= endX; x += 1) {
        const tileData = this.simulation.roadTiles[y * gridSize + x];
        const mask = tileData & 15;
        if ((tileData & 16) === 0) {
          this.context.fillStyle = "#04110f";
          this.context.fillRect(x, y, 1, 1);
        }
        const centerX = x + 0.5;
        const centerY = y + 0.5;
        if ((mask & 1) !== 0) {
          this.context.moveTo(centerX, centerY);
          this.context.lineTo(centerX, y);
        }
        if ((mask & 2) !== 0) {
          this.context.moveTo(centerX, centerY);
          this.context.lineTo(x + 1, centerY);
        }
        if ((mask & 4) !== 0) {
          this.context.moveTo(centerX, centerY);
          this.context.lineTo(centerX, y + 1);
        }
        if ((mask & 8) !== 0) {
          this.context.moveTo(centerX, centerY);
          this.context.lineTo(x, centerY);
        }
      }
    }
    this.context.strokeStyle = "#334940";
    this.context.lineCap = "square";
    this.context.lineWidth = Math.max(0.46, 0.6 / this.camera.zoom);
    this.context.stroke();
    if (this.camera.zoom >= 5) {
      this.context.strokeStyle = "rgba(214, 190, 93, 0.72)";
      this.context.lineWidth = Math.max(0.025, 0.7 / this.camera.zoom);
      this.context.setLineDash([0.18, 0.14]);
      this.context.stroke();
      this.context.setLineDash([]);
    }
  }

  #renderCars() {
    const simulation = this.simulation;
    const bounds = this.camera.visibleBounds();
    const stride = Math.max(
      1,
      this.camera.zoom < 1
        ? Math.ceil(simulation.carCount / 10_000)
        : this.camera.zoom < 4
          ? Math.ceil(simulation.carCount / 25_000)
          : 1,
    );
    const carSize = Math.max(0.16, 1.6 / this.camera.zoom);
    let visibleCars = 0;

    this.context.beginPath();
    for (let index = 0; index < simulation.carCount; index += stride) {
      const centerX = simulation.x[index];
      const centerY = simulation.y[index];
      const lane = lanePosition(
        centerX,
        centerY,
        simulation.directions[index],
        0.11,
      );
      const { x, y } = lane;
      if (
        x < bounds.left ||
        x > bounds.right ||
        y < bounds.top ||
        y > bounds.bottom
      ) {
        continue;
      }
      this.context.rect(
        x - carSize / 2,
        y - carSize / 2,
        carSize,
        carSize,
      );
      visibleCars += 1;
    }
    this.context.fillStyle = "#f4b942";
    this.context.fill();
    this.drawnCarCount = visibleCars;
  }
}
