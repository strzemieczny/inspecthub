import assert from "node:assert/strict";
import test from "node:test";
import { currentShift } from "./shift.ts";

test("shifts switch at 06:15, 14:15 and 22:15 Polish time", () => {
  for (const [instant, number, start] of [
    ["2026-10-21T04:14:59Z", 3, "2026-10-20T20:15:00.000Z"],
    ["2026-10-21T04:15:00Z", 1, "2026-10-21T04:15:00.000Z"],
    ["2026-10-21T12:14:59Z", 1, "2026-10-21T04:15:00.000Z"],
    ["2026-10-21T12:15:00Z", 2, "2026-10-21T12:15:00.000Z"],
    ["2026-10-21T20:15:00Z", 3, "2026-10-21T20:15:00.000Z"],
    ["2026-10-22T00:00:00Z", 3, "2026-10-21T20:15:00.000Z"],
    ["2027-01-01T01:00:00Z", 3, "2026-12-31T21:15:00.000Z"],
  ] as const) {
    const shift = currentShift(new Date(instant));
    assert.equal(shift.number, number, instant);
    assert.equal(shift.from.toISOString(), start, instant);
    assert.ok(shift.from <= new Date(instant) && new Date(instant) < shift.to);
  }
});

test("night shifts retain their wall-clock boundaries across DST", () => {
  for (const [instant, from, to, hours] of [
    [
      "2026-03-29T01:30:00Z",
      "2026-03-28T21:15:00.000Z",
      "2026-03-29T04:15:00.000Z",
      7,
    ],
    [
      "2026-10-25T01:30:00Z",
      "2026-10-24T20:15:00.000Z",
      "2026-10-25T05:15:00.000Z",
      9,
    ],
  ] as const) {
    const shift = currentShift(new Date(instant));
    assert.equal(shift.from.toISOString(), from);
    assert.equal(shift.to.toISOString(), to);
    assert.equal(
      (shift.to.getTime() - shift.from.getTime()) / 3_600_000,
      hours,
    );
  }
});
