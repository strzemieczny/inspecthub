import type {
  InspectionAnswerValue,
  InspectionQuestion,
  QuestionSeverity,
} from "@inspect-hub/types";

import { type Language } from "../lib/i18n";

export function createClientId(): string {
  const cryptoApi = globalThis.crypto;
  if (typeof cryptoApi?.randomUUID === "function") {
    return cryptoApi.randomUUID();
  }

  const bytes = new Uint8Array(16);
  if (typeof cryptoApi?.getRandomValues === "function") {
    cryptoApi.getRandomValues(bytes);
  } else {
    for (let index = 0; index < bytes.length; index += 1) {
      bytes[index] = Math.floor(Math.random() * 256);
    }
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0"));
  return `${hex.slice(0, 4).join("")}-${hex.slice(4, 6).join("")}-${hex.slice(6, 8).join("")}-${hex.slice(8, 10).join("")}-${hex.slice(10).join("")}`;
}

export const emptyQuestion = (): InspectionQuestion => ({
  id: createClientId(),
  label: "",
  type: "CHECKBOX",
  isRequired: true,
  severity: "NORMAL",
});

export function parseOptionsInput(value: string): string[] {
  return value.split(",");
}

export function normalizeOptions(options?: string[]): string[] | undefined {
  return options?.map((option) => option.trim()).filter(Boolean);
}

export function isPassedStatus(status: string): boolean {
  return ["PASSED", "PASS", "OK", "ZDAŁ", "ZDAL"].includes(
    status.toUpperCase(),
  );
}

export function canAssessAutomatically(question: InspectionQuestion): boolean {
  if (question.type === "PHOTO_UPLOAD") return false;
  return (
    question.expectedValue !== undefined ||
    (question.type === "NUMBER_RANGE" && question.range !== undefined)
  );
}

export function questionSeverity(
  question: InspectionQuestion,
): QuestionSeverity {
  return question.severity ?? (question.isCritical ? "CRITICAL" : "NORMAL");
}

export function isQuestionAnswerOk(
  question: InspectionQuestion,
  value: InspectionAnswerValue | undefined,
): boolean {
  if (question.expectedValue !== undefined)
    return value === question.expectedValue;
  return Boolean(
    question.type === "NUMBER_RANGE" &&
    question.range &&
    typeof value === "number" &&
    value >= question.range.min &&
    value <= question.range.max,
  );
}

export function removeEmptyOptions(
  question: InspectionQuestion,
): InspectionQuestion {
  if (question.type !== "SELECT") return question;
  return {
    ...question,
    options: normalizeOptions(question.options),
    translations: question.translations
      ? {
          ...question.translations,
          en: question.translations.en
            ? {
                ...question.translations.en,
                options: normalizeOptions(question.translations.en.options),
              }
            : undefined,
          uk: question.translations.uk
            ? {
                ...question.translations.uk,
                options: normalizeOptions(question.translations.uk.options),
              }
            : undefined,
        }
      : undefined,
  };
}

export function localizeQuestion(
  question: InspectionQuestion,
  language: Language,
): InspectionQuestion {
  if (language === "pl") return question;
  const translation = question.translations?.[language];
  if (!translation) return question;
  return {
    ...question,
    label: translation.label?.trim() || question.label,
    description: translation.description?.trim() || question.description,
    options:
      translation.options?.length === question.options?.length
        ? translation.options
        : question.options,
  };
}

export const NEW_FORM_DRAFT_KEY = "inspect-hub-form-draft:new";
export const OFFLINE_INSPECTION_QUEUE_KEY = "inspect-hub-offline-inspections";
export const OFFLINE_INSPECTION_CONTEXT_KEY = "inspect-hub-offline-context";

export type QueuedInspection = { id: string; payload: Record<string, unknown> };

export function readInspectionQueue(): QueuedInspection[] {
  try {
    return JSON.parse(
      localStorage.getItem(OFFLINE_INSPECTION_QUEUE_KEY) ?? "[]",
    ) as QueuedInspection[];
  } catch {
    return [];
  }
}

export function writeInspectionQueue(queue: QueuedInspection[]) {
  localStorage.setItem(OFFLINE_INSPECTION_QUEUE_KEY, JSON.stringify(queue));
}

export function normalizePartNumbers(values: string[]): string[] {
  return [
    ...new Set(
      values
        .flatMap((value) => value.split(/[\n,;]+/))
        .map((value) => value.trim().toUpperCase())
        .filter(Boolean),
    ),
  ];
}

export type NewFormDraft = {
  title: string;
  code: string;
  statuses: string[];
  nokStreakThreshold: number;
  requiresLogin: boolean;
  processIds: string[];
  partNumbers?: string[];
  questions: InspectionQuestion[];
  updatedAt: string;
};

export function readNewFormDraft(): NewFormDraft | null {
  try {
    const value = localStorage.getItem(NEW_FORM_DRAFT_KEY);
    if (!value) return null;
    const draft = JSON.parse(value) as Partial<NewFormDraft>;
    if (
      typeof draft.title !== "string" ||
      typeof draft.code !== "string" ||
      !Array.isArray(draft.statuses) ||
      !Array.isArray(draft.processIds) ||
      !Array.isArray(draft.questions) ||
      typeof draft.updatedAt !== "string"
    )
      return null;
    draft.nokStreakThreshold =
      typeof draft.nokStreakThreshold === "number"
        ? draft.nokStreakThreshold
        : 3;
    draft.requiresLogin = draft.requiresLogin === true;
    return draft as NewFormDraft;
  } catch {
    return null;
  }
}

export function hasNewFormDraftContent(draft: Omit<NewFormDraft, "updatedAt">) {
  return Boolean(
    draft.title ||
    draft.code ||
    draft.processIds.length ||
    draft.partNumbers?.length ||
    draft.nokStreakThreshold !== 3 ||
    draft.requiresLogin ||
    draft.questions.length > 1 ||
    draft.questions.some(
      (question) =>
        question.label ||
        question.description ||
        question.type !== "CHECKBOX" ||
        !question.isRequired ||
        (question.severity ?? (question.isCritical ? "CRITICAL" : "NORMAL")) !==
          "NORMAL" ||
        question.options?.length ||
        question.expectedValue !== undefined ||
        question.range ||
        question.okImageUrl ||
        question.nokImageUrl ||
        question.instructionImageUrl,
    ) ||
    draft.statuses.join("\0") !== "PASSED\0FAILED",
  );
}
