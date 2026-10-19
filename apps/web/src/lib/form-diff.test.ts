import assert from "node:assert/strict";
import { test } from "node:test";
import type { InspectionForm, InspectionQuestion } from "@inspect-hub/types";
import { compareFormRevisions } from "./form-diff.ts";

const question: InspectionQuestion = {
  id: "q1",
  label: "Kontrola",
  type: "CHECKBOX",
  isRequired: true,
};
const form: InspectionForm = {
  id: "v1",
  code: "QC",
  title: "Kontrola",
  version: 1,
  createdAt: "2026-10-19T10:00:00Z",
  archivedAt: null,
  requiresLogin: false,
  nokStreakThreshold: 3,
  processIds: ["p2", "p1"],
  partNumbers: ["B", "A"],
  allowedStatuses: ["OK", "NOK"],
  questions: [question],
};

test("ignores revision metadata, set ordering, and equivalent legacy severity", () => {
  assert.deepEqual(
    compareFormRevisions(form, {
      ...form,
      version: 2,
      id: "v2",
      processIds: ["p1", "p2"],
      partNumbers: ["A", "B"],
      questions: [{ ...question, severity: "NORMAL" }],
    }),
    [],
  );
});

test("retains false and zero and detects removed optional fields and translations", () => {
  const old = {
    ...form,
    questions: [
      {
        ...question,
        expectedValue: false,
        description: "Opis",
        translations: { en: { label: "Check" } },
        range: { min: 0, max: 10 },
      },
    ],
  };
  const changes = compareFormRevisions(old, { ...form, requiresLogin: true });
  assert.ok(
    changes.some(
      (c) =>
        c.field === "requiresLogin" && c.before === false && c.after === true,
    ),
  );
  assert.ok(
    changes.some(
      (c) =>
        c.field === "expectedValue" &&
        c.before === false &&
        c.after === undefined,
    ),
  );
  assert.ok(changes.some((c) => c.field === "range.min" && c.before === 0));
  assert.ok(
    changes.some(
      (c) => c.field === "translations.en.label" && c.before === "Check",
    ),
  );
});

test("tracks additions/removals by identity without reporting shifted questions as modified", () => {
  const changes = compareFormRevisions(form, {
    ...form,
    questions: [{ ...question, id: "q2", label: "Nowe" }, question],
  });
  assert.ok(changes.length > 0);
  assert.ok(
    changes.every((c) => c.section === "Nowe" && c.before === undefined),
  );
  const removed = compareFormRevisions(form, { ...form, questions: [] });
  assert.ok(
    removed.every((c) => c.section === "Kontrola" && c.after === undefined),
  );
});

test("detects question reordering and image changes", () => {
  const second = { ...question, id: "q2", label: "Drugie" };
  const changes = compareFormRevisions(
    { ...form, questions: [question, second] },
    {
      ...form,
      questions: [
        second,
        { ...question, okImageUrl: "/api/media/object?key=new" },
      ],
    },
  );
  assert.deepEqual(
    changes.map((c) => c.field),
    ["questionOrder", "okImageUrl"],
  );
});

test("initial publication shows all configured values and matches legacy critical severity", () => {
  const initial = compareFormRevisions(undefined, form);
  assert.ok(
    initial.some((c) => c.field === "requiresLogin" && c.after === false),
  );
  assert.ok(initial.every((c) => c.before === undefined));
  assert.deepEqual(
    compareFormRevisions(
      { ...form, questions: [{ ...question, isCritical: true }] },
      { ...form, questions: [{ ...question, severity: "CRITICAL" }] },
    ),
    [],
  );
});
