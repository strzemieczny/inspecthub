import { ViewSkeleton } from "../components/ViewSkeleton";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { absoluteApiUrl, api, downloadFile } from "../lib/api";

import { DashboardFilterSelect } from "../components/DashboardFilterSelect";
import {
  dashboardDate,
  dashboardQuery,
  validDashboardRange,
} from "../lib/dashboard-dates";
import { SettingsMenu, useI18n } from "../lib/i18n";
import { appPath, appRoute } from "../lib/routing";

import { ReportSearch } from "../components/ReportSearch";
interface DashboardData {
  generatedAt: string;
  range: { from: string; to: string; previousFrom: string; previousTo: string };
  summary: {
    completedToday: number;
    passRate: number;
    issuesToday: number;
    activeStations: number;
    totalStations: number;
    mesSyncRate: number;
    completedTrend: number | null;
    issuesTrend: number | null;
  };
  completeness: {
    averageDurationSeconds: number | null;
    medianDurationSeconds: number | null;
    durationSampleSize: number;
    skippedQuestions: number;
    skippedRate: number;
    unusuallyFast: number;
    frequentCorrections: number;
    durationByForm: Array<{
      formCode: string;
      formName: string;
      medianSeconds: number | null;
      averageSeconds: number;
      sampleSize: number;
    }>;
  };
  daily: { date: string; total: number; passed: number }[];
  breakdowns: {
    stations: {
      key: string;
      name: string;
      process: string | null;
      total: number;
      passed: number;
      passRate: number;
    }[];
    forms: {
      key: string;
      name: string;
      total: number;
      passed: number;
      passRate: number;
    }[];
  };
  questionTrends: {
    key: string;
    label: string;
    formCode: string;
    total: number;
    nok: number;
    nokRate: number;
  }[];
  heatmaps: Record<
    "questionStation" | "time" | "formProduct",
    {
      rows: { key: string; label: string }[];
      columns: string[];
      cells: {
        row: string;
        column: string;
        total: number;
        nok: number;
        rate: number | null;
      }[];
    }
  >;
  filters: {
    processes: { id: string; name: string }[];
    stations: {
      id: string;
      code: string;
      name: string;
      processId: string | null;
    }[];
    forms: { id: string; title: string; code: string; version: number }[];
  };
  recent: {
    publicReportId: string;
    vinOrSerialNumber: string;
    stationId: string;
    status: string;
    originalInspectionId: string | null;
    mesSynced: boolean;
    createdAt: string;
    form: { title: string; code: string };
  }[];
}

const emptyDashboard: DashboardData = {
  generatedAt: new Date().toISOString(),
  range: { from: "", to: "", previousFrom: "", previousTo: "" },
  summary: {
    completedToday: 0,
    passRate: 0,
    issuesToday: 0,
    activeStations: 0,
    totalStations: 0,
    mesSyncRate: 0,
    completedTrend: null,
    issuesTrend: null,
  },
  completeness: {
    averageDurationSeconds: null,
    medianDurationSeconds: null,
    durationSampleSize: 0,
    skippedQuestions: 0,
    skippedRate: 0,
    unusuallyFast: 0,
    frequentCorrections: 0,
    durationByForm: [],
  },
  daily: Array.from({ length: 7 }, (_, index) => {
    const date = new Date();
    date.setDate(date.getDate() - 6 + index);
    return { date: date.toISOString().slice(0, 10), total: 0, passed: 0 };
  }),
  breakdowns: { stations: [], forms: [] },
  questionTrends: [],
  heatmaps: {
    questionStation: { rows: [], columns: [], cells: [] },
    time: { rows: [], columns: [], cells: [] },
    formProduct: { rows: [], columns: [], cells: [] },
  },
  filters: { processes: [], stations: [], forms: [] },
  recent: [],
};

