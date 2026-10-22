import { ViewSkeleton } from "../components/ViewSkeleton";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { absoluteApiUrl, api, downloadFile } from "../lib/api";
import { copyText } from "../lib/clipboard";

import { DashboardFilterSelect } from "../components/DashboardFilterSelect";
import {
  dashboardDate,
  dashboardQuery,
  validDashboardRange,
} from "../lib/dashboard-dates";
import { SettingsMenu, useI18n } from "../lib/i18n";
import { appPath, appRoute } from "../lib/routing";

import { CompactSelect } from "../components/CompactSelect";
import { ReportSearch } from "../components/ReportSearch";
interface DashboardData {
  generatedAt: string;
  range: { from: string; to: string; previousFrom: string; previousTo: string };
  summary: {
    completedToday: number;
    firstPassTotal: number;
    firstPassPassed: number;
    firstPassRate: number | null;
    retestTotal: number;
    retestPassed: number;
    uniqueUnits: number;
    defectCount: number;
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
    p90DurationSeconds: number | null;
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
      firstPassTotal: number;
      firstPassPassed: number;
      firstPassRate: number | null;
    }[];
    forms: {
      key: string;
      name: string;
      total: number;
      passed: number;
      passRate: number;
      firstPassTotal: number;
      firstPassPassed: number;
      firstPassRate: number | null;
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
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
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
    firstPassTotal: 0,
    firstPassPassed: 0,
    firstPassRate: null,
    retestTotal: 0,
    retestPassed: 0,
    uniqueUnits: 0,
    defectCount: 0,
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
    p90DurationSeconds: null,
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
  pagination: { page: 1, pageSize: 20, total: 0, totalPages: 1 },
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
                {rate === null ? (
                  "–"
                ) : (
                  <>
                    <span>{rate.toFixed(1)}%</span>
                    <small>n={cell?.total}</small>
                  </>
                )}
              </div>
            );
          }),
        ])}
      </div>
    </div>
  );
}

