const SECONDS_PER_DAY = 86_400;

/** @param {{ epochDays: bigint, secondsOfDay: number }} time @param {number} deltaSeconds */
export function addSimulationSeconds(time, deltaSeconds) {
  const totalSeconds = time.secondsOfDay + deltaSeconds;
  const wholeDays = Math.floor(totalSeconds / SECONDS_PER_DAY);
  return { epochDays: time.epochDays + BigInt(wholeDays), secondsOfDay: totalSeconds - (wholeDays * SECONDS_PER_DAY) };
}