function RevisionMultiSelect({
  revisions,
  selected,
  disabled,
  onChange,
}: {
  revisions: { id: string; title: string; code: string; version: number }[];
  selected: string[];
  disabled: boolean;
  onChange: (ids: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const allSelected =
    selected.length === 0 || selected.length === revisions.length;
  const isOpen = open && !disabled;

  useEffect(() => {
    const close = (event: MouseEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  function toggle(id: string) {
    if (allSelected) {
      onChange(revisions.map((item) => item.id).filter((item) => item !== id));
      return;
    }
    if (selected.includes(id)) {
      const next = selected.filter((item) => item !== id);
      onChange(next.length ? next : [id]);
    } else {
      const next = [...selected, id];
      onChange(next.length === revisions.length ? [] : next);
    }
  }

  return (
    <div className="revision-filter" ref={root}>
      <span>Rewizje</span>
      <button
        type="button"
        className="revision-trigger"
        disabled={disabled}
        aria-expanded={isOpen}
        onClick={() => setOpen((value) => !value)}
      >
        <span>
          {disabled
            ? "Wybierz standard"
            : allSelected
              ? `Wszystkie rewizje (${revisions.length})`
              : `Wybrane rewizje: ${selected.length}`}
        </span>
        <b aria-hidden="true">⌄</b>
      </button>
      {isOpen && (
        <div className="revision-popover">
          <div className="revision-popover-head">
            <strong>Wybierz rewizje</strong>
            <small>Możesz zaznaczyć kilka</small>
          </div>
          <label className="revision-all">
            <input
              type="checkbox"
              checked={allSelected}
              onChange={() => onChange([])}
            />
            <span>
              <strong>Wszystkie rewizje</strong>
              <small>Uwzględnij całą historię standardu</small>
            </span>
          </label>
          <div className="revision-list">
            {revisions.map((item) => (
              <label key={item.id}>
                <input
                  type="checkbox"
                  checked={allSelected || selected.includes(item.id)}
                  onChange={() => toggle(item.id)}
                />
                <span>
                  <strong>Rewizja {item.version}</strong>
                  <small>{item.title}</small>
                </span>
              </label>
            ))}
          </div>
          <div className="revision-popover-actions">
            <button type="button" onClick={() => onChange([])}>
              Zaznacz wszystkie
            </button>
            <button type="button" onClick={() => setOpen(false)}>
              Gotowe
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

type DashboardHeatmap =
  DashboardData["heatmaps"][keyof DashboardData["heatmaps"]];

function QualityHeatmap({
  data,
  type,
}: {
  data: DashboardHeatmap;
  type: "questionStation" | "time" | "formProduct";
}) {
  const cells = new Map(
    data.cells.map((cell) => [`${cell.row}:${cell.column}`, cell]),
  );
  const columnLabel = (column: string) =>
    type === "time" ? `${column.padStart(2, "0")}:00` : column;

  if (!data.rows.length || !data.columns.length) {
    return (
      <div className="analysis-empty">Brak danych dla wybranych filtrów.</div>
    );
  }

  return (
    <div className="heatmap-scroll">
      <div
        className="heatmap-grid"
        style={{
          gridTemplateColumns: `minmax(170px, 1.5fr) repeat(${data.columns.length}, minmax(50px, 1fr))`,
        }}
      >
        <div className="heatmap-corner">NOK %</div>
        {data.columns.map((column) => (
          <div className="heatmap-column" key={column} title={column}>
            {columnLabel(column)}
          </div>
        ))}
        {data.rows.flatMap((row) => [
          <div className="heatmap-row" key={`row-${row.key}`} title={row.label}>
            {row.label}
          </div>,
          ...data.columns.map((column) => {
            const cell = cells.get(`${row.key}:${column}`);
            const rate = cell?.rate ?? null;
            return (
              <div
                className={`heatmap-cell ${rate === null ? "empty" : ""}`}
                key={`${row.key}-${column}`}
                style={
                  rate === null
                    ? undefined
                    : {
                        backgroundColor: `rgba(190, 62, 54, ${0.1 + (rate / 100) * 0.82})`,
                        color: rate >= 55 ? "#fff" : "#7b2925",
                      }
                }
                title={
                  rate === null
                    ? "Brak kontroli"
                    : `${row.label} × ${columnLabel(column)}: ${cell?.nok}/${cell?.total} NOK (${rate.toFixed(1)}%)`
                }
              >
                {rate === null ? "–" : `${Math.round(rate)}%`}
              </div>
            );
          }),
        ])}
      </div>
    </div>
  );
}

export default function Dashboard() {
  const { language, locale, t } = useI18n();
  const route = (path: string) => appRoute(language, path);
  const [data, setData] = useState<DashboardData>(emptyDashboard);
  const [connection, setConnection] = useState<"loading" | "live" | "error">(
    "loading",
  );
  const [filters, setFilters] = useState({
    from: dashboardDate(6),
    to: dashboardDate(0),
    processId: "",
    stationId: "",
    formCode: "",
    formIds: [] as string[],
    result: "",
    search: "",
  });
  const [appliedFilters, setAppliedFilters] = useState(filters);
  const [heatmapType, setHeatmapType] = useState<
    "questionStation" | "time" | "formProduct"
  >("questionStation");
  const [exportBusy, setExportBusy] = useState<string | null>(null);
  const [exportNotice, setExportNotice] = useState("");

  const dateRangeValid = validDashboardRange(filters.from, filters.to);

  function analyticsQuery(selected = appliedFilters) {
    return dashboardQuery(selected);
  }

  async function exportData(format: "csv" | "xlsx" | "pdf") {
    setExportBusy(format);
    setExportNotice("");
    try {
      const query = analyticsQuery();
      query.set("format", format);
      await downloadFile(`/inspections/analytics/v1/export?${query}`);
    } catch (error) {
      setExportNotice(
        error instanceof Error
          ? error.message
          : "Nie udało się wyeksportować danych",
      );
    } finally {
      setExportBusy(null);
    }
  }

  async function copyAnalyticsApi() {
    const url = absoluteApiUrl(`/inspections/analytics/v1?${analyticsQuery()}`);
    await navigator.clipboard.writeText(url);
    setExportNotice("Skopiowano adres API z aktywnymi filtrami.");
  }
  const reportsRef = useRef<HTMLElement>(null);

  const drillDown = (
    patch: Partial<typeof filters>,
    options: { scroll?: boolean } = { scroll: true },
  ) => {
    const next = { ...appliedFilters, ...patch };
    setFilters(next);
    setAppliedFilters(next);
    if (options.scroll !== false) {
      window.setTimeout(
        () =>
          reportsRef.current?.scrollIntoView({
            behavior: "smooth",
            block: "start",
          }),
        0,
      );
    }
  };

  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (active) setConnection("loading");
    });
    const query = dashboardQuery(appliedFilters);
    void api<DashboardData>(`/inspections/public-dashboard?${query}`)
      .then((result) => {
        if (!active) return;
        setData(result);
        setConnection("live");
      })
      .catch(() => {
        if (active) setConnection("error");
      });
    return () => {
      active = false;
    };
  }, [appliedFilters]);

  const maxTotal = Math.max(...data.daily.map((item) => item.total), 1);
  const standards = Array.from(
    new Map(data.filters.forms.map((item) => [item.code, item])).values(),
  );
  const availableRevisions = data.filters.forms.filter(
    (item) => item.code === filters.formCode,
  );
  const passStatus = (status: string) =>
    ["PASSED", "PASS", "OK", "ZDAŁ", "ZDAL"].includes(status.toUpperCase());
  const time = (value: string) =>
    new Intl.DateTimeFormat(locale, {
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(value));
  const dateTime = (value: string) =>
    new Intl.DateTimeFormat(locale, {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(value));
  const duration = (seconds: number | null) => {
    if (seconds === null) return "—";
    const minutes = Math.floor(seconds / 60);
    const remainder = seconds % 60;
    return minutes ? `${minutes} min ${remainder} s` : `${remainder} s`;
  };
  const day = (value: string) =>
    new Intl.DateTimeFormat(locale, { weekday: "short" })
      .format(new Date(`${value}T12:00:00`))
      .replace(".", "");
  const trend = (value: number | null) =>
    value === null ? (
      <small>{t("dashboard.noComparison")}</small>
    ) : (
      <small>
        <b className={value <= 0 ? "good" : ""}>
          {value > 0 ? "↑" : value < 0 ? "↓" : "→"} {Math.abs(value).toFixed(1)}
          %
        </b>{" "}
        vs. poprzedni okres
      </small>
    );

  return (
    <main className="dashboard-shell">
      <header className="dashboard-nav">
        <a className="brand dashboard-brand" href={route("/")}>
          <span className="brand-icon">
            <img
              className="brand-symbol"
              src={appPath("/branding/inspect-hub-symbol-192-v2.png")}
              alt=""
              width={36}
              height={36}
            />
          </span>
          <div>
            Inspect Hub<small>{t("common.qualityIntelligence")}</small>
          </div>
        </a>
        <div className="dashboard-nav-actions">
          <a className="quality-live-link" href={route("/quality")}>
            Alerty jakości <b>●</b>
          </a>
          <span
            className={`live-badge ${connection === "error" ? "offline" : ""}`}
          >
            <i />
            {connection === "live"
              ? t("dashboard.lastUpdated", { time: time(data.generatedAt) })
              : connection === "error"
                ? t("dashboard.unavailable")
                : t("dashboard.fetching")}
          </span>
          <a className="login-link" href={route("/login")}>
            {t("common.login")} <b>↗</b>
          </a>
          <SettingsMenu />
        </div>
      </header>
      <div className="dashboard-content">
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
              <strong>{time(data.generatedAt)}</strong>
              <small>{t("dashboard.loadedOnOpen")}</small>
            </div>
          </div>
        </section>

        <section className="dashboard-filters" aria-label="Filtry analizy">
          <div className="filter-toolbar">
            <div className="quick-ranges">
              <button
                onClick={() => {
                  const next = {
                    ...filters,
                    from: dashboardDate(0),
                    to: dashboardDate(0),
                  };
                  setFilters(next);
                  setAppliedFilters(next);
                }}
              >
                Dzisiaj
              </button>
              <button
                onClick={() => {
                  const next = {
                    ...filters,
                    from: dashboardDate(6),
                    to: dashboardDate(0),
                  };
                  setFilters(next);
                  setAppliedFilters(next);
                }}
              >
                7 dni
              </button>
              <button
                onClick={() => {
                  const next = {
                    ...filters,
                    from: dashboardDate(29),
                    to: dashboardDate(0),
                  };
                  setFilters(next);
                  setAppliedFilters(next);
                }}
              >
                30 dni
              </button>
              <button
                onClick={() => {
                  const next = {
                    ...filters,
                    from: dashboardDate(89),
                    to: dashboardDate(0),
                  };
                  setFilters(next);
                  setAppliedFilters(next);
                }}
              >
                Kwartał
              </button>
            </div>
            <span className="active-range">
              {appliedFilters.from} — {appliedFilters.to}
            </span>
          </div>
          <div className="filter-grid">
            <label>
              Od
              <input
                type="date"
                value={filters.from}
                max={filters.to}
                onChange={(event) =>
                  setFilters({ ...filters, from: event.target.value })
                }
              />
            </label>
            <label>
              Do
              <input
                type="date"
                value={filters.to}
                min={filters.from}
                max={dashboardDate(0)}
                onChange={(event) =>
                  setFilters({ ...filters, to: event.target.value })
                }
              />
            </label>
            <DashboardFilterSelect
              label="Proces"
              placeholder="Wszystkie procesy"
              value={filters.processId}
              options={data.filters.processes.map((item) => ({
                value: item.id,
                label: item.name,
              }))}
              onChange={(processId) =>
                setFilters({ ...filters, processId, stationId: "" })
              }
            />
            <DashboardFilterSelect
              label="Stanowisko"
              placeholder="Wszystkie stanowiska"
              value={filters.stationId}
              options={data.filters.stations
                .filter(
                  (item) =>
                    !filters.processId || item.processId === filters.processId,
                )
                .map((item) => ({
                  value: item.code,
                  label: item.code,
                  detail: item.name,
                }))}
              onChange={(stationId) => setFilters({ ...filters, stationId })}
            />
            <DashboardFilterSelect
              label="Standard"
              placeholder="Wszystkie standardy"
              value={filters.formCode}
              options={standards.map((item) => ({
                value: item.code,
                label: item.title,
                detail: item.code,
              }))}
              onChange={(formCode) =>
                setFilters({ ...filters, formCode, formIds: [] })
              }
            />
            <RevisionMultiSelect
              revisions={availableRevisions}
              selected={filters.formIds}
              disabled={!filters.formCode}
              onChange={(formIds) => setFilters({ ...filters, formIds })}
            />
            <DashboardFilterSelect
              label="Wynik"
              placeholder="Wszystkie wyniki"
              value={filters.result}
              options={[
                { value: "pass", label: "Tylko zgodne" },
                { value: "fail", label: "Tylko niezgodne" },
              ]}
              onChange={(result) => setFilters({ ...filters, result })}
            />
            <label className="search-filter">
              Produkt
              <input
                type="search"
                placeholder="Numer seryjny"
                value={filters.search}
                onChange={(event) =>
                  setFilters({ ...filters, search: event.target.value })
                }
              />
            </label>
            <div className="filter-actions">
              <button
                className="filter-reset"
                onClick={() => {
                  const next = {
                    from: dashboardDate(6),
                    to: dashboardDate(0),
                    processId: "",
                    stationId: "",
                    formCode: "",
                    formIds: [],
                    result: "",
                    search: "",
                  };
                  setFilters(next);
                  setAppliedFilters(next);
                }}
              >
                Wyczyść
              </button>
              <button
                className="filter-apply"
                disabled={connection === "loading" || !dateRangeValid}
                onClick={() => setAppliedFilters({ ...filters })}
              >
                {connection === "loading" ? "Analizuję…" : "Analizuj"}
              </button>
            </div>
          </div>
          {!dateRangeValid && (
            <p role="alert">
              Wybierz prawidłowy zakres dat: Od nie może być później niż Do.
            </p>
          )}
          <div className="export-toolbar">
            <div>
              <strong>Eksport danych</strong>
              <span>Aktualny zakres i aktywne filtry</span>
            </div>
            <div className="export-actions">
              <button
                onClick={() => void exportData("csv")}
                disabled={Boolean(exportBusy)}
              >
                {exportBusy === "csv" ? "Generuję…" : "↓ CSV"}
              </button>
              <button
                onClick={() => void exportData("xlsx")}
                disabled={Boolean(exportBusy)}
              >
                {exportBusy === "xlsx" ? "Generuję…" : "↓ XLSX"}
              </button>
              <button
                onClick={() => void exportData("pdf")}
                disabled={Boolean(exportBusy)}
              >
                {exportBusy === "pdf" ? "Generuję…" : "↓ PDF"}
              </button>
              <button
                className="api-copy"
                onClick={() => void copyAnalyticsApi()}
              >
                ⌘ Kopiuj API
              </button>
            </div>
            {exportNotice && (
              <small className="export-notice">{exportNotice}</small>
            )}
          </div>
        </section>

        {connection === "loading" ? (
          <ViewSkeleton variant="dashboard" />
        ) : (
          <>
            <section className="metric-grid">
              <article className="metric-card featured">
                <div className="metric-icon">✓</div>
                <div>
                  <span>Inspekcje w okresie</span>
                  <strong>
                    {data.summary.completedToday.toLocaleString(locale)}
                  </strong>
                  {trend(data.summary.completedTrend)}
                </div>
              </article>
              <article className="metric-card">
                <div className="metric-icon rate">%</div>
                <div>
                  <span>First pass yield</span>
                  <strong>{data.summary.passRate.toFixed(1)}%</strong>
                  <small>{t("dashboard.dailyTarget")}</small>
                </div>
                <i className="metric-progress">
                  <b
                    style={{
                      width: `${Math.min(data.summary.passRate, 100)}%`,
                    }}
                  />
                </i>
              </article>
              <article className="metric-card">
                <div className="metric-icon issue">!</div>
                <div>
                  <span>Niezgodności w okresie</span>
                  <strong>{data.summary.issuesToday}</strong>
                  {trend(data.summary.issuesTrend)}
                </div>
              </article>
              <article className="metric-card">
                <div className="metric-icon station">▦</div>
                <div>
                  <span>{t("dashboard.activeStations")}</span>
                  <strong>
                    {data.summary.activeStations}
                    <em>/ {data.summary.totalStations}</em>
                  </strong>
                  <small>
                    <i className="tiny-live" /> {t("dashboard.working")}
                  </small>
                </div>
              </article>
            </section>

            <section className="dashboard-main-grid">
              <article className="dashboard-card chart-card">
                <div className="card-heading">
                  <div>
                    <h2>{t("dashboard.throughput")}</h2>
                    <p>Wyniki w wybranym zakresie dat</p>
                  </div>
                  <div className="legend">
                    <span>
                      <i className="legend-total" /> {t("dashboard.all")}
                    </span>
                    <span>
                      <i className="legend-pass" /> {t("dashboard.passed")}
                    </span>
                  </div>
                </div>
                <div className="chart-wrap">
                  <div className="y-axis">
                    <span>{maxTotal.toLocaleString("pl-PL")}</span>
                    <span>
                      {Math.round(maxTotal * 0.66).toLocaleString("pl-PL")}
                    </span>
                    <span>
                      {Math.round(maxTotal * 0.33).toLocaleString("pl-PL")}
                    </span>
                    <span>0</span>
                  </div>
                  <div
                    className="bar-chart"
                    style={{
                      minWidth: `${Math.max(data.daily.length * 38, 420)}px`,
                    }}
                  >
                    {data.daily.map((item) => (
                      <button
                        className="bar-column"
                        key={item.date}
                        type="button"
                        title={`Pokaż ${item.total} inspekcji z ${item.date}`}
                        aria-label={`Pokaż inspekcje z ${item.date}: ${item.total} wszystkich, ${item.passed} zgodnych`}
                        onClick={() =>
                          drillDown({
                            from: item.date,
                            to: item.date,
                            result: "",
                          })
                        }
                      >
                        <div className="bars">
                          <i
                            className="bar-total"
                            style={{
                              height: `${(item.total / maxTotal) * 100}%`,
                            }}
                          />
                          <i
                            className="bar-pass"
                            style={{
                              height: `${(item.passed / maxTotal) * 100}%`,
                            }}
                          />
                        </div>
                        <span>{day(item.date)}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </article>
              <aside className="dashboard-card quality-card">
                <div className="card-heading">
                  <div>
                    <h2>{t("dashboard.qualityStatus")}</h2>
                    <p>Produkcja w wybranym okresie</p>
                  </div>
                </div>
                <button
                  type="button"
                  className="quality-ring"
                  title="Pokaż zgodne inspekcje"
                  aria-label={`Pokaż zgodne inspekcje: ${data.summary.passRate.toFixed(1)}%`}
                  onClick={() => drillDown({ result: "pass" })}
                  style={
                    {
                      "--score": `${data.summary.passRate * 3.6}deg`,
                    } as CSSProperties
                  }
                >
                  <div>
                    <strong>
                      {data.summary.passRate.toFixed(1)}
                      <small>%</small>
                    </strong>
                    <span>{t("dashboard.compliant")}</span>
                  </div>
                </button>
                <div className="quality-breakdown">
                  <button
                    type="button"
                    onClick={() => drillDown({ result: "pass" })}
                  >
                    <span>
                      <i className="pass-dot" /> {t("dashboard.passed")}
                    </span>
                    <strong>
                      {Math.max(
                        data.summary.completedToday - data.summary.issuesToday,
                        0,
                      ).toLocaleString(locale)}
                    </strong>
                  </button>
                  <button
                    type="button"
                    onClick={() => drillDown({ result: "fail" })}
                  >
                    <span>
                      <i className="fail-dot" /> {t("dashboard.failed")}
                    </span>
                    <strong>{data.summary.issuesToday}</strong>
                  </button>
                </div>
                <div className="mes-health">
                  <span>{t("dashboard.scadaSync")}</span>
                  <strong>
                    {data.summary.mesSyncRate.toFixed(1)}% <i />
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
                <span className="completeness-sample">
                  {t("dashboard.durationSample", {
                    count: data.completeness.durationSampleSize,
                  })}
                </span>
              </div>
              <div className="completeness-grid">
                <article>
                  <span className="completeness-icon duration">◷</span>
                  <div>
                    <small>{t("dashboard.averageDuration")}</small>
                    <strong>
                      {duration(data.completeness.averageDurationSeconds)}
                    </strong>
                  </div>
                </article>
                <article>
                  <span className="completeness-icon duration">M</span>
                  <div>
                    <small>Mediana czasu</small>
                    <strong>
                      {duration(data.completeness.medianDurationSeconds)}
                    </strong>
                  </div>
                </article>
                <article>
                  <span className="completeness-icon skipped">○</span>
                  <div>
                    <small>{t("dashboard.skippedQuestions")}</small>
                    <strong>{data.completeness.skippedQuestions}</strong>
                    <em>{data.completeness.skippedRate.toFixed(1)}%</em>
                  </div>
                </article>
                <article>
                  <span className="completeness-icon fast">⚡</span>
                  <div>
                    <small>{t("dashboard.unusuallyFast")}</small>
                    <strong>{data.completeness.unusuallyFast}</strong>
                    <em>{t("dashboard.fastThreshold")}</em>
                  </div>
                </article>
                <article>
                  <span className="completeness-icon corrections">↻</span>
                  <div>
                    <small>{t("dashboard.frequentCorrections")}</small>
                    <strong>{data.completeness.frequentCorrections}</strong>
                    <em>{t("dashboard.correctionsThreshold")}</em>
                  </div>
                </article>
              </div>
              {data.completeness.durationByForm.length > 0 && (
                <div className="duration-by-form">
                  <strong>Czas według formularza</strong>
                  {data.completeness.durationByForm.slice(0, 8).map((item) => (
                    <div key={item.formCode}>
                      <span>
                        {item.formName} · {item.formCode}
                      </span>
                      <b>mediana {duration(item.medianSeconds)}</b>
                      <small>
                        średnia {duration(item.averageSeconds)} · n=
                        {item.sampleSize}
                      </small>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="quality-analysis-grid">
              <article className="dashboard-card question-trends-card">
                <div className="card-heading">
                  <div>
                    <h2>Trendy pojedynczych pytań</h2>
                    <p>Punkty kontroli najczęściej kończące się NOK</p>
                  </div>
                  <span className="table-count">TOP 10</span>
                </div>
                <div className="question-trends-list">
                  {data.questionTrends.slice(0, 10).map((item, index) => (
                    <div className="question-trend-row" key={item.key}>
                      <span className="trend-position">{index + 1}</span>
                      <div>
                        <strong>{item.label}</strong>
                        <small>
                          {item.formCode} · {item.nok} NOK z {item.total} ocen
                        </small>
                      </div>
                      <div className="trend-rate">
                        <strong>{item.nokRate.toFixed(1)}%</strong>
                        <i>
                          <b style={{ width: `${item.nokRate}%` }} />
                        </i>
                      </div>
                    </div>
                  ))}
                  {!data.questionTrends.length && (
                    <div className="analysis-empty">
                      Brak ocen OK/NOK dla wybranych danych.
                    </div>
                  )}
                </div>
              </article>

              <article className="dashboard-card heatmap-card">
                <div className="card-heading heatmap-heading">
                  <div>
                    <h2>Heatmapa jakości</h2>
                    <p>Intensywność koloru oznacza udział wyników NOK</p>
                  </div>
                  <div className="heatmap-tabs" role="tablist">
                    <button
                      className={
                        heatmapType === "questionStation" ? "active" : ""
                      }
                      onClick={() => setHeatmapType("questionStation")}
                    >
                      Pytanie × stanowisko
                    </button>
                    <button
                      className={heatmapType === "time" ? "active" : ""}
                      onClick={() => setHeatmapType("time")}
                    >
                      Godzina × dzień
                    </button>
                    <button
                      className={heatmapType === "formProduct" ? "active" : ""}
                      onClick={() => setHeatmapType("formProduct")}
                    >
                      Formularz × produkt
                    </button>
                  </div>
                </div>
                <QualityHeatmap
                  data={data.heatmaps[heatmapType]}
                  type={heatmapType}
                />
                <div className="heatmap-legend">
                  <span>Brak danych</span>
                  <i />
                  <i />
                  <i />
                  <i />
                  <strong>Wysoki udział NOK</strong>
                </div>
              </article>
            </section>

            <section className="analysis-grid">
              <article className="dashboard-card analysis-card">
                <div className="card-heading">
                  <div>
                    <h2>Stanowiska wymagające uwagi</h2>
                    <p>Najniższy first pass yield, minimum jedna inspekcja</p>
                  </div>
                </div>
                <div className="ranking-list">
                  {[...data.breakdowns.stations]
                    .sort((a, b) => a.passRate - b.passRate)
                    .slice(0, 6)
                    .map((item) => (
                      <button
                        className="ranking-row"
                        key={item.key}
                        type="button"
                        title={`Pokaż inspekcje ze stanowiska ${item.key}`}
                        onClick={() => drillDown({ stationId: item.key })}
                      >
                        <div>
                          <strong>{item.key}</strong>
                          <small>
                            {item.name}
                            {item.process ? ` · ${item.process}` : ""}
                          </small>
                        </div>
                        <div className="ranking-meter">
                          <i>
                            <b style={{ width: `${item.passRate}%` }} />
                          </i>
                          <strong
                            className={item.passRate < 97 ? "below-target" : ""}
                          >
                            {item.passRate.toFixed(1)}%
                          </strong>
                          <small>{item.total} kontroli</small>
                        </div>
                      </button>
                    ))}
                  {!data.breakdowns.stations.length && (
                    <div className="analysis-empty">
                      Brak danych dla wybranych filtrów.
                    </div>
                  )}
                </div>
              </article>
              <article className="dashboard-card analysis-card">
                <div className="card-heading">
                  <div>
                    <h2>Jakość według standardu</h2>
                    <p>Wolumen, zgodność i liczba niezgodności</p>
                  </div>
                </div>
                <div className="ranking-list">
                  {data.breakdowns.forms.slice(0, 6).map((item) => (
                    <button
                      className="ranking-row"
                      key={item.key}
                      type="button"
                      title={`Pokaż inspekcje dla standardu ${item.name}`}
                      onClick={() => {
                        const selectedForm = data.filters.forms.find(
                          (form) => form.id === item.key,
                        );
                        drillDown({
                          formCode: selectedForm?.code ?? "",
                          formIds: [item.key],
                        });
                      }}
                    >
                      <div>
                        <strong>{item.name}</strong>
                        <small>
                          {item.total - item.passed} niezgodnych z {item.total}
                        </small>
                      </div>
                      <div className="ranking-meter">
                        <i>
                          <b style={{ width: `${item.passRate}%` }} />
                        </i>
                        <strong
                          className={item.passRate < 97 ? "below-target" : ""}
                        >
                          {item.passRate.toFixed(1)}%
                        </strong>
                        <small>FPY</small>
                      </div>
                    </button>
                  ))}
                  {!data.breakdowns.forms.length && (
                    <div className="analysis-empty">
                      Brak danych dla wybranych filtrów.
                    </div>
                  )}
                </div>
              </article>
            </section>

            <section
              className="dashboard-card recent-card"
              id="inspection-results"
              ref={reportsRef}
            >
              <div className="card-heading">
                <div>
                  <h2>{t("dashboard.reports")}</h2>
                  <p>{t("dashboard.reportsSubtitle")}</p>
                </div>
                <span className="table-count">
                  {t("dashboard.reportCount", { count: data.recent.length })}
                </span>
              </div>
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>{t("dashboard.time")}</th>
                      <th>{t("dashboard.product")}</th>
                      <th>{t("dashboard.standard")}</th>
                      <th>{t("dashboard.station")}</th>
                      <th>{t("dashboard.result")}</th>
                      <th>SCADA</th>
                      <th>{t("dashboard.report")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.recent.map((item) => (
                      <tr key={item.publicReportId}>
                        <td>{dateTime(item.createdAt)}</td>
                        <td>
                          <strong>{item.vinOrSerialNumber}</strong>
                          {item.originalInspectionId && (
                            <small className="retest-badge">RETEST</small>
                          )}
                        </td>
                        <td>
                          <span className="form-name">{item.form.title}</span>
                          <small>{item.form.code}</small>
                        </td>
                        <td>
                          <span className="station-pill">{item.stationId}</span>
                        </td>
                        <td>
                          <span
                            className={
                              passStatus(item.status)
                                ? "result-pill pass"
                                : "result-pill fail"
                            }
                          >
                            <i />
                            {passStatus(item.status)
                              ? t("dashboard.pass")
                              : t("dashboard.fail")}
                          </span>
                        </td>
                        <td>
                          <span
                            className={item.mesSynced ? "sync-ok" : "sync-wait"}
                          >
                            {item.mesSynced
                              ? t("dashboard.saved")
                              : t("dashboard.pending")}
                          </span>
                        </td>
                        <td>
                          <a
                            className="report-table-link"
                            href={route(
                              `/reports/${item.publicReportId}#answers`,
                            )}
                          >
                            {t("dashboard.view")} · {t("report.answers")}{" "}
                            <span aria-hidden="true">↗</span>
                          </a>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {data.recent.length === 0 && (
                  <div className="empty-table">
                    {connection === "error"
                      ? t("dashboard.apiError")
                      : t("dashboard.empty")}
                  </div>
                )}
              </div>
            </section>
          </>
        )}
        <footer className="dashboard-footer">
          <span>Inspect Hub · Quality Operations</span>
          <span>{t("dashboard.privacy")}</span>
        </footer>
      </div>
    </main>
  );
}
