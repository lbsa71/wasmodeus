export const MIN_TIME_SCALE = 0.01;
export const SECONDS_PER_YEAR = 31_557_600;
export const MAX_TIME_SCALE = SECONDS_PER_YEAR * 1_000_000;

/** @param {number} sliderValue */
export function timeScaleFromSlider(sliderValue) {
  const normalized = Math.max(0, Math.min(1, sliderValue / 1_000));
  return MIN_TIME_SCALE * ((MAX_TIME_SCALE / MIN_TIME_SCALE) ** normalized);
}

/** @param {number} timeScale */
export function sliderFromTimeScale(timeScale) {
  const normalized = Math.log(timeScale / MIN_TIME_SCALE) / Math.log(MAX_TIME_SCALE / MIN_TIME_SCALE);
  return Math.round(Math.max(0, Math.min(1, normalized)) * 1_000);
}

/** @param {number} timeScale */
export function formatTimeScale(timeScale) {
  /** @type {Array<[number, string]>} */ const units = [[SECONDS_PER_YEAR * 1_000_000, "Myr"], [SECONDS_PER_YEAR * 1_000, "kyr"], [SECONDS_PER_YEAR, "yr"], [86_400, "day"], [3_600, "hour"], [60, "min"]];
  for (const [seconds, label] of units) {
    if (timeScale >= seconds) return `${formatRate(timeScale / seconds)} ${label}/s`;
  }
  return `${formatRate(timeScale)} s/s`;
}

/** @param {number} rate */
function formatRate(rate) {
  if (rate >= 100) return rate.toFixed(0);
  if (rate >= 10) return rate.toFixed(1);
  return rate.toFixed(rate >= 1 ? 2 : 3).replace(/0+$/, "").replace(/\.$/, "");
}
