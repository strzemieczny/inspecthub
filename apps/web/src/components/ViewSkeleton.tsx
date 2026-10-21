import { useI18n } from "../lib/i18n";
import "./ViewSkeleton.css";

type SkeletonVariant =
  | "dashboard"
  | "quality"
  | "report"
  | "inspection"
  | "login"
  | "form"
  | "table";

function Block({ className = "" }: { className?: string }) {
  return <span className={`loading-block ${className}`} />;
}

/** Use inside a table body to preserve valid table markup and column widths. */
export function TableSkeletonRows({
  columns,
  rows = 6,
}: {
  columns: number;
  rows?: number;
}) {
  return Array.from({ length: rows }, (_, row) => (
    <tr key={row} aria-hidden="true">
      {Array.from({ length: columns }, (_, column) => (
        <td key={column}>
          <Block
            className={column === 0 ? "loading-line-wide" : "loading-line"}
          />
        </td>
      ))}
    </tr>
  ));
}

export function ViewSkeleton({
  variant = "form",
  page = false,
}: {
  variant?: SkeletonVariant;
  page?: boolean;
}) {
  const { t } = useI18n();
  const metrics =
    variant === "dashboard" || variant === "quality" || variant === "report";
  return (
    <div
      className={`view-skeleton view-skeleton-${variant}${page ? " view-skeleton-page" : ""}`}
      role="status"
      aria-busy="true"
    >
      <span className="loading-sr-only">{t("common.loading")}</span>
      <div aria-hidden="true" className="loading-layout">
        {page && (
          <div className="loading-nav">
            <Block className="loading-brand" />
            <Block className="loading-action" />
          </div>
        )}
        <div className="loading-heading">
          <Block className="loading-title" />
          <Block className="loading-line" />
        </div>
        {metrics && (
          <div className="loading-metrics">
            {Array.from({ length: 4 }, (_, i) => (
              <div className="loading-panel" key={i}>
                <Block className="loading-line" />
                <Block className="loading-value" />
              </div>
            ))}
          </div>
        )}
        <div className={metrics ? "loading-columns" : "loading-stack"}>
          {Array.from({ length: metrics ? 2 : 1 }, (_, i) => (
            <div className="loading-panel" key={i}>
              <Block className="loading-title" />
              {variant === "dashboard" ? (
                <Block className="loading-chart" />
              ) : (
                Array.from(
                  { length: variant === "login" ? 3 : 5 },
                  (_, row) => (
                    <div className="loading-field" key={row}>
                      <Block className="loading-line" />
                      <Block
                        className={
                          variant === "table" || variant === "quality"
                            ? "loading-row"
                            : "loading-input"
                        }
                      />
                    </div>
                  ),
                )
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
