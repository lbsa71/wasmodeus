const VIEW_RADIUS = 300;

export function createOrbitCamera() {
  return { x: 0, y: 0, rotation: 0, viewRadius: VIEW_RADIUS };
}

/** @param {{x: number, y: number, rotation: number, viewRadius: number}} camera @param {{x: number, y: number, heading?: number}} ship */
export function advanceOrbitCamera(camera, ship) {
  return {
    x: ship.x,
    y: ship.y,
    rotation: ship.heading ?? camera.rotation,
    viewRadius: camera.viewRadius,
  };
}
