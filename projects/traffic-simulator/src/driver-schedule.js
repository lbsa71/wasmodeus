const DAY_MINUTES = 24 * 60;

const SCHEDULES = [
  { endMinute: 17 * 60, name: "Day", startMinute: 9 * 60 },
  { endMinute: 60, name: "Evening", startMinute: 17 * 60 },
  { endMinute: 9 * 60, name: "Night", startMinute: 60 },
];

/** @param {number} minute */
function wrapMinute(minute) {
  return ((minute % DAY_MINUTES) + DAY_MINUTES) % DAY_MINUTES;
}

/**
 * @param {number} percentile Integer in the inclusive 0–99 range.
 * @returns {{ endMinute: number, name: string, startMinute: number }}
 */
export function scheduleForPercentile(percentile) {
  if (percentile < 80) return SCHEDULES[0];
  if (percentile < 90) return SCHEDULES[1];
  return SCHEDULES[2];
}

/**
 * @param {number} minute
 * @param {number} startMinute
 * @param {number} endMinute
 */
export function isWithinShift(minute, startMinute, endMinute) {
  const current = wrapMinute(minute);
  if (startMinute < endMinute) {
    return current >= startMinute && current < endMinute;
  }
  return current >= startMinute || current < endMinute;
}

/**
 * @param {number} previous
 * @param {number} current
 * @param {number} target
 */
export function crossedMinute(previous, current, target) {
  const before = wrapMinute(previous);
  const after = wrapMinute(current);
  const event = wrapMinute(target);
  return before <= after
    ? event > before && event <= after
    : event > before || event <= after;
}

/** @param {number} minute */
export function formatClock(minute) {
  const wrapped = Math.floor(wrapMinute(minute));
  const hours = Math.floor(wrapped / 60);
  const minutes = wrapped % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}
