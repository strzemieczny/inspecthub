import { useState, type FormEvent } from "react";

import { useI18n } from "../lib/i18n";
import { appRoute } from "../lib/routing";

export function ReportSearch() {
  const { language, t } = useI18n();
  const [reportId, setReportId] = useState("");
  const normalizeReportId = (value: string) =>
    value.replace(/[\s\u200B-\u200D\u2060\uFEFF]/g, "").toLowerCase();

  function openReport(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalizedReportId = normalizeReportId(reportId);
    if (!normalizedReportId) return;
    const languagePath = language === "uk" ? "ua" : language;
    window.location.assign(
      appRoute(
        languagePath,
        `/reports/${encodeURIComponent(normalizedReportId)}`,
      ),
    );
  }

  return (
    <form className="report-search print-hidden" onSubmit={openReport}>
      <label htmlFor="report-search-id">{t("report.searchLabel")}</label>
      <div>
        <input
          id="report-search-id"
          type="search"
          value={reportId}
          onChange={(event) =>
            setReportId(normalizeReportId(event.target.value))
          }
          placeholder={t("report.searchPlaceholder")}
          aria-label={t("report.searchLabel")}
          pattern="[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-4[0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}"
          autoComplete="off"
          spellCheck={false}
          required
        />
        <button type="submit">{t("report.searchAction")}</button>
      </div>
    </form>
  );
}
