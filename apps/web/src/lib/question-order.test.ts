import assert from "node:assert/strict";
import { test } from "node:test";
import type { InspectionQuestion } from "@inspect-hub/types";
import { moveQuestion } from "./question-order.ts";

const questions: InspectionQuestion[] = [
  {
    id: "a",
    label: "Mocowanie",
    type: "CHECKBOX",
    isRequired: true,
    expectedValue: false,
    severity: "CRITICAL",
    okImageUrl: "/ok.png",
    translations: { en: { label: "Mounting" } },
  },
  {
    id: "b",
    label: "Pomiar",
    type: "NUMBER_RANGE",
    isRequired: true,
    range: { min: 0, max: 10 },
  },
  {
    id: "c",
    label: "Wariant",
    type: "SELECT",
    isRequired: false,
    options: ["A", "B"],
    expectedValue: "B",
  },
];

test("moves questions both ways without losing identity, settings or mutating the original", () => {
  const moved = moveQuestion(questions, "a", 2);
  assert.deepEqual(
    moved.map((question) => question.id),
    ["b", "c", "a"],
  );
  assert.deepEqual(
    questions.map((question) => question.id),
    ["a", "b", "c"],
  );
  for (const question of moved)
    assert.equal(
      question,
      questions.find((item) => item.id === question.id),
    );
  const restored = moveQuestion(moved, "a", 0);
  assert.deepEqual(restored, questions);
  assert.deepEqual(
    moveQuestion(questions, "b", 0).map((question) => question.id),
    ["b", "a", "c"],
  );
});

test("ignores obsolete question IDs and invalid positions", () => {
  for (const [id, target] of [
    ["gone", 0],
    ["a", -1],
    ["b", 3],
    ["c", 1.5],
    ["a", 0],
  ] as const) {
    assert.equal(moveQuestion(questions, id, target), questions);
  }
  assert.deepEqual(moveQuestion([], "gone", 0), []);
});
