/** @param {number[]} snapshotOriginParsecs @param {number[]} cameraPositionParsecs */
export function cameraDeltaParsecs(snapshotOriginParsecs, cameraPositionParsecs) {
  return [
    cameraPositionParsecs[0] - snapshotOriginParsecs[0],
    cameraPositionParsecs[1] - snapshotOriginParsecs[1],
    cameraPositionParsecs[2] - snapshotOriginParsecs[2],
  ];
}

/** @param {number[]} snapshotPositionParsecs @param {number[]} snapshotOriginParsecs */
export function worldPositionFromSnapshot(snapshotPositionParsecs, snapshotOriginParsecs) {
  return [
    snapshotOriginParsecs[0] + snapshotPositionParsecs[0],
    snapshotOriginParsecs[1] + snapshotPositionParsecs[1],
    snapshotOriginParsecs[2] + snapshotPositionParsecs[2],
  ];
}
