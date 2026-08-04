/** `mat4x4f` (64) + point size (4) + camera-rebase vec2 (8) + padding (4). */
export const CAMERA_UNIFORM_BYTES = 96;
/** WGSL aligns `rebase_xy: vec2f` to 8 bytes after `point_size`. */
export const CAMERA_REBASE_X_FLOAT_INDEX = 18;
