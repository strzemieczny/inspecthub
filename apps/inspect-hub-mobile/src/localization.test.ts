import assert from "node:assert/strict";
import test from "node:test";
import type { InspectionQuestion } from "@inspect-hub/types";
import {
  languages,
  localizeQuestion,
  resolveLanguage,
  translate,
} from "./localization.ts";
import { translations } from "./translations.ts";

test("language selection supports regional locales and a Polish fallback", () => {
  assert.equal(resolveLanguage("uk-UA"), "uk");
  assert.equal(resolveLanguage("en_GB"), "en");
  assert.equal(resolveLanguage("pl-PL"), "pl");
  assert.equal(resolveLanguage("de-DE"), "pl");
  assert.equal(resolveLanguage(null), "pl");
});

test("every translation is present and preserves interpolation parameters", () => {
  for (const [source, entry] of Object.entries(translations)) {
    const tokens = (value: string) => value.match(/\{\w+\}/g)?.sort() ?? [];
    for (const language of ["en", "uk"] as const) {
      assert.ok(entry[language].trim(), `${language}: ${source}`);
      assert.deepEqual(
        tokens(entry[language]),
        tokens(source),
        `${language}: ${source}`,
      );
    }
  }
  assert.equal(
    translate("en", "Pytanie {current} z {total}", { current: 2, total: 5 }),
    "Question 2 of 5",
  );
  assert.equal(
    translate("uk", "Pytanie {current} z {total}", { current: 2, total: 5 }),
    "Питання 2 з 5",
  );
  assert.equal(
    translate("pl", "Sztuka: {serial}", { serial: "$&{name}" }),
    "Sztuka: $&{name}",
  );
  assert.equal(
    translate("en", "Custom server message"),
    "Custom server message",
  );
});

const question: InspectionQuestion = {
  id: "q1",
  type: "SELECT",
  label: "Kolor",
  description: "Sprawdź kolor",
  isRequired: true,
  options: ["Zielony", "Czerwony"],
  expectedValue: "Zielony",
  translations: {
    en: {
      label: "Colour",
      description: "Check the colour",
      options: ["Green", "Red"],
    },
    uk: {
      label: "Колір",
      description: "Перевірте колір",
      options: ["Зелений", "Червоний"],
    },
  },
};

test("question labels and options change language without changing saved answer values", () => {
  const original = structuredClone(question);
  for (const language of languages) {
    const localized = localizeQuestion(question, language);
    assert.equal(
      localized.label,
      language === "pl" ? "Kolor" : question.translations?.[language]?.label,
    );
    assert.equal(
      localized.optionLabel("Zielony", 0),
      language === "pl"
        ? "Zielony"
        : question.translations?.[language]?.options?.[0],
    );
  }
  assert.deepEqual(question, original);
  assert.equal(question.options?.[0], question.expectedValue);
});

test("missing, blank and incomplete question translations fall back to source content", () => {
  const partial = {
    ...question,
    translations: { en: { label: " ", description: "", options: ["Green"] } },
  };
  const localized = localizeQuestion(partial, "en");
  assert.equal(localized.label, question.label);
  assert.equal(localized.description, question.description);
  assert.equal(localized.optionLabel("Zielony", 0), "Zielony");
  assert.equal(localizeQuestion(partial, "uk").label, question.label);
  const blankOption = {
    ...question,
    translations: { en: { options: ["", "Red"] } },
  };
  assert.equal(
    localizeQuestion(blankOption, "en").optionLabel("Zielony", 0),
    "Zielony",
  );
});