function NokTrend({
  daily,
  onSelect,
}: {
  daily: DashboardData["daily"];
  onSelect: (date: string) => void;
}) {
  const chartRef = useRef<HTMLDivElement>(null);
  const [chartWidth, setChartWidth] = useState(720);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;

    const observer = new ResizeObserver(([entry]) => {
      if (entry.contentRect.width > 0) {
        setChartWidth(entry.contentRect.width);
      }
    });
    observer.observe(chart);
    return () => observer.disconnect();
  }, []);

  const points = daily.map((item, index) => ({
    ...item,
    nok: item.total - item.passed,
    rate: item.total ? ((item.total - item.passed) / item.total) * 100 : null,
    x: 48 + (index / Math.max(daily.length - 1, 1)) * (chartWidth - 96),
  }));
  // Missing days break the line: no inspections does not mean 0% NOK.
  const path = points
    .map((point, index) => {
      if (point.rate === null) return "";
      const command = index > 0 && points[index - 1].rate !== null ? "L" : "M";
      return `${command}${point.x},${172 - point.rate * 1.4}`;
    })
    .join(" ");
  return (
    <article className="dashboard-card nok-trend-card">
      <div className="card-heading">
        <div>
          <h2>Trend NOK w czasie</h2>
          <p>Udział inspekcji NOK we wszystkich próbach, łącznie z retestami</p>
        </div>
      </div>
      <div className="nok-trend-scroll" ref={chartRef}>
        <svg
          viewBox={`0 0 ${chartWidth} 210`}
          role="img"
          aria-label="Dzienny udział inspekcji NOK. Szczegółowe wartości i liczebność próby w tabeli poniżej."
        >
          {[0, 50, 100].map((value) => (
            <g key={value}>
              <line
                x1="48"
                x2={chartWidth - 48}
                y1={172 - value * 1.4}
                y2={172 - value * 1.4}
                stroke="currentColor"
                opacity="0.15"
              />
              <text x="40" y={176 - value * 1.4} textAnchor="end">
                {value}%
              </text>
            </g>
          ))}
          <path
            d={path}
            fill="none"
            stroke="var(--nok-trend-color, #be3e36)"
            strokeWidth="2"
          />
          {points.map((point) =>
            point.rate === null ? null : (
              <circle
                key={point.date}
                cx={point.x}
                cy={172 - point.rate * 1.4}
                r="3"
                fill="var(--nok-trend-color, #be3e36)"
              >
                <title>
                  {point.date}: {point.rate.toFixed(1)}% NOK · {point.nok}/
                  {point.total} inspekcji
                </title>
              </circle>
            ),
          )}
          {points
            .filter((_, index) => index === 0 || index === points.length - 1)
            .map((point, index) => (
              <text
                key={point.date}
                x={point.x}
                y="200"
                textAnchor={index === 0 ? "start" : "end"}
              >
                {point.date}
              </text>
            ))}
        </svg>
      </div>
      {!daily.some((item) => item.total > 0) && (
        <p className="analysis-empty">Brak inspekcji w wybranym okresie.</p>
      )}
      <details className="nok-trend-details">
        <summary>Wartości dzienne i liczebność próby</summary>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Dzień</th>
                <th>Inspekcje</th>
                <th>NOK</th>
                <th>NOK %</th>
              </tr>
            </thead>
            <tbody>
              {points.map((point) => (
                <tr key={point.date}>
                  <td>
                    <button
                      type="button"
                      className="secondary"
                      onClick={() => onSelect(point.date)}
                    >
                      {point.date}
                    </button>
                  </td>
                  <td>{point.total}</td>
                  <td>{point.nok}</td>
                  <td>
                    {point.rate === null
                      ? "Brak danych"
                      : `${point.rate.toFixed(1)}%`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
      <p className="analysis-note">
        Przerwa w linii oznacza brak inspekcji. Porównuj odsetki razem z
        liczebnością próby.
      </p>
    </article>
  );
}

export default function Dashboard() {
  const { language, locale, t } = useI18n();
  const route = (path: string) => appRoute(language, path);
  const [data, setData] = useState<DashboardData>(emptyDashboard);
  const [hasData, setHasData] = useState(false);
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
    partNumber: "",
    completeness: "",
  });
  const [appliedFilters, setAppliedFilters] = useState(filters);
  const [reportPage, setReportPage] = useState({
    filters: appliedFilters,
    page: 1,
  });
  const [reportPageSize, setReportPageSize] = useState(20);
  const requestedReportPage =
    reportPage.filters === appliedFilters ? reportPage.page : 1;
  const [heatmapType, setHeatmapType] = useState<
    "questionStation" | "time" | "formProduct"
  >("questionStation");
  const [exportBusy, setExportBusy] = useState<string | null>(null);
  const [exportNotice, setExportNotice] = useState("");

  const completenessOptions = [
    { value: "skippedQuestions", label: t("dashboard.skippedQuestions") },
    { value: "unusuallyFast", label: t("dashboard.unusuallyFast") },
    { value: "frequentCorrections", label: t("dashboard.frequentCorrections") },
  ];
  const activeCompletenessLabel = completenessOptions.find(
    (option) => option.value === appliedFilters.completeness,
  )?.label;

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
    setExportNotice("");
    try {
      await copyText(url);
      setExportNotice("Skopiowano adres API z aktywnymi filtrami.");
    } catch {
      setExportNotice(`Nie udało się skopiować. Skopiuj adres ręcznie: ${url}`);
    }
  }
  const reportsRef = useRef<HTMLElement>(null);
  const pendingReportsScroll = useRef(false);

  const drillDown = (
    patch: Partial<typeof filters>,
    options: { scroll?: boolean } = { scroll: true },
  ) => {
    const next = { ...appliedFilters, ...patch };
    setFilters(next);
    setAppliedFilters(next);
    pendingReportsScroll.current = options.scroll !== false;
  };

  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (active) setConnection("loading");
    });
    const query = dashboardQuery(appliedFilters);
    query.set("page", String(requestedReportPage));
    query.set("pageSize", String(reportPageSize));
    void api<DashboardData>(`/inspections/public-dashboard?${query}`)
      .then((result) => {
        if (!active) return;
        setData(result);
        setHasData(true);
        setConnection("live");
      })
      .catch(() => {
        if (active) setConnection("error");
      });
    return () => {
      active = false;
    };
  }, [appliedFilters, requestedReportPage, reportPageSize]);

  useEffect(() => {
    if (connection === "live" && pendingReportsScroll.current) {
      reportsRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
      pendingReportsScroll.current = false;
    }
  }, [connection, data]);

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
            <DashboardFilterSelect
              label={t("dashboard.completeness")}
              placeholder={t("dashboard.allInspections")}
              value={filters.completeness}
              options={completenessOptions}
              onChange={(completeness) =>
                setFilters({ ...filters, completeness })
              }
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
            <label className="search-filter">
              {t("common.partNumber")}
              <input
                type="search"
                placeholder="Part number"
                value={filters.partNumber}
                onChange={(event) =>
                  setFilters({ ...filters, partNumber: event.target.value })
                }
              />
            </label>
          </div>
          <div className="filter-footer">
            {!dateRangeValid && (
              <p className="filter-error" role="alert">
                Wybierz prawidłowy zakres dat: Od nie może być później niż Do.
              </p>
            )}
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
                    partNumber: "",
                    completeness: "",
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
              <small className="export-notice" role="status">
                {exportNotice}
              </small>
            )}
          </div>
        </section>

        {!hasData && connection === "loading" ? (
          <ViewSkeleton variant="dashboard" />
        ) : !hasData && connection === "error" ? (
          <section className="dashboard-card analysis-card" role="alert">
            <h2>Nie udało się pobrać danych</h2>
            <p>Wskaźniki będą dostępne po nawiązaniu połączenia z API.</p>
            <button
              type="button"
              className="secondary"
              onClick={() => window.location.reload()}
            >
              Spróbuj ponownie
            </button>
          </section>
        ) : (
          <div
            className="dashboard-results"
            aria-busy={connection === "loading"}
          >
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
                  <strong>
                    {data.summary.firstPassRate === null
                      ? "—"
                      : `${data.summary.firstPassRate.toFixed(1)}%`}
                  </strong>
                  <small>
                    {data.summary.firstPassPassed} OK /{" "}
                    {data.summary.firstPassTotal} pierwszych kontroli
                  </small>
                </div>
                <i className="metric-progress">
                  <b
                    style={{
                      width: `${Math.min(data.summary.firstPassRate ?? 0, 100)}%`,
                    }}
                  />
                </i>
              </article>
              <article className="metric-card">
                <div className="metric-icon issue">!</div>
                <div>
                  <span>Inspekcje NOK w okresie</span>
                  <strong>{data.summary.issuesToday}</strong>
                  {trend(data.summary.issuesTrend)}
                </div>
              </article>
              <article className="metric-card">
                <div className="metric-icon station">▦</div>
                <div>
                  <span>Stanowiska z inspekcjami</span>
                  <strong>{data.breakdowns.stations.length}</strong>
                  <small>W wybranym okresie i filtrach</small>
                </div>
              </article>
            </section>

            <section className="dashboard-card process-summary-card">
              <div className="card-heading">
                <div>
                  <h2>Pierwsze kontrole i retesty</h2>
                  <p>
                    Wskaźniki dotyczą inspekcji zakończonych w wybranym okresie
                    i aktywnych filtrów.
                  </p>
                </div>
              </div>
              {appliedFilters.result && (
                <p className="analysis-note" role="status">
                  Aktywny filtr wyniku zawęża także mianowniki wskaźników. Usuń
                  go, aby ocenić ogólną jakość procesu.
                </p>
              )}
              <div className="completeness-grid">
                <article>
                  <div>
                    <small>Unikalne numery seryjne / VIN</small>
                    <strong>{data.summary.uniqueUnits}</strong>
                  </div>
                </article>
                <article>
                  <div>
                    <small>Pierwsze kontrole</small>
                    <strong>{data.summary.firstPassTotal}</strong>
                    <em>
                      {data.summary.firstPassPassed} OK ·{" "}
                      {data.summary.firstPassTotal -
                        data.summary.firstPassPassed}{" "}
                      NOK
                    </em>
                  </div>
                </article>
                <article>
                  <div>
                    <small>Retesty</small>
                    <strong>{data.summary.retestTotal}</strong>
                    <em>
                      {data.summary.retestPassed} OK ·{" "}
                      {data.summary.retestTotal - data.summary.retestPassed} NOK
                    </em>
                  </div>
                </article>
                <article>
                  <div>
                    <small>Punkty kontroli NOK</small>
                    <strong>{data.summary.defectCount}</strong>
                    <em>Oceny automatyczne · kilka NOK w jednej inspekcji</em>
                  </div>
                </article>
              </div>
              <p className="analysis-note">
                FPY = pierwsze kontrole OK / wszystkie pierwsze kontrole.
                Pierwsza kontrola rozpoczyna zapisany cykl kontroli; retesty są
                z nią powiązane. Retesty w okresie mogą dotyczyć pierwszej
                kontroli sprzed tego okresu. Wynik retestu nie potwierdza
                wykonania naprawy.
              </p>
              <p className="analysis-note">
                Pokrycie kontrolą: brak danych o liczbie sztuk wymagających
                kontroli. Liczba inspekcji obejmuje kolejne próby tej samej
                sztuki; unikalne numery są liczone łącznie dla wybranych
                standardów.
              </p>
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
                    <h2>Udział wyników OK</h2>
                    <p>Wszystkie próby, łącznie z retestami</p>
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
                      {data.summary.completedToday
                        ? data.summary.passRate.toFixed(1)
                        : "—"}
                      {data.summary.completedToday > 0 && <small>%</small>}
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
                    {data.summary.completedToday
                      ? `${data.summary.mesSyncRate.toFixed(1)}%`
                      : "—"}{" "}
                    <i />
                  </strong>
                </div>
              </aside>
            </section>

            <NokTrend
              daily={data.daily}
              onSelect={(date) =>
                drillDown({ from: date, to: date, result: "" })
              }
            />

            <section className="dashboard-card completeness-card">
              <div className="card-heading">
                <div>
                  <h2>{t("dashboard.completeness")}</h2>
                  <p>
                    Czas wykonania inspekcji i sygnały jakości kontroli. Pomiar
                    nie obejmuje pełnego cyklu produkcyjnego.
                  </p>
                </div>
                <span className="completeness-sample">
                  Czas: {data.completeness.durationSampleSize} /{" "}
                  {data.summary.completedToday} inspekcji · brak pomiaru:{" "}
                  {data.summary.completedToday -
                    data.completeness.durationSampleSize}
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
                  <div>
                    <small>P90 czasu inspekcji</small>
                    <strong>
                      {duration(data.completeness.p90DurationSeconds)}
                    </strong>
                    <em>90% zmierzonych inspekcji trwało nie dłużej</em>
                  </div>
                </article>
                <button
                  type="button"
                  className="completeness-filter"
                  aria-pressed={
                    appliedFilters.completeness === "skippedQuestions"
                  }
                  title={t("dashboard.filterReports")}
                  onClick={() =>
                    drillDown({
                      completeness:
                        appliedFilters.completeness === "skippedQuestions"
                          ? ""
                          : "skippedQuestions",
                    })
                  }
                >
                  <span className="completeness-icon skipped">○</span>
                  <div>
                    <small>{t("dashboard.skippedQuestions")}</small>
                    <strong>{data.completeness.skippedQuestions}</strong>
                    <em>{data.completeness.skippedRate.toFixed(1)}%</em>
                  </div>
                </button>
                <button
                  type="button"
                  className="completeness-filter"
                  aria-pressed={appliedFilters.completeness === "unusuallyFast"}
                  title={t("dashboard.filterReports")}
                  onClick={() =>
                    drillDown({
                      completeness:
                        appliedFilters.completeness === "unusuallyFast"
                          ? ""
                          : "unusuallyFast",
                    })
                  }
                >
                  <span className="completeness-icon fast">⚡</span>
                  <div>
                    <small>{t("dashboard.unusuallyFast")}</small>
                    <strong>{data.completeness.unusuallyFast}</strong>
                    <em>{t("dashboard.fastThreshold")}</em>
                  </div>
                </button>
                <button
                  type="button"
                  className="completeness-filter"
                  aria-pressed={
                    appliedFilters.completeness === "frequentCorrections"
                  }
                  title={t("dashboard.filterReports")}
                  onClick={() =>
                    drillDown({
                      completeness:
                        appliedFilters.completeness === "frequentCorrections"
                          ? ""
                          : "frequentCorrections",
                    })
                  }
                >
                  <span className="completeness-icon corrections">↻</span>
                  <div>
                    <small>{t("dashboard.frequentCorrections")}</small>
                    <strong>{data.completeness.frequentCorrections}</strong>
                    <em>{t("dashboard.correctionsThreshold")}</em>
                  </div>
                </button>
              </div>
              {data.completeness.durationByForm.length > 0 && (
                <div className="duration-by-form">
                  <strong>
                    Czas inspekcji według standardu · wybrane rewizje łącznie
                  </strong>
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
                    <h2>Najczęstsze punkty NOK</h2>
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
                    <p>
                      {heatmapType === "questionStation"
                        ? "Udział ocen NOK danego pytania"
                        : "Udział inspekcji NOK, łącznie z retestami"}
                    </p>
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
                      Godzina × dzień tygodnia
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
                {heatmapType === "formProduct" && (
                  <p className="analysis-note">
                    Produkt oznacza rodzinę produktu, numer części lub — gdy ich
                    brak — numer seryjny.
                  </p>
                )}
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
                    <p>Najniższy FPY · minimum 30 pierwszych kontroli</p>
                  </div>
                </div>
                <div className="ranking-list">
                  {[...data.breakdowns.stations]
                    .filter((item) => item.firstPassTotal >= 30)
                    .sort(
                      (a, b) =>
                        (a.firstPassRate ?? 100) - (b.firstPassRate ?? 100),
                    )
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
                            <b
                              style={{ width: `${item.firstPassRate ?? 0}%` }}
                            />
                          </i>
                          <strong>
                            {item.firstPassRate === null
                              ? "—"
                              : `${item.firstPassRate.toFixed(1)}%`}
                          </strong>
                          <small>
                            {item.firstPassPassed}/{item.firstPassTotal}{" "}
                            pierwszych OK · {item.total} prób
                          </small>
                        </div>
                      </button>
                    ))}
                  {!data.breakdowns.stations.some(
                    (item) => item.firstPassTotal >= 30,
                  ) && (
                    <div className="analysis-empty">
                      Brak stanowisk z co najmniej 30 pierwszymi kontrolami.
                    </div>
                  )}
                  <p className="analysis-note">
                    Poza rankingiem:{" "}
                    {
                      data.breakdowns.stations.filter(
                        (item) => item.firstPassTotal < 30,
                      ).length
                    }{" "}
                    stanowisk z mniejszą próbą. Próg 30 służy selekcji rankingu;
                    nie gwarantuje wiarygodności statystycznej.
                  </p>
                </div>
              </article>
              <article className="dashboard-card analysis-card">
                <div className="card-heading">
                  <div>
                    <h2>Jakość według standardu</h2>
                    <p>
                      FPY pierwszych kontroli i NOK wszystkich prób · podział
                      według rewizji
                    </p>
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
                        <strong>
                          {item.name} · rew.{" "}
                          {data.filters.forms.find(
                            (form) => form.id === item.key,
                          )?.version ?? "—"}
                        </strong>
                        <small>
                          {item.total - item.passed} niezgodnych z {item.total}
                        </small>
                      </div>
                      <div className="ranking-meter">
                        <i>
                          <b style={{ width: `${item.firstPassRate ?? 0}%` }} />
                        </i>
                        <strong>
                          {item.firstPassRate === null
                            ? "—"
                            : `${item.firstPassRate.toFixed(1)}%`}
                        </strong>
                        <small>
                          FPY · n={item.firstPassTotal}
                          {item.firstPassTotal < 30 ? " · mała próba" : ""}
                        </small>
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
                  {t("dashboard.reportCount", { count: data.pagination.total })}
                </span>
              </div>
              {activeCompletenessLabel && (
                <div className="completeness-active-filter" role="status">
                  <span>
                    {t("dashboard.completeness")}:{" "}
                    <strong>{activeCompletenessLabel}</strong>
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      drillDown({ completeness: "" }, { scroll: false })
                    }
                  >
                    {t("dashboard.clearCompleteness")}
                  </button>
                </div>
              )}
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
              <div className="reports-pagination">
                <span aria-live="polite">
                  {t("stations.range", {
                    from: data.pagination.total
                      ? (data.pagination.page - 1) * data.pagination.pageSize +
                        1
                      : 0,
                    to: Math.min(
                      data.pagination.page * data.pagination.pageSize,
                      data.pagination.total,
                    ),
                    count: data.pagination.total,
                  })}
                </span>
                <div className="reports-page-size">
                  <span>{t("stations.perPage")}</span>
                  <CompactSelect
                    label={t("stations.perPage")}
                    value={String(reportPageSize)}
                    placement="top"
                    options={[20, 50, 100].map((size) => ({
                      value: String(size),
                      label: String(size),
                    }))}
                    onChange={(value) => {
                      setReportPageSize(Number(value));
                      setReportPage({ filters: appliedFilters, page: 1 });
                    }}
                  />
                </div>
                <div className="reports-page-buttons">
                  <button
                    className="secondary"
                    type="button"
                    disabled={
                      connection === "loading" || data.pagination.page === 1
                    }
                    onClick={() =>
                      setReportPage({
                        filters: appliedFilters,
                        page: data.pagination.page - 1,
                      })
                    }
                  >
                    {t("stations.previous")}
                  </button>
                  <span>
                    {data.pagination.page} / {data.pagination.totalPages}
                  </span>
                  <button
                    className="secondary"
                    type="button"
                    disabled={
                      connection === "loading" ||
                      data.pagination.page === data.pagination.totalPages
                    }
                    onClick={() =>
                      setReportPage({
                        filters: appliedFilters,
                        page: data.pagination.page + 1,
                      })
                    }
                  >
                    {t("stations.next")}
                  </button>
                </div>
              </div>
              {connection === "error" && (
                <p role="alert">{t("dashboard.apiError")}</p>
              )}
            </section>
          </div>
        )}
        <footer className="dashboard-footer">
          <span>Inspect Hub · Quality Operations</span>
          <span>{t("dashboard.privacy")}</span>
        </footer>
      </div>
    </main>
  );
}
