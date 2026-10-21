import { AdminSidebar } from "./AdminSidebar";
import { readStoredUser } from "../lib/session";
import type { CSSProperties, ReactNode } from "react";
import { dashboardDate } from "../lib/dashboard-dates";
import { DashboardFilterSelect } from "./DashboardFilterSelect";
import { ReportSearch } from "./ReportSearch";
import { useI18n } from "../lib/i18n";
import { appPath } from "../lib/routing";
import "./UsersManager.css";
import "./ViewSkeleton.css";

type SkeletonVariant =
  | "dashboard"
  | "quality"
  | "report"
  | "inspection"
  | "login"
  | "form"
  | "table"
  | "admin"
  | "users"
  | "stations"
  | "logs"
  | "scada"
  | "history";

function Block({
  className = "",
  width,
  height,
}: {
  className?: string;
  width?: CSSProperties["width"];
  height?: CSSProperties["height"];
}) {
  return (
    <span className={`loading-block ${className}`} style={{ width, height }} />
  );
}

function Lines({ count = 2 }: { count?: number }) {
  return (
    <div className="loading-lines">
      {Array.from({ length: count }, (_, i) => (
        <Block key={i} width={i ? "65%" : "85%"} />
      ))}
    </div>
  );
}

function Fields({ count = 4 }: { count?: number }) {
  return Array.from({ length: count }, (_, i) => (
    <div className="loading-field" key={i}>
      <Block width="35%" height={12} />
      <Block className="loading-input" />
    </div>
  ));
}

/** Decorative rows retain the spacing of the real two-line directory entries. */
export function TableSkeletonRows({
  columns,
  rows = 6,
}: {
  columns: number;
  rows?: number;
}) {
  return Array.from({ length: rows }, (_, row) => (
    <tr key={row} className="loading-table-row" aria-hidden="true">
      {Array.from({ length: columns }, (_, column) => (
        <td key={column}>
          {column === 0 ? (
            <Lines />
          ) : (
            <Block width={column === columns - 1 ? "70%" : "80%"} />
          )}
        </td>
      ))}
    </tr>
  ));
}

