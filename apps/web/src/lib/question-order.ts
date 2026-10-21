import type { InspectionQuestion } from "@inspect-hub/types";

/** Move the entire question, retaining its identity and all nested settings. */
export function moveQuestion(
  questions: InspectionQuestion[],
  id: string,
  targetIndex: number,
): InspectionQuestion[] {
  const sourceIndex = questions.findIndex((question) => question.id === id);
  if (
    sourceIndex < 0 ||
    !Number.isInteger(targetIndex) ||
    targetIndex < 0 ||
    targetIndex >= questions.length ||
    sourceIndex === targetIndex
  )
    return questions;
  const next = [...questions];
  const [question] = next.splice(sourceIndex, 1);
  next.splice(targetIndex, 0, question);
  return next;
}
