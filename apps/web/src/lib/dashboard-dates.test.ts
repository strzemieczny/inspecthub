/// <reference types="node" />
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  dashboardDate,
  dashboardQuery,
  validDashboardRange,
} from "./dashboard-dates.ts";

test("quick ranges keep the local date at midnight and across month boundaries", () => {
  const previous = process.env.TZ;
  try {
    for (const zone of ["Europe/Warsaw", "America/New_York", "Asia/Tokyo"]) {
      process.env.TZ = zone;
      assert.equal(
        dashboardDate(0, new Date(2026, 9, 20, 0, 15)),
        "2026-10-20",
      );
      assert.equal(
        dashboardDate(6, new Date(2026, 9, 20, 23, 45)),
        "2026-10-14",
      );
      assert.equal(dashboardDate(6, new Date(2026, 0, 3)), "2025-12-28");
    }
  } finally {
    if (previous === undefined) delete process.env.TZ;
    else process.env.TZ = previous;
  }
});

test("queries include the entire selected day, including daylight saving changes", () => {
  const previous = process.env.TZ;
  process.env.TZ = "Europe/Warsaw";
  try {
    for (const [date, from, to] of [
      ["2026-10-20", "2026-10-19T22:00:00.000Z", "2026-10-20T21:59:59.999Z"],
      ["2026-03-29", "2026-03-28T23:00:00.000Z", "2026-03-29T21:59:59.999Z"],
      ["2026-10-25", "2026-10-24T22:00:00.000Z", "2026-10-25T22:59:59.999Z"],
    ]) {
      const query = dashboardQuery({ from: date, to: date });
      assert.equal(query.get("from"), from);
      assert.equal(query.get("to"), to);
      assert.equal(query.get("timeZone"), "Europe/Warsaw");
    }
  } finally {
    if (previous === undefined) delete process.env.TZ;
    else process.env.TZ = previous;
  }
});

test("empty, impossible and reversed dates cannot be applied", () => {
  for (const [from, to] of [
    ["", "2026-10-20"],
    ["2026-10-20", ""],
    ["2026-02-30", "2026-03-01"],
    ["2026-10-21", "2026-10-20"],
  ]) {
    assert.equal(validDashboardRange(from, to), false);
    assert.throws(() => dashboardQuery({ from, to }));
  }
  assert.equal(validDashboardRange("2026-10-20", "2026-10-20"), true);
});