function DashboardContent() {
  const { t } = useI18n();
  return (
    <>
      <section className="metric-grid">
        {[
          "Inspekcje w okresie",
          "First pass yield",
          "Niezgodności w okresie",
          t("dashboard.activeStations"),
        ].map((label, i) => (
          <article
            className={`metric-card${i === 0 ? " featured" : ""}`}
            key={label}
          >
            <div className="metric-icon">{["✓", "%", "!", "▦"][i]}</div>
            <div>
              <span>{label}</span>
              <strong className="loading-block loading-metric-value">
                &nbsp;
              </strong>
              <small>
                {i === 1
                  ? t("dashboard.dailyTarget")
                  : i === 3
                    ? t("dashboard.working")
                    : t("dashboard.noComparison")}
              </small>
            </div>
          </article>
        ))}
      </section>
      <section className="dashboard-main-grid">
        <article className="dashboard-card chart-card">
          <div className="card-heading">
            <div>
              <h2>{t("dashboard.throughput")}</h2>
              <p>Wyniki w wybranym zakresie dat</p>
            </div>
          </div>
          <div className="chart-wrap">
            <Block className="loading-chart" />
          </div>
        </article>
        <aside className="dashboard-card quality-card">
          <div className="card-heading">
            <div>
              <h2>{t("dashboard.qualityStatus")}</h2>
              <p>Produkcja w wybranym okresie</p>
            </div>
          </div>
          <div className="quality-ring loading-ring" />
          <div className="quality-breakdown">
            {(["dashboard.passed", "dashboard.failed"] as const).map(
              (label) => (
                <button disabled key={label}>
                  <span>{t(label)}</span>
                  <strong className="loading-block loading-inline-value">
                    &nbsp;
                  </strong>
                </button>
              ),
            )}
          </div>
          <div className="mes-health">
            <span>{t("dashboard.scadaSync")}</span>
            <strong className="loading-block loading-inline-value">
              &nbsp;
            </strong>
          </div>
        </aside>
      </section>
      <section className="dashboard-card completeness-card">
        <div className="card-heading">
          <div>
            <h2>{t("dashboard.completeness")}</h2>
            <p>{t("dashboard.completenessSubtitle")}</p>
          </div>
        </div>
        <div className="completeness-grid">
          {Array.from({ length: 4 }, (_, i) => (
            <article key={i}>
              <Block className="loading-icon" />
              <Lines />
            </article>
          ))}
        </div>
      </section>
      <section className="quality-analysis-grid">
        {[0, 1].map((i) => (
          <article className="dashboard-card loading-analysis" key={i}>
            <Block width="50%" height={20} />
            <div className="loading-analysis-body">
              <Lines count={6} />
            </div>
          </article>
        ))}
      </section>
      <section className="analysis-grid">
        {[0, 1].map((i) => (
          <article className="dashboard-card loading-analysis" key={i}>
            <Block width="55%" height={20} />
            <div className="loading-analysis-body">
              <Lines count={5} />
            </div>
          </article>
        ))}
      </section>
      <section className="dashboard-card recent-card">
        <div className="card-heading">
          <div>
            <h2>{t("dashboard.reports")}</h2>
            <p>{t("dashboard.reportsSubtitle")}</p>
          </div>
        </div>
        <div className="table-scroll">
          <table>
            <tbody>
              <TableSkeletonRows columns={6} rows={4} />
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

function QualityContent() {
  return (
    <>
      <section className="quality-live-kpis">
        {["", "", "warning", "critical"].map((className, i) => (
          <article className={className} key={i}>
            <span>
              {
                [
                  "Inspekcje",
                  "Wyniki NOK",
                  "Aktywne serie NOK",
                  "Wady krytyczne",
                ][i]
              }
            </span>
            <strong className="loading-block loading-quality-value">
              &nbsp;
            </strong>
          </article>
        ))}
      </section>
      <section className="quality-live-grid">
        {[0, 1].map((i) => (
          <article className="quality-feed-panel" key={i}>
            <header>
              <Block width="45%" height={24} />
            </header>
            <div className="quality-feed">
              {[0, 1, 2].map((row) => (
                <div className="loading-feed-row" key={row}>
                  <Block className="loading-icon" />
                  <Lines />
                  <Block width={64} />
                </div>
              ))}
            </div>
          </article>
        ))}
      </section>
    </>
  );
}

function FormContent() {
  const { t } = useI18n();
  return (
    <div className="builder-grid">
      <section className="panel settings">
        <h2>{t("form.settings")}</h2>
        <label>
          {t("form.titleLabel")}
          <input className="loading-input-control" readOnly />
        </label>
        <label>
          Kod formularza
          <input className="loading-input-control" readOnly />
        </label>
        <label>{t("form.finalStatuses")}</label>
        <div className="tags">
          {["PASSED", "FAILED"].map((status) => (
            <span className="tag" key={status}>
              {status}
              <button disabled>×</button>
            </span>
          ))}
        </div>
        <input placeholder={t("form.addStatus")} readOnly />
        <div className="tip">
          <strong>{t("form.statusInfo")}</strong>
          <br />
          {t("form.statusTip")}
        </div>
        <label>
          Próg serii NOK
          <input type="number" className="loading-input-control" readOnly />
          <small>
            Alert pojawi się po tylu kolejnych wynikach NOK na tym samym
            stanowisku dla tego formularza.
          </small>
        </label>
        <label className="form-login-toggle">
          <input type="checkbox" readOnly />
          <span className="form-login-toggle-track">
            <i />
          </span>
          <span className="form-login-toggle-copy">
            <strong>{t("form.requiresLogin")}</strong>
            <small>{t("form.requiresLoginHelp")}</small>
          </span>
        </label>
        <label>Part Number (SCADA)</label>
        <div className="part-number-field">
          <div className="part-number-tags" />
          <div className="part-number-entry">
            <input placeholder="Dodaj numer PN…" readOnly />
            <button disabled>
              <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
                <path
                  d="M8 3v10M3 8h10"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                />
              </svg>
              Dodaj
            </button>
          </div>
        </div>
        <label>{t("form.assignedProcesses")}</label>
        <div className="station-picker">
          <span className="loading-ghost-text">{t("form.noProcesses")}</span>
        </div>
        <div className="tip">{t("form.processTip")}</div>
      </section>
      <section className="questions-column">
        <article className="panel question-card">
          <div className="question-head">
            <span className="question-number">&nbsp;</span>
            <button className="icon-button" disabled>
              {t("common.delete")}
            </button>
          </div>
          <label>
            {t("form.questionContent")}
            <input className="loading-input-control" readOnly />
          </label>
          <label>
            {t("form.verificationDescription")}
            <textarea
              className="verification-description-input loading-input-control"
              rows={3}
              readOnly
            />
          </label>
          <details className="question-translations">
            <summary>
              <span>{t("form.translations")}</span>
              <small>{t("form.translationsHelp")}</small>
            </summary>
          </details>
          <div className="inline-fields">
            <label>
              {t("form.type")}
              <select disabled>
                <option>{t("form.checkbox")}</option>
              </select>
            </label>
            <label className="check">
              <input type="checkbox" readOnly checked /> {t("form.required")}
            </label>
            <label>
              Poziom ważności
              <select disabled>
                <option>Zwykłe</option>
              </select>
            </label>
          </div>
          <label>
            {t("form.expectedValue")}
            <select disabled>
              <option>{t("form.unspecified")}</option>
            </select>
          </label>
          <div className="answer-image-fields">
            <label className="upload-box answer-image-upload">
              {t("form.addOk")}
            </label>
            <label className="upload-box answer-image-upload nok">
              {t("form.addNok")}
            </label>
          </div>
          <label className="upload-box">{t("form.addInstruction")}</label>
        </article>
        <button className="add-question" disabled>
          {t("form.addQuestion")}
        </button>
        <button className="secondary form-preview-button" disabled>
          Podgląd widoku operatora
        </button>
        <button className="primary publish" disabled>
          {t("form.publish")}
        </button>
      </section>
    </div>
  );
}

function DirectoryContent({
  variant,
}: {
  variant: "users" | "stations" | "logs";
}) {
  const { t } = useI18n();
  const columns = variant === "users" ? 4 : 6;
  const panel =
    variant === "users"
      ? "users-directory"
      : variant === "stations"
        ? "stations-manager"
        : "audit-events";
  const scroll =
    variant === "users"
      ? "users-directory-scroll"
      : variant === "stations"
        ? "stations-table-scroll"
        : "table-scroll audit-table-scroll";
  const table =
    variant === "users"
      ? "users-directory-table"
      : variant === "stations"
        ? "stations-table"
        : "";
  return (
    <section className={`panel ${panel}`}>
      {variant === "logs" ? (
        <>
          <div className="audit-filters">
            {(
              [
                "logs.type",
                "logs.station",
                "Correlation ID",
                "logs.from",
                "logs.to",
              ] as const
            ).map((key, i) => (
              <label key={key}>
                {key === "Correlation ID" ? key : t(key)}
                <input type={i >= 3 ? "datetime-local" : "text"} readOnly />
              </label>
            ))}
            <div className="audit-filter-actions">
              <button className="secondary" disabled>
                {t("logs.clear")}
              </button>
              <button disabled>{t("common.loading")}</button>
            </div>
          </div>
          <div className="audit-table-heading">
            <span className="table-count">{t("common.loading")}</span>
            <small>{t("logs.utcHint")}</small>
          </div>
        </>
      ) : (
        <>
          <div
            className={
              variant === "users"
                ? "users-directory-heading"
                : "stations-heading"
            }
          >
            <div>
              {variant === "stations" && (
                <p className="eyebrow">{t("stations.configuration")}</p>
              )}
              <h2>
                {t(variant === "users" ? "admin.users" : "admin.stations")}
              </h2>
              <p className="muted">
                {t(
                  variant === "users"
                    ? "users.directoryHint"
                    : "stations.description",
                )}
              </p>
            </div>
            <Block width={85} height={28} />
          </div>
          {variant === "stations" && (
            <div className="loading-station-add">
              <Block width={145} />
            </div>
          )}
          <div
            className={
              variant === "users"
                ? "users-directory-toolbar"
                : "stations-toolbar"
            }
          >
            <Block className="loading-directory-search" />
            <Block width={180} height={43} />
          </div>
        </>
      )}
      <div className={scroll}>
        <table className={table}>
          {variant === "users" && (
            <colgroup>
              <col />
              <col className="users-directory-role-col" />
              <col className="users-directory-source-col" />
              <col className="users-directory-date-col" />
            </colgroup>
          )}
          <thead>
            <tr>
              {Array.from({ length: columns }, (_, i) => (
                <th key={i}>
                  <Block width="65%" height={12} />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <TableSkeletonRows columns={columns} />
          </tbody>
        </table>
      </div>
      {variant !== "logs" && (
        <div
          className={
            variant === "users"
              ? "users-directory-footer"
              : "loading-directory-footer"
          }
        >
          <Block width={160} height={12} />
        </div>
      )}
    </section>
  );
}

function ScadaContent() {
  const { t } = useI18n();
  return (
    <section className="panel scada-settings">
      <header className="scada-settings-header">
        <div className="scada-settings-title">
          <p className="eyebrow">{t("scada.eyebrow")}</p>
          <h2>Connector SCADA</h2>
          <p>{t("scada.description")}</p>
        </div>
        <div className="scada-toggle">
          <Block width={44} height={24} />
          <span>{t("scada.simulation")}</span>
        </div>
      </header>
      <div className="scada-settings-body">
        <div className="scada-info">
          <span>↔</span>
          <p>{t("scada.info")}</p>
        </div>
        <div className="settings-grid">
          {(
            [
              ["scada.baseUrl", "scada.baseUrlHelp"],
              ["scada.publicUrl", "scada.publicUrlHelp"],
              ["scada.routePath"],
              ["scada.resultPath"],
              ["scada.unitHistoryPath", "scada.unitHistoryPathHelp"],
              ["scada.timeout"],
            ] as const
          ).map(([label, help], i) => (
            <label className={i === 5 ? "timeout-field" : ""} key={label}>
              {t(label)}
              <input type={i === 5 ? "number" : "text"} readOnly />
              {help && <small>{t(help)}</small>}
            </label>
          ))}
        </div>
      </div>
      <footer className="scada-settings-actions">
        <span>{t("scada.devHelp")}</span>
        <button className="primary" disabled>
          {t("scada.save")}
        </button>
      </footer>
    </section>
  );
}

function ReportContent() {
  const { t } = useI18n();
  return (
    <article className="public-report">
      <header className="report-heading">
        <div>
          <p className="eyebrow">{t("report.eyebrow")}</p>
          <h1>
            <Block width={340} height="1.2em" />
          </h1>
          <Block width={260} height={19} />
        </div>
        <Block width={100} height={45} />
      </header>
      <section className="report-summary-grid">
        {[0, 1, 2].map((i) => (
          <div key={i}>
            <Block width="65%" height={14} />
            <Block width="45%" height={36} />
          </div>
        ))}
      </section>
      {[0, 1, 2].map((i) => (
        <section className="report-section loading-report-section" key={i}>
          <Block width={200} height={24} />
          <Fields count={i === 2 ? 3 : 2} />
        </section>
      ))}
    </article>
  );
}

function InspectionContent() {
  const { t } = useI18n();
  let paired = false;
  try {
    const cached = JSON.parse(
      localStorage.getItem("inspect-hub-offline-context") ?? "null",
    ) as { station?: { code?: string } } | null;
    paired = Boolean(cached?.station?.code);
  } catch {
    /* The first visit uses the station pairing layout. */
  }
  if (paired)
    return (
      <section className="panel product-identification-card">
        <div className="serial-scan-icon" />
        <p className="eyebrow">{t("inspection.identification")}</p>
        <h2>{t("inspection.scanTitle")}</h2>
        <p className="muted">{t("inspection.scanHelp")}</p>
        <div className="product-identification-form">
          <label>{t("inspection.serial")}</label>
          <div className="serial-input-row">
            <input className="loading-input-control" readOnly />
            <button className="secondary camera-scan-button" disabled>
              <Block width={22} height={22} />
            </button>
          </div>
          <Block height={43} />
        </div>
      </section>
    );
  return (
    <section className="panel operator-empty station-pairing-card">
      <span className="empty-icon station-device-icon" />
      <h2>{t("inspection.pairTitle")}</h2>
      <p className="muted">{t("inspection.pairHelp")}</p>
      <div className="station-identify">
        {(
          [
            "inspection.stationCode",
            "inspection.stationName",
            "inspection.stationProcess",
          ] as const
        ).map((label) => (
          <label key={label}>
            {t(label)}
            <input className="loading-input-control" readOnly />
          </label>
        ))}
        <button className="primary" disabled>
          {t("inspection.pair")}
        </button>
      </div>
    </section>
  );
}

function LoginContent() {
  const { t } = useI18n();
  return (
    <section className="auth-card">
      <img
        className="auth-brand-symbol"
        src={appPath("/branding/inspect-hub-symbol-192-v2.png")}
        alt=""
        width={80}
        height={80}
      />
      <p className="eyebrow">{t("common.qualityOperations")}</p>
      <h1>Inspect Hub</h1>
      <p className="muted">{t("login.tagline")}</p>
      <div className="card-login-form loading-login-form">
        <div className="card-reader-icon" />
        <h2>{t("login.cardTitle")}</h2>
        <p className="muted">{t("login.cardHint")}</p>
        <label className="card-identifier-label">
          {t("login.cardIdentifier")}
          <input className="loading-input-control" readOnly />
        </label>
        <button className="primary" disabled>
          {t("login.cardButton")}
        </button>
      </div>
      <div className="password-login">
        <summary>{t("login.adminLogin")}</summary>
      </div>
      <p className="auth-note">{t("login.note")}</p>
    </section>
  );
}

function Nav({ variant }: { variant: SkeletonVariant }) {
  const className =
    variant === "dashboard"
      ? "dashboard-nav"
      : variant === "quality"
        ? "quality-live-nav"
        : variant === "report"
          ? "report-nav"
          : "station-bar";
  return (
    <header className={className}>
      <div className="brand dashboard-brand">
        <span className="brand-icon">
          <img
            className="brand-symbol"
            src={appPath("/branding/inspect-hub-symbol-192-v2.png")}
            alt=""
            width={36}
            height={36}
          />
        </span>
        <div>Inspect Hub</div>
      </div>
      <Block width={160} height={36} />
    </header>
  );
}

function DashboardFiltersSkeleton() {
  const { t } = useI18n();
  const select = (label: string, placeholder: string) => (
    <DashboardFilterSelect
      label={label}
      placeholder={placeholder}
      options={[]}
      value=""
      onChange={() => {}}
    />
  );
  return (
    <section className="dashboard-filters">
      <div className="filter-toolbar">
        <div className="quick-ranges">
          {["Dzisiaj", "7 dni", "30 dni", "Kwartał"].map((label) => (
            <button disabled key={label}>
              {label}
            </button>
          ))}
        </div>
        <span className="active-range">
          {dashboardDate(6)} — {dashboardDate(0)}
        </span>
      </div>
      <div className="filter-grid">
        <label>
          Od
          <input type="date" value={dashboardDate(6)} readOnly />
        </label>
        <label>
          Do
          <input type="date" value={dashboardDate(0)} readOnly />
        </label>
        {select("Proces", "Wszystkie procesy")}
        {select("Stanowisko", "Wszystkie stanowiska")}
        {select("Standard", "Wszystkie standardy")}
        <div className="revision-filter">
          <span>Rewizje</span>
          <button className="revision-trigger" disabled>
            Wybierz standard
          </button>
        </div>
        {select("Wynik", "Wszystkie wyniki")}
        {select(t("dashboard.completeness"), t("dashboard.allInspections"))}
        <label className="search-filter">
          Produkt
          <input type="search" placeholder="Numer seryjny" readOnly />
        </label>
        <label className="search-filter">
          {t("common.partNumber")}
          <input type="search" placeholder="Part number" readOnly />
        </label>
        <div className="filter-actions">
          <button className="filter-reset" disabled>
            Wyczyść
          </button>
          <button className="filter-apply" disabled>
            Analizuję…
          </button>
        </div>
      </div>
      <div className="export-toolbar">
        <div>
          <strong>Eksport danych</strong>
          <span>Aktualny zakres i aktywne filtry</span>
        </div>
        <div className="export-actions">
          {["↓ CSV", "↓ XLSX", "↓ PDF", "⌘ Kopiuj API"].map((label) => (
            <button disabled key={label}>
              {label}
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}

function Page({
  variant,
  children,
}: {
  variant: SkeletonVariant;
  children: ReactNode;
}) {
  const { t } = useI18n();
  if (variant === "login")
    return <main className="auth-shell">{children}</main>;
  if (variant === "admin") {
    const collapsed =
      localStorage.getItem("inspect-hub-admin-sidebar") === "collapsed";
    return (
      <div className={`admin-layout${collapsed ? " sidebar-collapsed" : ""}`}>
        <AdminSidebar
          role={readStoredUser()?.role ?? "MANAGER"}
          section="forms-new"
          sidebarCollapsed={collapsed}
        />
        <div className="workspace admin-content">
          <header className="page-heading">
            <div>
              <p className="eyebrow">{t("admin.panel")}</p>
              <h1>{t("admin.newTitle")}</h1>
            </div>
            <span className="status-dot">{t("form.draft")}</span>
          </header>
          {children}
        </div>
      </div>
    );
  }
  const shell =
    variant === "dashboard"
      ? "dashboard-shell"
      : variant === "quality"
        ? "quality-live-shell"
        : variant === "report"
          ? "public-report-shell"
          : "station-shell";
  if (variant === "report")
    return (
      <main className={shell}>
        <Nav variant={variant} />
        {children}
      </main>
    );
  const content =
    variant === "dashboard"
      ? "dashboard-content"
      : variant === "quality"
        ? "quality-live-content"
        : "workspace operator-workspace";
  return (
    <main className={shell}>
      <Nav variant={variant} />
      <div className={content}>
        {variant === "dashboard" ? (
          <>
            <section className="dashboard-title">
              <div>
                <p className="eyebrow">{t("dashboard.eyebrow")}</p>
                <h1>{t("dashboard.title")}</h1>
                <p>{t("dashboard.subtitle")}</p>
              </div>
              <div className="dashboard-title-tools">
                <ReportSearch />
                <div className="dashboard-updated">
                  <span>{t("dashboard.dataAsOf")}</span>
                  <strong>
                    <Block width={60} height={24} />
                  </strong>
                  <small>{t("dashboard.loadedOnOpen")}</small>
                </div>
              </div>
            </section>
            <DashboardFiltersSkeleton />
          </>
        ) : variant === "quality" ? (
          <section className="quality-live-heading">
            <div>
              <p className="eyebrow">MONITOR JAKOŚCI · OSTATNIE 24 GODZINY</p>
              <h1>Alerty jakościowe</h1>
              <p>
                Serie kolejnych wyników NOK i krytyczne niezgodności z
                inspekcji.
              </p>
            </div>
            <span className="loading-quality-back">← Dashboard wyników</span>
          </section>
        ) : (
          <header className="page-heading operator-heading">
            <h1>{t("inspection.title")}</h1>
            <Block width={90} height={32} />
          </header>
        )}
        {children}
      </div>
    </main>
  );
}

export function ViewSkeleton({
  variant = "form",
  page = false,
}: {
  variant?: SkeletonVariant;
  page?: boolean;
}) {
  const { t } = useI18n();
  const content =
    variant === "dashboard" ? (
      <DashboardContent />
    ) : variant === "quality" ? (
      <QualityContent />
    ) : variant === "report" ? (
      <ReportContent />
    ) : variant === "inspection" ? (
      <InspectionContent />
    ) : variant === "login" ? (
      <LoginContent />
    ) : variant === "users" || variant === "stations" || variant === "logs" ? (
      <DirectoryContent variant={variant} />
    ) : variant === "scada" ? (
      <ScadaContent />
    ) : variant === "table" ? (
      <section className="panel forms-library">
        <Block width={200} height={28} />
        <div className="loading-form-list">
          {[0, 1, 2].map((i) => (
            <div className="form-row" key={i}>
              <Lines />
              <Block width={80} />
              <Block width={160} height={35} />
            </div>
          ))}
        </div>
      </section>
    ) : variant === "history" ? (
      <div className="loading-history">
        <Lines count={3} />
      </div>
    ) : (
      <FormContent />
    );
  return (
    <div
      className={`view-skeleton view-skeleton-${variant}`}
      role="status"
      aria-busy="true"
    >
      <span className="loading-sr-only">{t("common.loading")}</span>
      <div className="loading-content" aria-hidden="true" inert>
        {page ? <Page variant={variant}>{content}</Page> : content}
      </div>
    </div>
  );
}
