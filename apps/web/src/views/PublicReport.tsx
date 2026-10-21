import { SkeletonImage } from "../components/SkeletonImage";
import { ViewSkeleton } from "../components/ViewSkeleton";
import type { PublicInspectionReport } from "@inspect-hub/types";
import { useEffect, useState } from "react";
import { ApiError, api } from "../lib/api";

import { SettingsMenu, useI18n } from "../lib/i18n";
import { appPath, appRoute } from "../lib/routing";

import { ReportSearch } from "../components/ReportSearch";
export default function PublicReport({
  publicReportId,
}: {
  publicReportId: string;
}) {
  const { language, locale, t } = useI18n();
  const [report, setReport] = useState<PublicInspectionReport | null>(null);
  const [state, setState] = useState<"loading" | "not-found" | "error">(
    "loading",
  );

  useEffect(() => {
    void api<PublicInspectionReport>(
      `/public/reports/${encodeURIComponent(publicReportId)}`,
    )
      .then(setReport)
      .catch((error: unknown) =>
        setState(
          error instanceof ApiError && error.status === 404
            ? "not-found"
            : "error",
        ),
      );
  }, [publicReportId]);

  useEffect(() => {
    if (report && window.location.hash === "#answers") {
      window.requestAnimationFrame(() =>
        document.getElementById("answers")?.scrollIntoView({ block: "start" }),
      );
    }
  }, [report]);

  if (!report && state === "loading")
    return <ViewSkeleton variant="report" page />;

  if (!report) {
    return (
      <main className="public-report-state">
        <a className="brand" href={appRoute(language, "/")}>
          <span className="brand-icon">
            <img
              className="brand-symbol"
              src={appPath("/branding/inspect-hub-symbol-192-v2.png")}
              alt=""
              width={36}
              height={36}
            />
          </span>{" "}
          Inspect Hub
        </a>
        <SettingsMenu />
        <section className="panel">
          {state === "not-found" ? (
            <>
              <span className="report-state-icon">?</span>
              <h1>{t("report.notFound")}</h1>
              <p>{t("report.checkAddress")}</p>
              <ReportSearch />
            </>
          ) : (
            <>
              <span className="report-state-icon">!</span>
              <h1>{t("report.error")}</h1>
              <p>{t("report.tryLater")}</p>
            </>
          )}
        </section>
      </main>
    );
  }

  const passed = ["PASSED", "PASS", "OK", "ZDAŁ", "ZDAL"].includes(
    report.result.toUpperCase(),
  );
  const isPassedResult = (result: string) =>
    ["PASSED", "PASS", "OK", "ZDAŁ", "ZDAL"].includes(result.toUpperCase());
  const originalRetestReport = report.retest.reports.find(
    (relatedReport) => relatedReport.isOriginal,
  );
  const retestReports = report.retest.reports.filter(
    (relatedReport) => !relatedReport.isOriginal,
  );
  const reportPath = (reportId: string) =>
    appRoute(language, `/reports/${reportId}`);
  const reportTreeNode = (
    relatedReport: PublicInspectionReport["retest"]["reports"][number],
    label: string,
  ) => {
    const nodePassed = isPassedResult(relatedReport.result);
    const content = (
      <>
        <span className="report-tree-node-copy">
          <strong>{label}</strong>
          <small>
            {new Intl.DateTimeFormat(locale, {
              dateStyle: "medium",
              timeStyle: "short",
            }).format(new Date(relatedReport.completedAt))}
          </small>
          <code>{relatedReport.reportId}</code>
        </span>
        <span className={`report-tree-result ${nodePassed ? "pass" : "fail"}`}>
          {nodePassed ? "✓" : "×"} {relatedReport.result}
        </span>
        <span className="report-tree-action">
          {relatedReport.isCurrent
            ? t("report.currentReport")
            : `${t("report.openReport")} ↗`}
        </span>
      </>
    );

    return relatedReport.isCurrent ? (
      <div className="report-tree-node current" aria-current="page">
        {content}
      </div>
    ) : (
      <a className="report-tree-node" href={reportPath(relatedReport.reportId)}>
        {content}
      </a>
    );
  };
  const formatValue = (answer: PublicInspectionReport["answers"][number]) => {
    const value = answer.value;
    if (value === null || value === "") return t("report.noAnswer");
    if (typeof value === "boolean")
      return value ? t("common.yes") : t("common.no");
    if (typeof value === "string" && language !== "pl") {
      const optionIndex = answer.options?.indexOf(value) ?? -1;
      const translated =
        answer.translations?.[language]?.options?.[optionIndex];
      if (translated) return translated;
    }
    return String(value);
  };

  return (
    <main className="public-report-shell">
      <header className="report-nav print-hidden">
        <a className="brand" href={appRoute(language, "/")}>
          <span className="brand-icon">
            <img
              className="brand-symbol"
              src={appPath("/branding/inspect-hub-symbol-192-v2.png")}
              alt=""
              width={36}
              height={36}
            />
          </span>{" "}
          Inspect Hub
        </a>
        <div className="report-nav-actions">
          <button
            className="primary"
            type="button"
            onClick={() => window.print()}
          >
            {t("report.print")}
          </button>
          <SettingsMenu />
        </div>
      </header>
      <article className="public-report">
        <header className="report-heading">
          <div>
            <p className="eyebrow">{t("report.eyebrow")}</p>
            <h1>{report.serialNumber}</h1>
            <p>
              {report.form.name} · {report.form.code} · {t("report.version")}{" "}
              {report.form.version}
            </p>
          </div>
          <span className={`report-result ${passed ? "pass" : "fail"}`}>
            {passed ? "✓" : "×"} {report.result}
          </span>
        </header>

        {originalRetestReport && retestReports.length > 0 && (
          <section className="report-section report-tree-section">
            <h2>{t("report.retestTree")}</h2>
            <ul className="report-tree">
              <li>
                {reportTreeNode(
                  originalRetestReport,
                  t("report.originalInspection"),
                )}
                <ul>
                  {retestReports.map((relatedReport, index) => (
                    <li key={relatedReport.reportId}>
                      {reportTreeNode(
                        relatedReport,
                        t("report.retestNumber", { number: index + 1 }),
                      )}
                    </li>
                  ))}
                </ul>
              </li>
            </ul>
          </section>
        )}

        <section className="report-summary-grid">
          <div>
            <span>{t("report.allQuestions")}</span>
            <strong>{report.summary.total}</strong>
          </div>
          <div>
            <span>{t("report.passed")}</span>
            <strong className="report-ok">{report.summary.passed}</strong>
          </div>
          <div>
            <span>{t("report.failed")}</span>
            <strong className="report-nok">{report.summary.failed}</strong>
          </div>
        </section>

        <section className="report-section">
          <h2>{t("report.productData")}</h2>
          <dl className="report-details">
            <div>
              <dt>{t("report.serial")}</dt>
              <dd>{report.serialNumber}</dd>
            </div>
            {report.partNumber && (
              <div>
                <dt>{t("common.partNumber")}</dt>
                <dd>{report.partNumber}</dd>
              </div>
            )}
            {report.productFamily && (
              <div>
                <dt>{t("report.family")}</dt>
                <dd>{report.productFamily}</dd>
              </div>
            )}
            {report.scadaUnitHistoryUrl && (
              <div className="print-hidden">
                <dt>{t("report.history")}</dt>
                <dd>
                  <a
                    href={report.scadaUnitHistoryUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {t("report.openHistory")}
                  </a>
                </dd>
              </div>
            )}
          </dl>
        </section>

        <section className="report-section">
          <h2>{t("report.execution")}</h2>
          <dl className="report-details">
            <div>
              <dt>{t("report.dateTime")}</dt>
              <dd>
                {new Intl.DateTimeFormat(locale, {
                  dateStyle: "long",
                  timeStyle: "medium",
                }).format(new Date(report.completedAt))}
              </dd>
            </div>
            <div>
              <dt>{t("report.station")}</dt>
              <dd>
                {report.station.name
                  ? `${report.station.name} (${report.station.code})`
                  : report.station.code}
              </dd>
            </div>
            <div>
              <dt>{t("report.process")}</dt>
              <dd>{report.process ?? "—"}</dd>
            </div>
            {report.operatorName && (
              <div>
                <dt>{t("report.operator")}</dt>
                <dd>{report.operatorName}</dd>
              </div>
            )}
            <div>
              <dt>{t("report.externalSync")}</dt>
              <dd>
                <span
                  className={`sync-status ${report.externalSyncStatus === "SYNCED" ? "synced" : "pending"}`}
                >
                  {report.externalSyncStatus === "SYNCED"
                    ? t("report.synced")
                    : t("report.pending")}
                </span>
              </dd>
            </div>
          </dl>
        </section>

        <section className="report-section report-answers" id="answers">
          <h2>{t("report.answers")}</h2>
          {report.answers.map((answer, index) => (
            <article className="report-answer" key={answer.questionId}>
              <span className="answer-index">
                {String(index + 1).padStart(2, "0")}
              </span>
              <div>
                <h3>
                  {language === "pl"
                    ? answer.label
                    : answer.translations?.[language]?.label || answer.label}
                </h3>
                {answer.severity !== "NORMAL" && (
                  <span
                    className={`question-severity ${answer.severity.toLowerCase()}`}
                  >
                    {answer.severity}
                  </span>
                )}
                {answer.imageUrl ? (
                  <SkeletonImage
                    src={answer.imageUrl}
                    alt={t("report.photo", { label: answer.label })}
                  />
                ) : (
                  <p>{formatValue(answer)}</p>
                )}
              </div>
              {answer.assessment && (
                <span
                  className={`answer-assessment ${answer.assessment === "OK" ? "ok" : "nok"}`}
                >
                  {answer.assessment === "OK" ? "✓ OK" : "× NOK"}
                </span>
              )}
            </article>
          ))}
        </section>
        <footer className="report-footer">
          {t("report.footer", { id: report.publicReportId })}
        </footer>
      </article>
    </main>
  );
}
