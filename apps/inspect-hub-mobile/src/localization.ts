import type { InspectionQuestion } from "@inspect-hub/types";
import { translations } from "./translations.ts";

export type Language = "pl" | "en" | "uk";
export const languages = ["pl", "en", "uk"] as const;
export const languageNames: Record<Language, string> = {
  pl: "Polski",
  en: "English",
  uk: "Українська",
};

export function resolveLanguage(value: string | null | undefined): Language {
  const base = value?.toLowerCase().split(/[-_]/)[0];
  return base === "en" || base === "uk" ? base : "pl";
}

// Polish source strings are also the fallback for server messages and custom content.
export function translate(
  language: Language,
  source: string,
  params: Record<string, string | number> = {},
): string {
  const entry = translations[source as keyof typeof translations];
  const text = language === "pl" ? source : (entry?.[language] ?? source);
  return text.replace(/\{(\w+)\}/g, (token, key: string) =>
    Object.hasOwn(params, key) ? String(params[key]) : token,
  );
}

export function localizeQuestion(
  question: InspectionQuestion,
  language: Language,
) {
  const translation =
    language === "pl" ? undefined : question.translations?.[language];
  return {
    label: translation?.label?.trim() || question.label,
    description: translation?.description?.trim() || question.description,
    // Keep original option values for validation, expected answers and submission.
    optionLabel: (option: string, index: number) =>
      translation?.options?.length === question.options?.length
        ? translation?.options?.[index]?.trim() || option
        : option,
  };
}
