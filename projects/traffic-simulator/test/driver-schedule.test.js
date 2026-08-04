import assert from "node:assert/strict";
import test from "node:test";

import {
  crossedMinute,
  formatClock,
  isWithinShift,
  scheduleForPercentile,
} from "../src/driver-schedule.js";

test("driver schedules follow the 80/10/10 shift split", () => {
  assert.deepEqual(scheduleForPercentile(0), {
    endMinute: 17 * 60,
    name: "Day",
    startMinute: 9 * 60,
  });
  assert.equal(scheduleForPercentile(79).name, "Day");
  assert.deepEqual(scheduleForPercentile(80), {
    endMinute: 60,
    name: "Evening",
    startMinute: 17 * 60,
  });
  assert.equal(scheduleForPercentile(89).name, "Evening");
  assert.deepEqual(scheduleForPercentile(90), {
    endMinute: 9 * 60,
    name: "Night",
    startMinute: 60,
  });
  assert.equal(scheduleForPercentile(99).name, "Night");
});

test("overnight shifts and clock crossings wrap at midnight", () => {
  assert.equal(isWithinShift(23 * 60, 17 * 60, 60), true);
  assert.equal(isWithinShift(30, 17 * 60, 60), true);
  assert.equal(isWithinShift(2 * 60, 17 * 60, 60), false);
  assert.equal(crossedMinute(1_439.5, 0.5, 0), true);
  assert.equal(crossedMinute(500, 501, 0), false);
});

test("the 24-hour clock is formatted without losing midnight", () => {
  assert.equal(formatClock(0), "00:00");
  assert.equal(formatClock(8 * 60 + 7), "08:07");
  assert.equal(formatClock(23 * 60 + 59.9), "23:59");
  assert.equal(formatClock(1_440), "00:00");
});
