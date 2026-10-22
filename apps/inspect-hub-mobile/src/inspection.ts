import type {
  InspectionAnswerValue,
  InspectionForm,
  InspectionQuestion,
  UserRole,
} from "@inspect-hub/types";

export type Answers = Record<string, InspectionAnswerValue>;
export type Session = {
  accessToken: string;
  user: { id: string; name: string; email: string; role: UserRole };
};
export type Draft = {
  id: string;
  operatorId: string | null;
  form: InspectionForm;
  stationCode: string;
  serial: string;
  routeCheckId: string | null;
  startedAt: number;
  questionTimes?: Record<string, number>;
  answers: Answers;
  correctedIds: string[];
  status: string;
  index: number;
  summary: boolean;
  // Freeze the exact request before sending. Retry always uses the same ID/body.
  submission?: Submission;
};
export type Submission = {
  clientSubmissionId: string;
  formId: string;
  stationId: string;
  vinOrSerialNumber: string;
  routeCheckId?: string;
  durationSeconds: number;
  answerCorrections: number;
  status: string;
  answers: {
    questionId: string;
    value: InspectionAnswerValue;
    durationSeconds?: number;
  }[];
};
export function hasValue(value: InspectionAnswerValue | undefined): boolean {
  return (
    value !== undefined &&
    value !== null &&
    value !== "" &&
    (typeof value !== "number" || Number.isFinite(value)) &&
    (typeof value !== "string" || value.trim() !== "")
  );
}
export function canAssess(question: InspectionQuestion): boolean {
  if (question.type === "PHOTO_UPLOAD") return false;
  return (
    question.expectedValue !== undefined ||
    (question.type === "NUMBER_RANGE" && question.range !== undefined)
  );
}
export function isPassed(status: string): boolean {
  return ["PASSED", "PASS", "OK", "ZDAŁ", "ZDAL"].includes(
    status.toUpperCase(),
  );
}
export function automaticStatus(
  form: InspectionForm,
  answers: Answers,
): string | null {
  const assessed = form.questions.filter(
    (q) => canAssess(q) && (q.isRequired || hasValue(answers[q.id])),
  );
  if (
    !assessed.length ||
    form.questions.some(
      (q) => q.type !== "PHOTO_UPLOAD" && q.isRequired && !canAssess(q),
    )
  )
    return null;
  const passed = assessed.every((q) => {
    const value = answers[q.id];
    if (q.expectedValue !== undefined) return value === q.expectedValue;
    return (
      typeof value === "number" &&
      !!q.range &&
      value >= q.range.min &&
      value <= q.range.max
    );
  });
  return (
    form.allowedStatuses.find((status) => isPassed(status) === passed) ?? ""
  );
}
export function submissionFor(draft: Draft, now: number): Submission {
  if (draft.submission) return draft.submission;
  if (
    draft.form.questions.some(
      (q) => q.isRequired && !hasValue(draft.answers[q.id]),
    )
  ) {
    throw new Error("Uzupełnij wszystkie wymagane odpowiedzi.");
  }
  const status = automaticStatus(draft.form, draft.answers) ?? draft.status;
  if (!draft.form.allowedStatuses.includes(status))
    throw new Error("Wybierz wynik inspekcji.");
  return {
    clientSubmissionId: draft.id,
    formId: draft.form.id,
    stationId: draft.stationCode,
    vinOrSerialNumber: draft.serial,
    ...(draft.routeCheckId ? { routeCheckId: draft.routeCheckId } : {}),
    durationSeconds: Math.min(
      86400,
      Math.max(0, Math.round((now - draft.startedAt) / 1000)),
    ),
    answerCorrections: draft.correctedIds.length,
    status,
    answers: draft.form.questions.map((q) => ({
      questionId: q.id,
      value: draft.answers[q.id] ?? null,
      ...(draft.questionTimes?.[q.id] !== undefined
        ? {
            durationSeconds: Math.min(
              86400,
              Math.max(0, Math.round(draft.questionTimes[q.id] / 1000)),
            ),
          }
        : {}),
    })),
  };
}
