import type { InspectionForm, InspectionProcess } from "@inspect-hub/types";
import { useI18n } from "../lib/i18n";
import { compareFormRevisions } from "../lib/form-diff";

export function FormRevisionHistory({
  revisions,
  code,
  processes,
}: {
  revisions: InspectionForm[];
  code: string;
  processes: InspectionProcess[];
}) {
  const { t, locale } = useI18n();
  const dates = new Intl.DateTimeFormat(locale, { dateStyle: "medium" });
  const times = new Intl.DateTimeFormat(locale, { timeStyle: "short" });
  const labels: Record<string, string> = {
    title: t("form.titleLabel"),
    allowedStatuses: t("form.finalStatuses"),
    nokStreakThreshold: t("history.threshold"),
    requiresLogin: t("history.login"),
    processIds: t("form.assignedProcesses"),
    partNumbers: t("history.partNumbers"),
    questionOrder: t("history.questionOrder"),
    label: t("form.questionContent"),
    type: t("form.type"),
    isRequired: t("form.required"),
    severity: t("history.severity"),
    instructionImageUrl: t("history.instructionImage"),
    okImageUrl: t("history.okImage"),
    nokImageUrl: t("history.nokImage"),
    description: t("history.description"),
    options: t("form.options"),
    expectedValue: t("form.expectedValue"),
    "range.min": t("form.rangeFrom"),
    "range.max": t("form.rangeTo"),
  };
  const types: Record<string, string> = {
    CHECKBOX: t("form.checkbox"),
    TEXT: t("form.text"),
    SELECT: t("form.list"),
    PHOTO_UPLOAD: t("form.photo"),
    NUMBER_RANGE: t("form.numeric"),
    NORMAL: t("history.normal"),
    MAJOR: t("history.major"),
    CRITICAL: t("history.critical"),
  };
  function fieldLabel(field: string) {
    const translation = /^translations\.(en|uk)\.(.+)$/.exec(field);
    return translation
      ? `${labels[translation[2]] ?? translation[2]} (${translation[1].toUpperCase()})`
      : (labels[field] ?? field);
  }
  function display(value: unknown, field: string): string {
    if (value === undefined) return t("history.absent");
    if (typeof value === "boolean")
      return t(value ? "history.yes" : "history.no");
    if (Array.isArray(value))
      return (
        value
          .map((item) =>
            field === "processIds"
              ? (processes.find((process) => process.id === item)?.name ??
                String(item))
              : String(item),
          )
          .join("\n") || t("history.absent")
      );
    return field === "type" || field === "severity"
      ? (types[String(value)] ?? String(value))
      : String(value);
  }
  function renderValue(value: unknown, field: string) {
    return field.endsWith("ImageUrl") && typeof value === "string" ? (
      <img
        className="form-revision-image"
        src={value}
        alt={fieldLabel(field)}
        loading="lazy"
      />
    ) : (
      display(value, field)
    );
  }
  const ordered = [...revisions].sort((a, b) => b.version - a.version);
  return (
    <details
      key={code}
      className="form-revision-history"
      aria-label={t("form.history", { code })}
    >
      <summary className="form-revision-heading">
        <h3>{t("form.history", { code })}</h3>
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          aria-hidden="true"
        >
          <path d="m8 10 4 4 4-4" />
        </svg>
      </summary>
      <p className="form-revision-help">{t("history.help")}</p>
      <div className="form-revision-timeline">
        {ordered.map((revision, index) => {
          const previous = ordered[index + 1];
          const changes = compareFormRevisions(previous, revision);
          const author = revision.createdBy?.name;
          const initials = author
            ?.trim()
            .split(/\s+/)
            .slice(0, 2)
            .map((part) => part[0])
            .join("");
          const groups = new Map<string | null, typeof changes>();
          for (const change of changes) {
            const group = groups.get(change.section) ?? [];
            group.push(change);
            groups.set(change.section, group);
          }
          return (
            <details
              className={`form-revision-entry${index === 0 ? " is-latest" : ""}`}
              key={revision.id}
            >
              <summary>
                <span className="form-revision-version">
                  v{revision.version}
                </span>
                <div className="form-revision-overview">
                  <div className="form-revision-title">
                    <strong>
                      {previous
                        ? t("history.comparison", {
                            before: previous.version,
                            after: revision.version,
                          })
                        : t("history.initial")}
                    </strong>
                    {index === 0 && (
                      <span className="form-revision-latest">
                        {t("history.latest")}
                      </span>
                    )}
                  </div>
                  <div className="form-revision-meta">
                    <span className="form-revision-avatar" aria-hidden="true">
                      {initials || "?"}
                    </span>
                    <span>{author ?? t("history.unknownAuthor")}</span>
                    <time dateTime={revision.createdAt}>
                      {dates.format(new Date(revision.createdAt))}
                      <span>{times.format(new Date(revision.createdAt))}</span>
                    </time>
                  </div>
                </div>
                <span className="form-revision-toggle">
                  <span className="form-revision-expand">
                    {t("history.showChanges")}
                  </span>
                  <span className="form-revision-collapse">
                    {t("history.hideChanges")}
                  </span>
                  <svg
                    viewBox="0 0 20 20"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.7"
                    aria-hidden="true"
                  >
                    <path d="m6 8 4 4 4-4" />
                  </svg>
                </span>
              </summary>
              <div className="form-revision-content">
                <div className="form-revision-comparison">
                  <span>
                    {previous ? `v${previous.version}` : t("history.absent")}
                  </span>
                  <svg
                    viewBox="0 0 20 20"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    aria-hidden="true"
                  >
                    <path d="M3 10h13m-5-5 5 5-5 5" />
                  </svg>
                  <strong>v{revision.version}</strong>
                  <small>
                    {t("history.changeCount", { count: changes.length })}
                  </small>
                </div>
                {changes.length === 0 ? (
                  <p className="muted">{t("history.noChanges")}</p>
                ) : (
                  <div className="table-scroll">
                    <table className="form-revision-diff">
                      <thead>
                        <tr>
                          <th scope="col">{t("history.field")}</th>
                          <th scope="col">{t("history.before")}</th>
                          <th scope="col">{t("history.after")}</th>
                        </tr>
                      </thead>
                      {Array.from(groups, ([section, group]) => (
                        <tbody
                          key={
                            section === null
                              ? "settings"
                              : `question:${section}`
                          }
                        >
                          <tr className="form-revision-group">
                            <th colSpan={3} scope="rowgroup">
                              {section === null
                                ? t("form.settings")
                                : `${t("form.question")}: ${section}`}
                            </th>
                          </tr>
                          {group.map((change, changeIndex) => (
                            <tr
                              className="form-revision-change"
                              key={changeIndex}
                            >
                              <th scope="row">{fieldLabel(change.field)}</th>
                              <td
                                className="form-revision-before"
                                data-label={t("history.before")}
                              >
                                <div
                                  className={
                                    change.before === undefined
                                      ? "form-revision-empty"
                                      : "form-revision-value"
                                  }
                                >
                                  {renderValue(change.before, change.field)}
                                </div>
                              </td>
                              <td
                                className="form-revision-after"
                                data-label={t("history.after")}
                              >
                                <div
                                  className={
                                    change.after === undefined
                                      ? "form-revision-empty"
                                      : "form-revision-value"
                                  }
                                >
                                  {renderValue(change.after, change.field)}
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      ))}
                    </table>
                  </div>
                )}
              </div>
            </details>
          );
        })}
      </div>
    </details>
  );
}
