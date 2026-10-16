import assert from "node:assert/strict";
import test from "node:test";
import type { InspectionForm, InspectionQuestion } from "@inspect-hub/types";
import {
  automaticStatus,
  hasValue,
  submissionFor,
  type Draft,
} from "./inspection.ts";

const question: InspectionQuestion = {
  id: "q1",
  label: "Pomiar",
  type: "NUMBER_RANGE",
  isRequired: true,
  range: { min: 0, max: 10 },
};
const form: InspectionForm = {
  id: "f1",
  code: "QC",
  title: "Kontrola",
  version: 1,
  nokStreakThreshold: 3,
  requiresLogin: true,
  allowedStatuses: ["PASS", "FAIL"],
  questions: [question],
  processIds: ["p1"],
  createdAt: "",
  archivedAt: null,
};
function draft(): Draft {
  return {
    id: "123",
    operatorId: "operator1",
    form,
    stationCode: "S1",
    serial: "VIN1",
    routeCheckId: "route1",
    startedAt: 1000,
    answers: { q1: 0 },
    correctedIds: [],
    status: "",
    index: 0,
    summary: true,
  };
}
test("false and zero are real answers; whitespace and non-finite measurements are empty", () => {
  assert.equal(hasValue(false), true);
  assert.equal(hasValue(0), true);
  for (const value of [null, undefined, "", "   ", NaN, Infinity])
    assert.equal(hasValue(value), false);
});
test("range boundaries pass; out-of-range values fail", () => {
  assert.equal(automaticStatus(form, { q1: 0 }), "PASS");
  assert.equal(automaticStatus(form, { q1: 10 }), "PASS");
  assert.equal(automaticStatus(form, { q1: -0.1 }), "FAIL");
  assert.equal(automaticStatus(form, { q1: 10.1 }), "FAIL");
});
test("required manual questions prevent automatic result selection", () => {
  const manual = {
    ...form,
    questions: [
      ...form.questions,
      { ...question, id: "q2", type: "TEXT" as const, range: undefined },
    ],
  };
  assert.equal(automaticStatus(manual, { q1: 5, q2: "opis" }), null);
});
test("unanswered optional criteria do not fail the result", () => {
  const optional = {
    ...form,
    questions: [
      ...form.questions,
      { ...question, id: "q2", isRequired: false, expectedValue: true },
    ],
  };
  assert.equal(automaticStatus(optional, { q1: 5 }), "PASS");
  assert.equal(automaticStatus(optional, { q1: 5, q2: false }), "FAIL");
});
test("missing requirements and absent matching status block submission", () => {
  assert.throws(
    () => submissionFor({ ...draft(), answers: {} }, 2000),
    /wymagane/,
  );
  assert.throws(
    () =>
      submissionFor(
        { ...draft(), form: { ...form, allowedStatuses: ["FAIL"] } },
        2000,
      ),
    /wynik/,
  );
});
test("retry after lost response preserves exact payload, duration and id", () => {
  const original = draft();
  const submission = submissionFor(original, 11000);
  assert.equal(submission.durationSeconds, 10);
  assert.equal(submission.status, "PASS");
  assert.equal(submission.routeCheckId, "route1");
  const frozen = { ...original, submission };
  assert.deepEqual(submissionFor(frozen, 999999), submission);
  assert.deepEqual(
    submissionFor(JSON.parse(JSON.stringify(frozen)) as Draft, 999999),
    submission,
  );
});
test("duration is bounded and optional answers are sent as null", () => {
  const input = {
    ...draft(),
    form: {
      ...form,
      questions: [
        ...form.questions,
        { ...question, id: "q2", isRequired: false },
      ],
    },
  };
  const payload = submissionFor(input, 999999999);
  assert.equal(payload.durationSeconds, 86400);
  assert.equal(payload.answers[1]?.value, null);
});
