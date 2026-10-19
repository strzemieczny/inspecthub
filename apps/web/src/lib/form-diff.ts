import type { InspectionForm, InspectionQuestion } from "@inspect-hub/types";

export interface FormChange {
  section: string | null;
  field: string;
  before: unknown;
  after: unknown;
}

function normalizedQuestion(question: InspectionQuestion) {
  return {
    ...question,
    id: undefined,
    severity:
      question.severity ?? (question.isCritical ? "CRITICAL" : "NORMAL"),
    isCritical: undefined,
  };
}

function flatten(
  value: unknown,
  prefix = "",
  result: Record<string, unknown> = {},
) {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    for (const [key, child] of Object.entries(value)) {
      flatten(child, prefix ? `${prefix}.${key}` : key, result);
    }
  } else if (value !== undefined && value !== null && value !== "") {
    result[prefix] = value;
  }
  return result;
}

/** Compare immutable publications by question identity, including ordering and translations. */
export function compareFormRevisions(
  before: InspectionForm | undefined,
  after: InspectionForm,
): FormChange[] {
  const changes: FormChange[] = [];
  function compare(section: string | null, left: unknown, right: unknown) {
    const oldFields = flatten(left);
    const newFields = flatten(right);
    for (const field of new Set([
      ...Object.keys(oldFields),
      ...Object.keys(newFields),
    ])) {
      if (
        JSON.stringify(oldFields[field]) !== JSON.stringify(newFields[field])
      ) {
        changes.push({
          section,
          field,
          before: oldFields[field],
          after: newFields[field],
        });
      }
    }
  }
  function settings(form: InspectionForm | undefined) {
    return form
      ? {
          title: form.title,
          allowedStatuses: form.allowedStatuses,
          nokStreakThreshold: form.nokStreakThreshold,
          requiresLogin: form.requiresLogin,
          processIds: [...form.processIds].sort(),
          partNumbers: [...(form.partNumbers ?? [])].sort(),
        }
      : {};
  }
  compare(null, settings(before), settings(after));
  const oldQuestions = new Map(
    before?.questions.map((question) => [question.id, question]),
  );
  const newQuestions = new Map(
    after.questions.map((question) => [question.id, question]),
  );
  // Only compare positions of retained questions: inserting a question is not a reorder.
  const retainedBefore =
    before?.questions.filter((q) => newQuestions.has(q.id)).map((q) => q.id) ??
    [];
  const retainedAfter = after.questions
    .filter((q) => oldQuestions.has(q.id))
    .map((q) => q.id);
  if (JSON.stringify(retainedBefore) !== JSON.stringify(retainedAfter)) {
    changes.push({
      section: null,
      field: "questionOrder",
      before: before?.questions.map((q) => q.label),
      after: after.questions.map((q) => q.label),
    });
  }
  for (const id of new Set([...newQuestions.keys(), ...oldQuestions.keys()])) {
    const oldQuestion = oldQuestions.get(id);
    const newQuestion = newQuestions.get(id);
    const section = (newQuestion ?? oldQuestion)!.label;
    const oldFields = oldQuestion ? normalizedQuestion(oldQuestion) : {};
    const newFields = newQuestion ? normalizedQuestion(newQuestion) : {};
    compare(section, oldFields, newFields);
  }
  return changes;
}
