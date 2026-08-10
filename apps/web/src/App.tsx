import {
  Fragment,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
} from "react";
import type {
  FieldType,
  InspectionAnswerValue,
  InspectionForm,
  InspectionQuestion,
  QuestionSeverity,
  PublicInspectionReport,
  RouteCheckResult,
  ScadaSettings,
  Station,
} from "@inspect-hub/types";
import {
  ApiError,
  absoluteApiUrl,
  api,
  downloadFile,
  qualityWebSocketUrl,
  uploadImage,
  type CardLoginResult,
  type Session,
  type SessionUser,
} from "./lib/api";
import "./App.css";
import { SettingsMenu, useI18n, type Language } from "./lib/i18n";

function createClientId(): string {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }
  return `question-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

const emptyQuestion = (): InspectionQuestion => ({
  id: createClientId(),
  label: "",
  type: "CHECKBOX",
  isRequired: true,
  severity: "NORMAL",
});

function parseOptionsInput(value: string): string[] {
  return value.split(",");
}

function normalizeOptions(options?: string[]): string[] | undefined {
  return options?.map((option) => option.trim()).filter(Boolean);
}

function isPassedStatus(status: string): boolean {
  return ["PASSED", "PASS", "OK", "ZDAŁ", "ZDAL"].includes(
    status.toUpperCase(),
  );
}

function canAssessAutomatically(question: InspectionQuestion): boolean {
  return (
    question.expectedValue !== undefined ||
    (question.type === "NUMBER_RANGE" && question.range !== undefined)
  );
}

function questionSeverity(question: InspectionQuestion): QuestionSeverity {
  return question.severity ?? (question.isCritical ? "CRITICAL" : "NORMAL");
}

function isQuestionAnswerOk(
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

function removeEmptyOptions(question: InspectionQuestion): InspectionQuestion {
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

function localizeQuestion(
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

const NEW_FORM_DRAFT_KEY = "inspect-hub-form-draft:new";
const OFFLINE_INSPECTION_QUEUE_KEY = "inspect-hub-offline-inspections";
const OFFLINE_INSPECTION_CONTEXT_KEY = "inspect-hub-offline-context";

type QueuedInspection = { id: string; payload: Record<string, unknown> };

function readInspectionQueue(): QueuedInspection[] {
  try {
    return JSON.parse(
      localStorage.getItem(OFFLINE_INSPECTION_QUEUE_KEY) ?? "[]",
    ) as QueuedInspection[];
  } catch {
    return [];
  }
}

function writeInspectionQueue(queue: QueuedInspection[]) {
  localStorage.setItem(OFFLINE_INSPECTION_QUEUE_KEY, JSON.stringify(queue));
}

type NewFormDraft = {
  title: string;
  code: string;
  statuses: string[];
  nokStreakThreshold: number;
  requiresLogin: boolean;
  processIds: string[];
  questions: InspectionQuestion[];
  updatedAt: string;
};

function readNewFormDraft(): NewFormDraft | null {
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

function hasNewFormDraftContent(draft: Omit<NewFormDraft, "updatedAt">) {
  return Boolean(
    draft.title ||
    draft.code ||
    draft.processIds.length ||
    draft.nokStreakThreshold !== 3 ||
    draft.requiresLogin ||
    draft.questions.length > 1 ||
    draft.questions.some(
      (question) =>
        question.label ||
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

function AdminMenuIcon({
  type,
}: {
  type: "forms" | "stations" | "users" | "settings" | "logs";
}) {
  if (type === "forms") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M9 5.5h9M9 12h9M9 18.5h9" />
        <path d="m3.5 5.5 1.2 1.2 2.1-2.4M3.5 12l1.2 1.2 2.1-2.4M3.5 18.5l1.2 1.2 2.1-2.4" />
      </svg>
    );
  }
  if (type === "stations")
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 20V8.5L9 5v15M9 10h11v10M2.5 20h19" />
        <path d="M12.5 13.5h1M17 13.5h1M12.5 17h1M17 17h1M6.5 10.5h.01M6.5 14h.01" />
      </svg>
    );
  if (type === "users")
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M16 20v-1.5a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4V20M9 10.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z" />
        <path d="M17 8v6M14 11h6" />
      </svg>
    );
  if (type === "logs")
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 5.5h16M4 12h16M4 18.5h16" />
        <path d="M7 3v5M12 9.5v5M17 16v5" />
      </svg>
    );
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z" />
      <path d="M19 12a7 7 0 0 0-.1-1l2-1.6-2-3.4-2.5 1A8 8 0 0 0 14.7 6L14.3 3h-4.6l-.4 3A8 8 0 0 0 7.6 7L5.1 6l-2 3.4L5.1 11a7 7 0 0 0 0 2l-2 1.6 2 3.4 2.5-1a8 8 0 0 0 1.7 1l.4 3h4.6l.4-3a8 8 0 0 0 1.7-1l2.5 1 2-3.4-2-1.6a7 7 0 0 0 .1-1Z" />
    </svg>
  );
}

type AuditEvent = {
  id: string;
  occurredAt: string;
  receivedAt: string;
  type: string;
  category: string;
  severity: "DEBUG" | "INFO" | "WARNING" | "ERROR" | "CRITICAL";
  outcome: "SUCCESS" | "FAILURE" | "UNKNOWN";
  source: string;
  correlationId: string;
  actorId?: string;
  actorType?: string;
  stationCode?: string;
  entityType?: string;
  entityId?: string;
  payload: Record<string, unknown>;
  payloadHash: string;
};

function AuditEventsPanel() {
  const { locale, t } = useI18n();
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [type, setType] = useState("");
  const [stationCode, setStationCode] = useState("");
  const [correlationId, setCorrelationId] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState("");

  async function load() {
    setLoading(true);
    setNotice("");
    const query = new URLSearchParams({ limit: "250" });
    if (type.trim()) query.set("type", type.trim());
    if (stationCode.trim()) query.set("stationCode", stationCode.trim());
    if (correlationId.trim()) query.set("correlationId", correlationId.trim());
    if (from) query.set("from", new Date(from).toISOString());
    if (to) query.set("to", new Date(to).toISOString());
    try {
      setEvents(await api<AuditEvent[]>(`/events?${query.toString()}`));
    } catch (error) {
      setNotice(error instanceof Error ? error.message : t("logs.loadError"));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void api<AuditEvent[]>("/events?limit=250")
      .then(setEvents)
      .catch((error: Error) => setNotice(error.message))
      .finally(() => setLoading(false));
  }, []);

  function reset() {
    setType("");
    setStationCode("");
    setCorrelationId("");
    setFrom("");
    setTo("");
  }

  const dateFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(locale, {
        dateStyle: "short",
        timeStyle: "medium",
      }),
    [locale],
  );

  return (
    <section className="panel audit-events">
      <form
        className="audit-filters"
        onSubmit={(event) => {
          event.preventDefault();
          void load();
        }}
      >
        <label>
          {t("logs.type")}
          <input
            value={type}
            onChange={(event) => setType(event.target.value)}
            placeholder="INSPECTION_COMPLETED"
          />
        </label>
        <label>
          {t("logs.station")}
          <input
            value={stationCode}
            onChange={(event) => setStationCode(event.target.value)}
            placeholder="ST-01"
          />
        </label>
        <label>
          Correlation ID
          <input
            value={correlationId}
            onChange={(event) => setCorrelationId(event.target.value)}
          />
        </label>
        <label>
          {t("logs.from")}
          <input
            type="datetime-local"
            value={from}
            onChange={(event) => setFrom(event.target.value)}
          />
        </label>
        <label>
          {t("logs.to")}
          <input
            type="datetime-local"
            value={to}
            onChange={(event) => setTo(event.target.value)}
          />
        </label>
        <div className="audit-filter-actions">
          <button className="secondary" type="button" onClick={reset}>
            {t("logs.clear")}
          </button>
          <button type="submit" disabled={loading}>
            {loading ? t("common.loading") : t("logs.filter")}
          </button>
        </div>
      </form>
      <div className="audit-table-heading">
        <span className="table-count">
          {t("logs.count", { count: events.length })}
        </span>
        <small>{t("logs.utcHint")}</small>
      </div>
      {notice && <p className="notice">{notice}</p>}
      <div className="table-scroll audit-table-scroll">
        <table>
          <thead>
            <tr>
              <th>{t("logs.time")}</th>
              <th>{t("logs.event")}</th>
              <th>{t("logs.severity")}</th>
              <th>{t("logs.outcome")}</th>
              <th>{t("logs.context")}</th>
              <th>{t("logs.details")}</th>
            </tr>
          </thead>
          <tbody>
            {events.map((item) => (
              <Fragment key={item.id}>
                <tr>
                  <td>
                    <strong>
                      {dateFormatter.format(new Date(item.occurredAt))}
                    </strong>
                    <small>{item.source}</small>
                  </td>
                  <td>
                    <strong>{item.type}</strong>
                    <small>{item.category}</small>
                  </td>
                  <td>
                    <span
                      className={`audit-badge severity-${item.severity.toLowerCase()}`}
                    >
                      {item.severity}
                    </span>
                  </td>
                  <td>
                    <span
                      className={`audit-badge outcome-${item.outcome.toLowerCase()}`}
                    >
                      {item.outcome}
                    </span>
                  </td>
                  <td>
                    <strong>{item.stationCode ?? item.actorType ?? "—"}</strong>
                    <small title={item.correlationId}>
                      {item.correlationId}
                    </small>
                  </td>
                  <td>
                    <button
                      className="secondary audit-details-button"
                      type="button"
                      aria-expanded={expandedId === item.id}
                      onClick={() =>
                        setExpandedId((current) =>
                          current === item.id ? null : item.id,
                        )
                      }
                    >
                      {expandedId === item.id ? t("logs.hide") : t("logs.show")}
                    </button>
                  </td>
                </tr>
                {expandedId === item.id && (
                  <tr className="audit-detail-row">
                    <td colSpan={6}>
                      <dl>
                        <div>
                          <dt>ID</dt>
                          <dd>{item.id}</dd>
                        </div>
                        <div>
                          <dt>Correlation ID</dt>
                          <dd>{item.correlationId}</dd>
                        </div>
                        <div>
                          <dt>{t("logs.entity")}</dt>
                          <dd>
                            {item.entityType && item.entityId
                              ? `${item.entityType} · ${item.entityId}`
                              : "—"}
                          </dd>
                        </div>
                        <div>
                          <dt>SHA-256</dt>
                          <dd>{item.payloadHash}</dd>
                        </div>
                      </dl>
                      <pre>{JSON.stringify(item.payload, null, 2)}</pre>
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
            {!loading && events.length === 0 && (
              <tr>
                <td className="audit-empty" colSpan={6}>
                  {t("logs.empty")}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function ScadaSettingsPanel() {
  const { t } = useI18n();
  const [settings, setSettings] = useState<ScadaSettings | null>(null);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void api<ScadaSettings>("/scada/settings")
      .then(setSettings)
      .catch((error: Error) => setNotice(error.message));
  }, []);

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!settings) return;
    setBusy(true);
    setNotice("");
    try {
      setSettings(
        await api<ScadaSettings>("/scada/settings", {
          method: "PATCH",
          body: JSON.stringify(settings),
        }),
      );
      setNotice(t("notice.scadaSaved"));
    } catch (error) {
      setNotice(error instanceof Error ? error.message : t("notice.saveError"));
    } finally {
      setBusy(false);
    }
  }

  if (!settings)
    return <section className="panel">{notice || t("scada.loading")}</section>;
  const update = <K extends keyof ScadaSettings>(
    key: K,
    value: ScadaSettings[K],
  ) =>
    setSettings((current) =>
      current ? { ...current, [key]: value } : current,
    );

  return (
    <form className="panel scada-settings" onSubmit={save}>
      <header className="scada-settings-header">
        <div className="scada-settings-title">
          <p className="eyebrow">{t("scada.eyebrow")}</p>
          <h2>Connector SCADA</h2>
          <p>{t("scada.description")}</p>
        </div>
        <label className="scada-toggle">
          <input
            type="checkbox"
            checked={settings.enabled}
            onChange={(event) => update("enabled", event.target.checked)}
          />
          <span className="scada-toggle-track" aria-hidden="true">
            <i />
          </span>
          <span>{settings.enabled ? "SCADA" : t("scada.simulation")}</span>
        </label>
      </header>
      <div className="scada-settings-body">
        <div className="scada-info">
          <span aria-hidden="true">↔</span>
          <p>{t("scada.info")}</p>
        </div>
        <div className="settings-grid">
          <label>
            {t("scada.baseUrl")}
            <input
              type="url"
              value={settings.baseUrl}
              onChange={(e) => update("baseUrl", e.target.value)}
              placeholder="http://scada.local:8080"
              required={settings.enabled}
            />
            <small>{t("scada.baseUrlHelp")}</small>
          </label>
          <label>
            {t("scada.publicUrl")}
            <input
              type="url"
              value={settings.publicWebUrl}
              onChange={(e) => update("publicWebUrl", e.target.value)}
              required
            />
            <small>{t("scada.publicUrlHelp")}</small>
          </label>
          <label>
            {t("scada.routePath")}
            <input
              value={settings.routeCheckPath}
              onChange={(e) => update("routeCheckPath", e.target.value)}
              required
            />
          </label>
          <label>
            {t("scada.resultPath")}
            <input
              value={settings.submitResultPath}
              onChange={(e) => update("submitResultPath", e.target.value)}
              required
            />
          </label>
          <label className="timeout-field">
            {t("scada.timeout")}
            <div className="input-with-suffix">
              <input
                type="number"
                min="500"
                max="30000"
                value={settings.timeoutMs}
                onChange={(e) => update("timeoutMs", Number(e.target.value))}
                required
              />
              <span>ms</span>
            </div>
          </label>
        </div>
        {notice && <p className="notice">{notice}</p>}
      </div>
      <footer className="scada-settings-actions">
        <span>
          {settings.enabled ? t("scada.liveHelp") : t("scada.devHelp")}
        </span>
        <button className="primary" disabled={busy}>
          {busy ? t("scada.saving") : t("scada.save")}
        </button>
      </footer>
    </form>
  );
}

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

function dashboardDate(daysAgo: number, end = false) {
  const date = new Date();
  date.setDate(date.getDate() - daysAgo);
  if (!end) date.setHours(0, 0, 0, 0);
  return date.toISOString().slice(0, 10);
}

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

function Dashboard() {
  const { language, locale, t } = useI18n();
  const route = (path: string) =>
    `/${language === "uk" ? "ua" : language}${path}`;
  const [data, setData] = useState<DashboardData>(emptyDashboard);
  const [connection, setConnection] = useState<"loading" | "live" | "error">(
    "loading",
  );
  const [filters, setFilters] = useState({
    from: dashboardDate(6),
    to: dashboardDate(0, true),
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

  function analyticsQuery(selected = appliedFilters) {
    const query = new URLSearchParams();
    query.set("from", new Date(`${selected.from}T00:00:00`).toISOString());
    query.set("to", new Date(`${selected.to}T23:59:59.999`).toISOString());
    Object.entries(selected).forEach(([key, value]) => {
      if (Array.isArray(value) && value.length) query.set(key, value.join(","));
      else if (
        typeof value === "string" &&
        value &&
        key !== "from" &&
        key !== "to"
      )
        query.set(key, value);
    });
    return query;
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
    queueMicrotask(() => setConnection("loading"));
    const query = new URLSearchParams();
    query.set(
      "from",
      new Date(`${appliedFilters.from}T00:00:00`).toISOString(),
    );
    const rangeEnd = new Date(`${appliedFilters.to}T23:59:59.999`);
    query.set("to", rangeEnd.toISOString());
    Object.entries(appliedFilters).forEach(([key, value]) => {
      if (Array.isArray(value) && value.length) query.set(key, value.join(","));
      else if (
        typeof value === "string" &&
        value &&
        key !== "from" &&
        key !== "to"
      )
        query.set(key, value);
    });
    void api<DashboardData>(`/inspections/public-dashboard?${query}`)
      .then((result) => {
        setData(result);
        setConnection("live");
      })
      .catch(() => setConnection("error"));
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
          <span>IH</span>
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
          <div className="dashboard-updated">
            <span>{t("dashboard.dataAsOf")}</span>
            <strong>{time(data.generatedAt)}</strong>
            <small>{t("dashboard.loadedOnOpen")}</small>
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
              {filters.from} — {filters.to}
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
            <label>
              Proces
              <select
                value={filters.processId}
                onChange={(event) =>
                  setFilters({
                    ...filters,
                    processId: event.target.value,
                    stationId: "",
                  })
                }
              >
                <option value="">Wszystkie procesy</option>
                {data.filters.processes.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Stanowisko
              <select
                value={filters.stationId}
                onChange={(event) =>
                  setFilters({ ...filters, stationId: event.target.value })
                }
              >
                <option value="">Wszystkie stanowiska</option>
                {data.filters.stations
                  .filter(
                    (item) =>
                      !filters.processId ||
                      item.processId === filters.processId,
                  )
                  .map((item) => (
                    <option key={item.id} value={item.code}>
                      {item.code} · {item.name}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              Standard
              <select
                value={filters.formCode}
                onChange={(event) =>
                  setFilters({
                    ...filters,
                    formCode: event.target.value,
                    formIds: [],
                  })
                }
              >
                <option value="">Wszystkie standardy</option>
                {standards.map((item) => (
                  <option key={item.code} value={item.code}>
                    {item.title} · {item.code}
                  </option>
                ))}
              </select>
            </label>
            <RevisionMultiSelect
              revisions={availableRevisions}
              selected={filters.formIds}
              disabled={!filters.formCode}
              onChange={(formIds) => setFilters({ ...filters, formIds })}
            />
            <label>
              Wynik
              <select
                value={filters.result}
                onChange={(event) =>
                  setFilters({ ...filters, result: event.target.value })
                }
              >
                <option value="">Wszystkie wyniki</option>
                <option value="pass">Tylko zgodne</option>
                <option value="fail">Tylko niezgodne</option>
              </select>
            </label>
            <label className="search-filter">
              Produkt
              <input
                type="search"
                placeholder="Numer seryjny / VIN"
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
                disabled={connection === "loading"}
                onClick={() => setAppliedFilters(filters)}
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
              <small className="export-notice">{exportNotice}</small>
            )}
          </div>
        </section>

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
                style={{ width: `${Math.min(data.summary.passRate, 100)}%` }}
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
                        style={{ height: `${(item.total / maxTotal) * 100}%` }}
                      />
                      <i
                        className="bar-pass"
                        style={{ height: `${(item.passed / maxTotal) * 100}%` }}
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
                  className={heatmapType === "questionStation" ? "active" : ""}
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
                        href={route(`/reports/${item.publicReportId}#answers`)}
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
        <footer className="dashboard-footer">
          <span>Inspect Hub · Quality Operations</span>
          <span>{t("dashboard.privacy")}</span>
        </footer>
      </div>
    </main>
  );
}

function Login({ onLogin }: { onLogin: (session: Session) => void }) {
  const { t } = useI18n();
  const cardInput = useRef<HTMLInputElement>(null);
  const [identifier, setIdentifier] = useState("");
  const [cardCode, setCardCode] = useState("");
  const [pairingRequired, setPairingRequired] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submitCard(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const result = pairingRequired
        ? await api<Session>("/auth/pair-card", {
            method: "POST",
            body: JSON.stringify({ identifier, cardCode }),
          })
        : await api<CardLoginResult>("/auth/card-login", {
            method: "POST",
            body: JSON.stringify({ identifier }),
          });
      if ("requiresPairing" in result) {
        setPairingRequired(true);
        return;
      }
      onLogin(result);
    } catch (reason) {
      if (pairingRequired) setCardCode("");
      else setIdentifier("");
      setError(reason instanceof Error ? reason.message : t("login.cardError"));
      window.setTimeout(() => cardInput.current?.focus(), 0);
    } finally {
      setBusy(false);
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const session = await api<Session>("/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      onLogin(session);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t("login.error"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-shell">
      <div className="auth-settings">
        <SettingsMenu />
      </div>
      <section className="auth-card">
        <div className="brand-mark">IH</div>
        <p className="eyebrow">{t("common.qualityOperations")}</p>
        <h1>Inspect Hub</h1>
        <p className="muted">{t("login.tagline")}</p>
        <form className="card-login-form" onSubmit={submitCard}>
          <div className="card-reader-icon" aria-hidden="true">
            ▣
          </div>
          <h2>{t("login.cardTitle")}</h2>
          <p className="muted">{t("login.cardHint")}</p>
          <label className="card-identifier-label">
            {t("login.cardIdentifier")}
            <input
              ref={cardInput}
              inputMode="text"
              autoComplete="off"
              pattern="[A-Za-z0-9]+"
              maxLength={30}
              value={identifier}
              onChange={(event) =>
                setIdentifier(
                  event.target.value.replace(/[^A-Za-z0-9]/g, "").toUpperCase(),
                )
              }
              autoFocus
              required
              readOnly={pairingRequired}
            />
          </label>
          {pairingRequired && (
            <label className="card-identifier-label">
              {t("login.cardCode")}
              <input
                inputMode="numeric"
                autoComplete="off"
                pattern="[0-9]{4}"
                maxLength={4}
                value={cardCode}
                onChange={(event) =>
                  setCardCode(event.target.value.replace(/\D/g, ""))
                }
                autoFocus
                required
              />
              <small>{t("login.cardCodeHint")}</small>
            </label>
          )}
          {error && <p className="error">{error}</p>}
          <button className="primary" disabled={busy}>
            {busy ? t("login.cardBusy") : t("login.cardButton")}
          </button>
        </form>
        <details className="password-login">
          <summary>{t("login.adminLogin")}</summary>
          <form onSubmit={submit}>
            <label>
              Email
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </label>
            <label>
              {t("login.password")}
              <input
                type="password"
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </label>
            <button className="primary" disabled={busy}>
              {busy ? t("login.busy") : t("common.login")}
            </button>
          </form>
        </details>
        <p className="auth-note">{t("login.note")}</p>
      </section>
    </main>
  );
}

function StationsManager({
  stations,
  onChange,
}: {
  stations: Station[];
  onChange: () => Promise<void>;
}) {
  const { t } = useI18n();
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [processName, setProcessName] = useState("");
  const [drafts, setDrafts] = useState<
    Record<string, { code: string; name: string; processName: string }>
  >({});
  const [notice, setNotice] = useState("");
  const [busyId, setBusyId] = useState("");

  async function createStation(event: FormEvent) {
    event.preventDefault();
    setBusyId("new");
    setNotice("");
    try {
      await api("/stations", {
        method: "POST",
        body: JSON.stringify({
          code,
          name,
          processName,
        }),
      });
      setCode("");
      setName("");
      setProcessName("");
      setNotice(t("notice.stationAdded"));
      await onChange();
    } catch (reason) {
      setNotice(
        reason instanceof Error ? reason.message : t("notice.saveError"),
      );
    } finally {
      setBusyId("");
    }
  }

  async function updateStation(station: Station, patch?: Partial<Station>) {
    setBusyId(station.id);
    setNotice("");
    const draft = drafts[station.id] ?? station;
    try {
      await api(`/stations/${station.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          code: draft.code,
          name: draft.name,
          processName: draft.processName,
          ...patch,
        }),
      });
      setDrafts((current) => {
        const next = { ...current };
        delete next[station.id];
        return next;
      });
      setNotice(t("notice.stationUpdated"));
      await onChange();
    } catch (reason) {
      setNotice(
        reason instanceof Error ? reason.message : t("notice.saveError"),
      );
    } finally {
      setBusyId("");
    }
  }

  async function removeStation(station: Station) {
    if (!window.confirm(t("confirm.removeStation", { code: station.code })))
      return;
    setBusyId(station.id);
    setNotice("");
    try {
      await api(`/stations/${station.id}`, { method: "DELETE" });
      setNotice(t("notice.stationRemoved"));
      await onChange();
    } catch (reason) {
      setNotice(
        reason instanceof Error ? reason.message : t("notice.saveError"),
      );
    } finally {
      setBusyId("");
    }
  }

  return (
    <section className="panel stations-manager">
      <div className="stations-heading">
        <div>
          <p className="eyebrow">{t("stations.configuration")}</p>
          <h2>{t("admin.stations")}</h2>
          <p className="muted">{t("stations.description")}</p>
        </div>
        <span className="table-count">
          {t("stations.count", { count: stations.length })}
        </span>
      </div>
      <form className="station-create" onSubmit={createStation}>
        <label>
          {t("stations.code")}
          <input
            value={code}
            onChange={(event) => setCode(event.target.value.toUpperCase())}
            placeholder="ST-001"
            required
          />
        </label>
        <label>
          {t("stations.name")}
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder={t("placeholder.finalInspection")}
            required
          />
        </label>
        <label>
          {t("stations.process")}
          <input
            value={processName}
            onChange={(event) => setProcessName(event.target.value)}
            placeholder={t("placeholder.finalInspection")}
            required
          />
        </label>
        <button className="primary" disabled={busyId === "new"}>
          {busyId === "new" ? t("stations.adding") : t("stations.add")}
        </button>
      </form>
      <div className="station-list">
        {stations.map((station) => {
          const draft = drafts[station.id] ?? {
            code: station.code,
            name: station.name,
            processName: station.process?.name ?? "",
          };
          return (
            <article
              className={
                station.active ? "station-row" : "station-row inactive"
              }
              key={station.id}
            >
              <input
                aria-label={t("aria.stationCode", { code: station.code })}
                value={draft.code}
                onChange={(event) =>
                  setDrafts({
                    ...drafts,
                    [station.id]: {
                      ...draft,
                      code: event.target.value.toUpperCase(),
                    },
                  })
                }
              />
              <div className="station-name-field">
                <input
                  aria-label={t("aria.stationName", { code: station.code })}
                  value={draft.name}
                  onChange={(event) =>
                    setDrafts({
                      ...drafts,
                      [station.id]: { ...draft, name: event.target.value },
                    })
                  }
                />
                <small>IP: {station.ipAddress ?? t("stations.unpaired")}</small>
              </div>
              <input
                aria-label={t("aria.stationProcess", { code: station.code })}
                value={draft.processName}
                placeholder={t("stations.processName")}
                onChange={(event) =>
                  setDrafts({
                    ...drafts,
                    [station.id]: { ...draft, processName: event.target.value },
                  })
                }
              />
              <span
                className={
                  station.active ? "station-state active" : "station-state"
                }
              >
                {station.active ? t("stations.active") : t("stations.inactive")}
              </span>
              <div className="station-actions">
                <button
                  className="secondary"
                  type="button"
                  disabled={busyId === station.id}
                  onClick={() => void updateStation(station)}
                >
                  {t("common.save")}
                </button>
                <button
                  className="secondary"
                  type="button"
                  disabled={busyId === station.id}
                  onClick={() =>
                    void updateStation(station, { active: !station.active })
                  }
                >
                  {station.active
                    ? t("stations.deactivate")
                    : t("stations.activate")}
                </button>
                <button
                  className="icon-button danger"
                  type="button"
                  disabled={busyId === station.id}
                  onClick={() => void removeStation(station)}
                >
                  {t("common.delete")}
                </button>
              </div>
            </article>
          );
        })}
        {stations.length === 0 && (
          <p className="muted station-list-empty">{t("stations.empty")}</p>
        )}
      </div>
      {notice && <p className="notice">{notice}</p>}
    </section>
  );
}

interface ManagedUser extends SessionUser {
  createdAt: string;
}

function UsersManager() {
  const { locale, t } = useI18n();
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<SessionUser["role"]>("OPERATOR");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState("");

  async function loadUsers() {
    setUsers(await api<ManagedUser[]>("/users"));
  }

  useEffect(() => {
    void api<ManagedUser[]>("/users")
      .then((data) => setUsers(data))
      .catch((reason: Error) => setNotice(reason.message));
  }, []);

  async function createUser(event: FormEvent) {
    event.preventDefault();
    setBusyId("new");
    try {
      await api("/users", {
        method: "POST",
        body: JSON.stringify({ name, email, password, role }),
      });
      setName("");
      setEmail("");
      setPassword("");
      setRole("OPERATOR");
      await loadUsers();
      setNotice(t("notice.userCreated"));
    } catch (reason) {
      setNotice(
        reason instanceof Error ? reason.message : t("notice.saveError"),
      );
    } finally {
      setBusyId(null);
    }
  }

  async function changeRole(user: ManagedUser, nextRole: SessionUser["role"]) {
    setBusyId(user.id);
    try {
      await api(`/users/${user.id}`, {
        method: "PATCH",
        body: JSON.stringify({ role: nextRole }),
      });
      await loadUsers();
      setNotice(t("notice.userRole"));
    } catch (reason) {
      setNotice(
        reason instanceof Error ? reason.message : t("notice.saveError"),
      );
    } finally {
      setBusyId(null);
    }
  }

  async function removeUser(user: ManagedUser) {
    if (!window.confirm(t("confirm.removeUser", { email: user.email }))) return;
    setBusyId(user.id);
    try {
      await api(`/users/${user.id}`, { method: "DELETE" });
      await loadUsers();
      setNotice(t("notice.userRemoved"));
    } catch (reason) {
      setNotice(
        reason instanceof Error ? reason.message : t("notice.saveError"),
      );
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section className="panel users-manager">
      <div className="stations-heading">
        <div>
          <p className="eyebrow">{t("users.heading")}</p>
          <h2>{t("admin.users")}</h2>
        </div>
        <span className="status-dot">
          {t("users.count", { count: users.length })}
        </span>
      </div>
      <form className="user-create" onSubmit={createUser}>
        <label>
          {t("users.fullName")}
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            required
            minLength={2}
          />
        </label>
        <label>
          Email
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
        </label>
        <label>
          {t("users.password")}
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
            minLength={8}
          />
        </label>
        <label>
          {t("users.role")}
          <select
            value={role}
            onChange={(event) =>
              setRole(event.target.value as SessionUser["role"])
            }
          >
            <option value="OPERATOR">{t("users.operator")}</option>
            <option value="ADMIN">{t("users.admin")}</option>
          </select>
        </label>
        <button className="primary" disabled={busyId === "new"}>
          {busyId === "new" ? t("users.creating") : t("users.add")}
        </button>
      </form>
      <div className="user-list">
        {users.map((user) => (
          <article className="user-row" key={user.id}>
            <div className="user-avatar">
              {user.name.slice(0, 2).toUpperCase()}
            </div>
            <div className="user-identity">
              <strong>{user.name}</strong>
              <span>{user.email}</span>
            </div>
            <small>
              {new Intl.DateTimeFormat(locale).format(new Date(user.createdAt))}
            </small>
            <select
              aria-label={t("aria.userRole", { name: user.name })}
              value={user.role}
              disabled={busyId === user.id}
              onChange={(event) =>
                void changeRole(user, event.target.value as SessionUser["role"])
              }
            >
              <option value="OPERATOR">{t("users.operator")}</option>
              <option value="ADMIN">{t("users.admin")}</option>
            </select>
            <button
              className="icon-button danger"
              type="button"
              disabled={busyId === user.id}
              onClick={() => void removeUser(user)}
            >
              {t("common.delete")}
            </button>
          </article>
        ))}
      </div>
      {notice && <p className="notice">{notice}</p>}
    </section>
  );
}

function AdminPanel() {
  const { locale, t } = useI18n();
  const initialDraft = useMemo(() => readNewFormDraft(), []);
  const [section, setSection] = useState<
    "forms-new" | "forms-edit" | "stations" | "users" | "settings" | "logs"
  >("forms-new");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(
    () => localStorage.getItem("inspect-hub-admin-sidebar") === "collapsed",
  );
  const [title, setTitle] = useState(initialDraft?.title ?? "");
  const [code, setCode] = useState(initialDraft?.code ?? "");
  const [statuses, setStatuses] = useState(
    initialDraft?.statuses ?? ["PASSED", "FAILED"],
  );
  const [nokStreakThreshold, setNokStreakThreshold] = useState(
    initialDraft?.nokStreakThreshold ?? 3,
  );
  const [requiresLogin, setRequiresLogin] = useState(
    initialDraft?.requiresLogin ?? false,
  );
  const [processIds, setProcessIds] = useState<string[]>(
    initialDraft?.processIds ?? [],
  );
  const [questions, setQuestions] = useState<InspectionQuestion[]>(
    initialDraft?.questions.length ? initialDraft.questions : [emptyQuestion()],
  );
  const [draftSavedAt, setDraftSavedAt] = useState(
    initialDraft?.updatedAt ?? "",
  );
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [stations, setStations] = useState<Station[]>([]);
  const [forms, setForms] = useState<InspectionForm[]>([]);
  const [editingForm, setEditingForm] = useState<InspectionForm | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewIndex, setPreviewIndex] = useState(0);
  const [revisions, setRevisions] = useState<InspectionForm[]>([]);
  const processes = useMemo(
    () =>
      [
        ...new Map(
          stations.flatMap((station) =>
            station.process
              ? [[station.process.id, station.process] as const]
              : [],
          ),
        ).values(),
      ].sort((left, right) => left.name.localeCompare(right.name, locale)),
    [locale, stations],
  );

  async function loadForms() {
    setForms(await api<InspectionForm[]>("/forms"));
  }

  async function loadStations() {
    const data = await api<Station[]>("/stations");
    setStations(data);
    setProcessIds((current) =>
      current.filter((id) =>
        data.some((station) => station.process?.id === id),
      ),
    );
  }

  useEffect(() => {
    void Promise.all([
      api<Station[]>("/stations"),
      api<InspectionForm[]>("/forms"),
    ])
      .then(([stationData, formData]) => {
        setStations(stationData);
        setForms(formData);
      })
      .catch((reason: Error) => setNotice(reason.message));
  }, []);

  useEffect(() => {
    if (section !== "forms-new") return;
    const content = {
      title,
      code,
      statuses,
      nokStreakThreshold,
      requiresLogin,
      processIds,
      questions,
    };
    if (!hasNewFormDraftContent(content)) {
      localStorage.removeItem(NEW_FORM_DRAFT_KEY);
      const timeout = window.setTimeout(() => setDraftSavedAt(""), 0);
      return () => window.clearTimeout(timeout);
    }
    const timeout = window.setTimeout(() => {
      const updatedAt = new Date().toISOString();
      try {
        localStorage.setItem(
          NEW_FORM_DRAFT_KEY,
          JSON.stringify({ ...content, updatedAt } satisfies NewFormDraft),
        );
        setDraftSavedAt(updatedAt);
      } catch {
        setNotice(t("notice.draftSaveError"));
      }
    }, 300);
    return () => window.clearTimeout(timeout);
  }, [
    code,
    nokStreakThreshold,
    requiresLogin,
    processIds,
    questions,
    section,
    statuses,
    t,
    title,
  ]);

  async function editForm(form: InspectionForm) {
    setSection("forms-edit");
    setEditingForm(form);
    setTitle(form.title);
    setCode(form.code);
    setStatuses([...form.allowedStatuses]);
    setNokStreakThreshold(form.nokStreakThreshold);
    setRequiresLogin(form.requiresLogin);
    setProcessIds([...form.processIds]);
    setQuestions(structuredClone(form.questions));
    setNotice("");
    try {
      setRevisions(await api<InspectionForm[]>(`/forms/${form.id}/revisions`));
    } catch (reason) {
      setNotice(
        reason instanceof Error ? reason.message : t("notice.revisionsError"),
      );
    }
  }

  async function archiveForm(form: InspectionForm) {
    if (!window.confirm(t("confirm.archiveForm", { title: form.title })))
      return;
    setBusy(true);
    try {
      await api<void>(`/forms/${form.id}/archive`, { method: "PATCH" });
      if (editingForm?.code === form.code) {
        setEditingForm(null);
        setRevisions([]);
      }
      await loadForms();
      setNotice(t("notice.formArchived"));
    } catch (reason) {
      setNotice(
        reason instanceof Error ? reason.message : t("notice.archiveError"),
      );
    } finally {
      setBusy(false);
    }
  }

  async function duplicateForm(form: InspectionForm) {
    const title = window.prompt(
      "Nazwa nowego formularza",
      `${form.title} — kopia`,
    );
    if (!title?.trim()) return;
    const code = window.prompt("Nowy kod formularza", `${form.code}-COPY`);
    if (!code?.trim()) return;
    setBusy(true);
    try {
      await api<InspectionForm>(`/forms/${form.id}/duplicate`, {
        method: "POST",
        body: JSON.stringify({ title: title.trim(), code: code.trim() }),
      });
      await loadForms();
      setNotice("Formularz został zduplikowany jako nowy standard.");
    } catch (reason) {
      setNotice(
        reason instanceof Error
          ? reason.message
          : "Nie udało się zduplikować formularza",
      );
    } finally {
      setBusy(false);
    }
  }

  function startNewForm() {
    const draft = readNewFormDraft();
    setSection("forms-new");
    setEditingForm(null);
    setTitle(draft?.title ?? "");
    setCode(draft?.code ?? "");
    setStatuses(draft?.statuses ?? ["PASSED", "FAILED"]);
    setNokStreakThreshold(draft?.nokStreakThreshold ?? 3);
    setRequiresLogin(draft?.requiresLogin ?? false);
    setProcessIds(draft?.processIds ?? []);
    setQuestions(draft?.questions.length ? draft.questions : [emptyQuestion()]);
    setDraftSavedAt(draft?.updatedAt ?? "");
    setRevisions([]);
    setNotice("");
  }

  function updateQuestion(id: string, patch: Partial<InspectionQuestion>) {
    setQuestions((items) =>
      items.map((item) => (item.id === id ? { ...item, ...patch } : item)),
    );
  }

  function updateQuestionTranslation(
    question: InspectionQuestion,
    language: "en" | "uk",
    patch: { label?: string; description?: string; options?: string[] },
  ) {
    updateQuestion(question.id, {
      translations: {
        ...question.translations,
        [language]: {
          ...question.translations?.[language],
          ...patch,
        },
      },
    });
  }

  function changeQuestionType(id: string, type: FieldType) {
    updateQuestion(id, {
      type,
      expectedValue: undefined,
      range: undefined,
      okImageUrl: undefined,
      nokImageUrl: undefined,
    });
  }

  function updateNumberRange(
    question: InspectionQuestion,
    bound: "min" | "max",
    rawValue: string,
  ) {
    const range = {
      ...question.range,
      [bound]: rawValue === "" ? undefined : Number(rawValue),
    };
    updateQuestion(question.id, {
      range:
        range.min === undefined && range.max === undefined
          ? undefined
          : (range as InspectionQuestion["range"]),
    });
  }

  async function uploadInstruction(id: string, file?: File) {
    if (!file) return;
    setBusy(true);
    try {
      updateQuestion(id, { instructionImageUrl: await uploadImage(file) });
      setNotice(t("notice.instructionUploaded"));
    } catch (reason) {
      setNotice(
        reason instanceof Error ? reason.message : t("notice.uploadError"),
      );
    } finally {
      setBusy(false);
    }
  }

  async function uploadAnswerImage(
    id: string,
    answer: "ok" | "nok",
    file?: File,
  ) {
    if (!file) return;
    setBusy(true);
    try {
      const imageUrl = await uploadImage(file);
      updateQuestion(
        id,
        answer === "ok" ? { okImageUrl: imageUrl } : { nokImageUrl: imageUrl },
      );
      setNotice(
        t("notice.referenceUploaded", { answer: answer.toUpperCase() }),
      );
    } catch (reason) {
      setNotice(
        reason instanceof Error ? reason.message : t("notice.uploadError"),
      );
    } finally {
      setBusy(false);
    }
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      const saved = await api<InspectionForm>(
        editingForm ? `/forms/${editingForm.id}` : "/forms",
        {
          method: editingForm ? "PATCH" : "POST",
          body: JSON.stringify({
            title,
            ...(!editingForm ? { code } : {}),
            allowedStatuses: statuses.filter(Boolean),
            nokStreakThreshold,
            requiresLogin,
            questions: questions.map(removeEmptyOptions),
            processIds,
          }),
        },
      );
      await loadForms();
      if (editingForm) await editForm(saved);
      else {
        localStorage.removeItem(NEW_FORM_DRAFT_KEY);
        setTitle("");
        setCode("");
        setStatuses(["PASSED", "FAILED"]);
        setNokStreakThreshold(3);
        setRequiresLogin(false);
        setProcessIds([]);
        setQuestions([emptyQuestion()]);
        setDraftSavedAt("");
      }
      setNotice(
        editingForm
          ? t("notice.revisionPublished", { version: saved.version })
          : t("notice.formPublished"),
      );
    } catch (reason) {
      setNotice(
        reason instanceof Error ? reason.message : t("notice.saveError"),
      );
    } finally {
      setBusy(false);
    }
  }

  function toggleSidebar() {
    setSidebarCollapsed((current) => {
      const next = !current;
      localStorage.setItem(
        "inspect-hub-admin-sidebar",
        next ? "collapsed" : "expanded",
      );
      return next;
    });
  }

  return (
    <div
      className={
        sidebarCollapsed ? "admin-layout sidebar-collapsed" : "admin-layout"
      }
    >
      <aside className="admin-sidebar">
        <div className="admin-sidebar-header">
          <div className="admin-sidebar-title">
            <span>ADMIN</span>
            <strong>{t("admin.management")}</strong>
          </div>
          <button
            className="sidebar-toggle"
            type="button"
            onClick={toggleSidebar}
            aria-label={
              sidebarCollapsed ? t("admin.expand") : t("admin.collapse")
            }
            title={sidebarCollapsed ? t("admin.expand") : t("admin.collapse")}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d={sidebarCollapsed ? "m9 5 7 7-7 7" : "m15 5-7 7 7 7"} />
            </svg>
          </button>
        </div>
        <nav className="admin-menu" aria-label={t("admin.sections")}>
          <div className="admin-menu-group">
            <button
              className={section.startsWith("forms-") ? "active" : ""}
              type="button"
              onClick={startNewForm}
              title={sidebarCollapsed ? t("admin.forms") : undefined}
            >
              <i>
                <AdminMenuIcon type="forms" />
              </i>
              <span>
                {t("admin.forms")}
                <small>{t("admin.formsSubtitle")}</small>
              </span>
            </button>
            <div
              className={
                section.startsWith("forms-")
                  ? "admin-submenu expanded"
                  : "admin-submenu"
              }
              aria-hidden={!section.startsWith("forms-")}
            >
              <button
                className={section === "forms-new" ? "active" : ""}
                type="button"
                onClick={startNewForm}
                title={sidebarCollapsed ? t("admin.newForm") : undefined}
              >
                <i aria-hidden="true">＋</i>
                <span>{t("admin.newForm")}</span>
              </button>
              <button
                className={section === "forms-edit" ? "active" : ""}
                type="button"
                onClick={() => setSection("forms-edit")}
                title={sidebarCollapsed ? t("admin.editForms") : undefined}
              >
                <i aria-hidden="true">✎</i>
                <span>{t("admin.editForms")}</span>
              </button>
            </div>
          </div>
          <button
            className={section === "stations" ? "active" : ""}
            type="button"
            onClick={() => setSection("stations")}
            title={sidebarCollapsed ? t("admin.stations") : undefined}
          >
            <i>
              <AdminMenuIcon type="stations" />
            </i>
            <span>
              {t("admin.stations")}
              <small>{t("admin.stationsSubtitle")}</small>
            </span>
          </button>
          <button
            className={section === "users" ? "active" : ""}
            type="button"
            onClick={() => setSection("users")}
            title={sidebarCollapsed ? t("admin.users") : undefined}
          >
            <i>
              <AdminMenuIcon type="users" />
            </i>
            <span>
              {t("admin.users")}
              <small>{t("admin.usersSubtitle")}</small>
            </span>
          </button>
          <button
            className={section === "logs" ? "active" : ""}
            type="button"
            onClick={() => setSection("logs")}
            title={sidebarCollapsed ? t("admin.logs") : undefined}
          >
            <i>
              <AdminMenuIcon type="logs" />
            </i>
            <span>
              {t("admin.logs")}
              <small>{t("admin.logsSubtitle")}</small>
            </span>
          </button>
          <button
            className={section === "settings" ? "active" : ""}
            type="button"
            onClick={() => setSection("settings")}
            title={sidebarCollapsed ? t("admin.scada") : undefined}
          >
            <i>
              <AdminMenuIcon type="settings" />
            </i>
            <span>
              {t("admin.scada")}
              <small>{t("admin.scadaSubtitle")}</small>
            </span>
          </button>
        </nav>
      </aside>
      <div className="workspace admin-content">
        <header className="page-heading">
          <div>
            <p className="eyebrow">{t("admin.panel")}</p>
            <h1>
              {section === "forms-new"
                ? t("admin.newTitle")
                : section === "forms-edit"
                  ? editingForm
                    ? `Edycja: ${editingForm.code}`
                    : t("admin.editForms")
                  : section === "stations"
                    ? t("admin.stationsTitle")
                    : section === "users"
                      ? t("admin.usersTitle")
                      : section === "logs"
                        ? t("admin.logsTitle")
                        : t("admin.scadaTitle")}
            </h1>
            <p className="heading-copy">
              {section === "forms-new"
                ? t("admin.newHelp")
                : section === "forms-edit"
                  ? t("admin.editHelp")
                  : section === "stations"
                    ? t("admin.stationsHelp")
                    : section === "users"
                      ? t("admin.usersHelp")
                      : section === "logs"
                        ? t("admin.logsHelp")
                        : t("admin.scadaHelp")}
            </p>
          </div>
          {section.startsWith("forms-") && (
            <span className="status-dot">
              {section === "forms-edit" && editingForm
                ? t("form.newRevision", { version: editingForm.version + 1 })
                : section === "forms-edit"
                  ? t("form.formCount", { count: forms.length })
                  : draftSavedAt
                    ? t("form.draftSaved", {
                        time: new Intl.DateTimeFormat(locale, {
                          hour: "2-digit",
                          minute: "2-digit",
                        }).format(new Date(draftSavedAt)),
                      })
                    : t("form.draft")}
            </span>
          )}
        </header>
        {section === "logs" ? (
          <AuditEventsPanel />
        ) : section === "settings" ? (
          <ScadaSettingsPanel />
        ) : section === "users" ? (
          <UsersManager />
        ) : section === "stations" ? (
          <StationsManager stations={stations} onChange={loadStations} />
        ) : section.startsWith("forms-") ? (
          <>
            {section === "forms-edit" && (
              <section className="panel forms-library">
                <div className="forms-library-heading">
                  <div>
                    <p className="eyebrow">{t("form.published")}</p>
                    <h2>{t("form.existing")}</h2>
                  </div>
                </div>
                <div className="forms-list">
                  {forms.map((form) => (
                    <article
                      className={
                        editingForm?.code === form.code
                          ? "form-row selected"
                          : "form-row"
                      }
                      key={form.id}
                    >
                      <div>
                        <strong>{form.title}</strong>
                        <span>{form.code}</span>
                      </div>
                      <span className="revision-badge">v{form.version}</span>
                      <small>
                        {t("form.counts", {
                          questions: form.questions.length,
                          processes: form.processIds.length,
                        })}
                      </small>
                      <div className="form-actions">
                        <button
                          className="secondary"
                          type="button"
                          disabled={busy}
                          onClick={() => void duplicateForm(form)}
                        >
                          Duplikuj
                        </button>
                        <button
                          className="secondary"
                          type="button"
                          disabled={busy}
                          onClick={() => void editForm(form)}
                        >
                          {t("form.edit")}
                        </button>
                        <button
                          className="secondary archive-button"
                          type="button"
                          disabled={busy}
                          onClick={() => void archiveForm(form)}
                        >
                          {t("form.archive")}
                        </button>
                      </div>
                    </article>
                  ))}
                  {forms.length === 0 && (
                    <p className="muted">{t("form.empty")}</p>
                  )}
                </div>
                {editingForm && revisions.length > 0 && (
                  <div className="revision-history">
                    <strong>
                      {t("form.history", { code: editingForm.code })}
                    </strong>
                    <div>
                      {revisions.map((revision) => (
                        <span key={revision.id}>
                          <b>v{revision.version}</b>
                          {new Intl.DateTimeFormat(locale, {
                            dateStyle: "medium",
                            timeStyle: "short",
                          }).format(new Date(revision.createdAt))}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </section>
            )}
            {(section === "forms-new" || editingForm) && (
              <form onSubmit={save} className="builder-grid">
                <section className="panel settings">
                  <h2>{t("form.settings")}</h2>
                  <label>
                    {t("form.titleLabel")}
                    <input
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      placeholder={t("placeholder.finalDoorInspection")}
                      required
                    />
                  </label>
                  <label>
                    Kod formularza
                    <input
                      value={code}
                      onChange={(e) => setCode(e.target.value.toUpperCase())}
                      placeholder="QC-DOOR-01"
                      required
                      disabled={Boolean(editingForm)}
                    />
                  </label>
                  <label>{t("form.finalStatuses")}</label>
                  <div className="tags">
                    {statuses.map((status, index) => (
                      <span className="tag" key={`${status}-${index}`}>
                        {status}
                        <button
                          type="button"
                          onClick={() =>
                            setStatuses(statuses.filter((_, i) => i !== index))
                          }
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                  <input
                    placeholder={t("form.addStatus")}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        const value = e.currentTarget.value.trim();
                        if (value) setStatuses([...statuses, value]);
                        e.currentTarget.value = "";
                      }
                    }}
                  />
                  <div className="tip">
                    <strong>{t("form.statusInfo")}</strong>
                    <br />
                    {t("form.statusTip")}
                  </div>
                  <label>
                    Próg serii NOK
                    <input
                      type="number"
                      min="2"
                      max="100"
                      step="1"
                      value={nokStreakThreshold}
                      onChange={(event) =>
                        setNokStreakThreshold(Number(event.target.value))
                      }
                      required
                    />
                    <small>
                      Alert pojawi się po tylu kolejnych wynikach NOK na tym
                      samym stanowisku dla tego formularza.
                    </small>
                  </label>
                  <label className="form-login-toggle">
                    <input
                      type="checkbox"
                      checked={requiresLogin}
                      onChange={(event) =>
                        setRequiresLogin(event.target.checked)
                      }
                    />
                    <span
                      className="form-login-toggle-track"
                      aria-hidden="true"
                    >
                      <i />
                    </span>
                    <span className="form-login-toggle-copy">
                      <strong>{t("form.requiresLogin")}</strong>
                      <small>{t("form.requiresLoginHelp")}</small>
                    </span>
                  </label>
                  <label>{t("form.assignedProcesses")}</label>
                  <div className="station-picker">
                    {processes.map((process) => (
                      <label className="station-pick" key={process.id}>
                        <input
                          type="checkbox"
                          checked={processIds.includes(process.id)}
                          onChange={(event) =>
                            setProcessIds(
                              event.target.checked
                                ? [...processIds, process.id]
                                : processIds.filter(
                                    (item) => item !== process.id,
                                  ),
                            )
                          }
                        />
                        <span>
                          <strong>{t("form.process")}</strong>
                          {process.name}
                        </span>
                      </label>
                    ))}
                    {processes.length === 0 && (
                      <span className="muted">{t("form.noProcesses")}</span>
                    )}
                  </div>
                  <div className="tip">{t("form.processTip")}</div>
                </section>
                <section className="questions-column">
                  {questions.map((question, index) => (
                    <article className="panel question-card" key={question.id}>
                      <div className="question-head">
                        <span className="question-number">
                          {String(index + 1).padStart(2, "0")}
                        </span>
                        <button
                          className="icon-button"
                          type="button"
                          onClick={() =>
                            setQuestions(
                              questions.filter(
                                (item) => item.id !== question.id,
                              ),
                            )
                          }
                        >
                          {t("common.delete")}
                        </button>
                      </div>
                      <label>
                        {t("form.questionContent")}
                        <input
                          value={question.label}
                          onChange={(e) =>
                            updateQuestion(question.id, {
                              label: e.target.value,
                            })
                          }
                          placeholder={t("form.questionPlaceholder")}
                          required
                        />
                      </label>
                      <details className="question-translations">
                        <summary>
                          <span>{t("form.translations")}</span>
                          <small>{t("form.translationsHelp")}</small>
                        </summary>
                        <div className="translation-grid">
                          {(["en", "uk"] as const).map(
                            (translationLanguage) => {
                              const translation =
                                question.translations?.[translationLanguage];
                              return (
                                <fieldset key={translationLanguage}>
                                  <legend>
                                    {translationLanguage === "en"
                                      ? t("language.english")
                                      : t("language.ukrainian")}
                                  </legend>
                                  <label>
                                    {t("form.translatedLabel")}
                                    <input
                                      value={translation?.label ?? ""}
                                      onChange={(event) =>
                                        updateQuestionTranslation(
                                          question,
                                          translationLanguage,
                                          {
                                            label: event.target.value,
                                          },
                                        )
                                      }
                                      placeholder={
                                        question.label ||
                                        t("form.questionPlaceholder")
                                      }
                                    />
                                  </label>
                                  <label>
                                    {t("form.translatedDescription")}
                                    <textarea
                                      value={translation?.description ?? ""}
                                      onChange={(event) =>
                                        updateQuestionTranslation(
                                          question,
                                          translationLanguage,
                                          {
                                            description: event.target.value,
                                          },
                                        )
                                      }
                                    />
                                  </label>
                                  {question.type === "SELECT" && (
                                    <label>
                                      {t("form.translatedOptions")}
                                      <input
                                        value={
                                          translation?.options?.join(",") ?? ""
                                        }
                                        onChange={(event) =>
                                          updateQuestionTranslation(
                                            question,
                                            translationLanguage,
                                            {
                                              options: parseOptionsInput(
                                                event.target.value,
                                              ),
                                            },
                                          )
                                        }
                                        placeholder={question.options?.join(
                                          ", ",
                                        )}
                                      />
                                    </label>
                                  )}
                                </fieldset>
                              );
                            },
                          )}
                        </div>
                      </details>
                      <div className="inline-fields">
                        <label>
                          {t("form.type")}
                          <select
                            value={question.type}
                            onChange={(e) =>
                              changeQuestionType(
                                question.id,
                                e.target.value as FieldType,
                              )
                            }
                          >
                            <option value="CHECKBOX">
                              {t("form.checkbox")}
                            </option>
                            <option value="TEXT">{t("form.text")}</option>
                            <option value="SELECT">{t("form.list")}</option>
                            <option value="PHOTO_UPLOAD">
                              {t("form.photo")}
                            </option>
                            <option value="NUMBER_RANGE">
                              {t("form.numeric")}
                            </option>
                          </select>
                        </label>
                        <label className="check">
                          <input
                            type="checkbox"
                            checked={question.isRequired}
                            onChange={(e) =>
                              updateQuestion(question.id, {
                                isRequired: e.target.checked,
                              })
                            }
                          />{" "}
                          {t("form.required")}
                        </label>
                        <label>
                          Poziom ważności
                          <select
                            value={
                              question.severity ??
                              (question.isCritical ? "CRITICAL" : "NORMAL")
                            }
                            onChange={(event) =>
                              updateQuestion(question.id, {
                                severity: event.target
                                  .value as QuestionSeverity,
                                isCritical: undefined,
                              })
                            }
                          >
                            <option value="NORMAL">Zwykłe</option>
                            <option value="MAJOR">Major</option>
                            <option value="CRITICAL">Critical</option>
                          </select>
                        </label>
                      </div>
                      {question.type === "SELECT" && (
                        <label>
                          {t("form.options")}
                          <input
                            value={question.options?.join(",") ?? ""}
                            onChange={(e) =>
                              updateQuestion(question.id, {
                                options: parseOptionsInput(e.target.value),
                              })
                            }
                          />
                        </label>
                      )}
                      {question.type === "CHECKBOX" ? (
                        <label>
                          {t("form.expectedValue")}
                          <select
                            value={
                              question.expectedValue === undefined
                                ? ""
                                : String(question.expectedValue)
                            }
                            onChange={(e) =>
                              updateQuestion(question.id, {
                                expectedValue:
                                  e.target.value === ""
                                    ? undefined
                                    : e.target.value === "true",
                              })
                            }
                          >
                            <option value="">{t("form.unspecified")}</option>
                            <option value="true">{t("common.yes")}</option>
                            <option value="false">{t("common.no")}</option>
                          </select>
                        </label>
                      ) : question.type === "SELECT" ? (
                        <label>
                          {t("form.expectedValue")}
                          <select
                            value={String(question.expectedValue ?? "")}
                            onChange={(e) =>
                              updateQuestion(question.id, {
                                expectedValue: e.target.value || undefined,
                              })
                            }
                          >
                            <option value="">{t("form.unspecified")}</option>
                            {question.options?.map((option) => (
                              <option value={option} key={option}>
                                {option}
                              </option>
                            ))}
                          </select>
                        </label>
                      ) : (
                        <label>
                          {t("form.expectedValue")}
                          <input
                            type={
                              question.type === "NUMBER_RANGE"
                                ? "number"
                                : "text"
                            }
                            value={String(question.expectedValue ?? "")}
                            onChange={(e) =>
                              updateQuestion(question.id, {
                                expectedValue:
                                  e.target.value === ""
                                    ? undefined
                                    : question.type === "NUMBER_RANGE"
                                      ? Number(e.target.value)
                                      : e.target.value,
                              })
                            }
                            placeholder={t("form.expectedPlaceholder")}
                          />
                        </label>
                      )}
                      {question.type === "NUMBER_RANGE" && (
                        <div className="range-fields">
                          <label>
                            {t("form.rangeFrom")}
                            <input
                              type="number"
                              value={question.range?.min ?? ""}
                              onChange={(e) =>
                                updateNumberRange(
                                  question,
                                  "min",
                                  e.target.value,
                                )
                              }
                            />
                          </label>
                          <label>
                            {t("form.rangeTo")}
                            <input
                              type="number"
                              value={question.range?.max ?? ""}
                              onChange={(e) =>
                                updateNumberRange(
                                  question,
                                  "max",
                                  e.target.value,
                                )
                              }
                            />
                          </label>
                        </div>
                      )}
                      {question.type === "CHECKBOX" && (
                        <div className="answer-image-fields">
                          <label className="upload-box answer-image-upload">
                            {question.okImageUrl ? (
                              <>
                                <img
                                  src={question.okImageUrl}
                                  alt="Wzorzec OK"
                                />
                                <span>{t("form.okReady")}</span>
                              </>
                            ) : (
                              t("form.addOk")
                            )}
                            <input
                              type="file"
                              accept="image/png,image/jpeg,image/webp"
                              onChange={(e) =>
                                void uploadAnswerImage(
                                  question.id,
                                  "ok",
                                  e.target.files?.[0],
                                )
                              }
                            />
                          </label>
                          <label className="upload-box answer-image-upload nok">
                            {question.nokImageUrl ? (
                              <>
                                <img
                                  src={question.nokImageUrl}
                                  alt="Wzorzec NOK"
                                />
                                <span>{t("form.nokReady")}</span>
                              </>
                            ) : (
                              t("form.addNok")
                            )}
                            <input
                              type="file"
                              accept="image/png,image/jpeg,image/webp"
                              onChange={(e) =>
                                void uploadAnswerImage(
                                  question.id,
                                  "nok",
                                  e.target.files?.[0],
                                )
                              }
                            />
                          </label>
                        </div>
                      )}
                      <label className="upload-box">
                        {question.instructionImageUrl
                          ? t("form.instructionReady")
                          : t("form.addInstruction")}
                        <input
                          type="file"
                          accept="image/png,image/jpeg,image/webp"
                          onChange={(e) =>
                            void uploadInstruction(
                              question.id,
                              e.target.files?.[0],
                            )
                          }
                        />
                      </label>
                    </article>
                  ))}
                  <button
                    className="add-question"
                    type="button"
                    onClick={() =>
                      setQuestions([...questions, emptyQuestion()])
                    }
                  >
                    {t("form.addQuestion")}
                  </button>
                  <button
                    className="secondary form-preview-button"
                    type="button"
                    onClick={() => {
                      setPreviewIndex(0);
                      setPreviewOpen(true);
                    }}
                  >
                    Podgląd widoku operatora
                  </button>
                  {notice && <p className="notice">{notice}</p>}
                  <button
                    className="primary publish"
                    disabled={
                      busy || statuses.length === 0 || processIds.length === 0
                    }
                  >
                    {busy
                      ? t("form.saving")
                      : editingForm
                        ? t("form.publishRevision", {
                            version: editingForm.version + 1,
                          })
                        : t("form.publish")}
                  </button>
                </section>
              </form>
            )}
          </>
        ) : null}
      </div>
      {previewOpen && (
        <div className="form-preview-overlay" role="dialog" aria-modal="true">
          <div className="form-preview-window">
            <header>
              <div>
                <small>PODGLĄD OPERATORA</small>
                <strong>{title || "Formularz bez nazwy"}</strong>
              </div>
              <button type="button" onClick={() => setPreviewOpen(false)}>
                ×
              </button>
            </header>
            {questions[previewIndex] && (
              <article className="panel operator-question question-current">
                <span className="question-number">
                  {String(previewIndex + 1).padStart(2, "0")}
                </span>
                <div className="question-body">
                  <div className="question-title">
                    <h2>
                      {questions[previewIndex].label || "Treść pytania"}
                      {questions[previewIndex].isRequired && <sup>*</sup>}
                    </h2>
                    {questionSeverity(questions[previewIndex]) !== "NORMAL" && (
                      <span
                        className={`question-severity ${questionSeverity(questions[previewIndex]).toLowerCase()}`}
                      >
                        {questionSeverity(questions[previewIndex])}
                      </span>
                    )}
                  </div>
                  {questions[previewIndex].description && (
                    <p className="muted">
                      {questions[previewIndex].description}
                    </p>
                  )}
                  {questions[previewIndex].instructionImageUrl && (
                    <img
                      className="preview-instruction"
                      src={questions[previewIndex].instructionImageUrl}
                      alt="Instrukcja"
                    />
                  )}
                  <div className="preview-answer-placeholder">
                    Miejsce na odpowiedź typu: {questions[previewIndex].type}
                  </div>
                </div>
              </article>
            )}
            <footer>
              <button
                type="button"
                className="secondary"
                disabled={previewIndex === 0}
                onClick={() => setPreviewIndex((value) => value - 1)}
              >
                ← Poprzednie
              </button>
              <span>
                {previewIndex + 1} / {questions.length}
              </span>
              <button
                type="button"
                className="primary"
                disabled={previewIndex >= questions.length - 1}
                onClick={() => setPreviewIndex((value) => value + 1)}
              >
                Następne →
              </button>
            </footer>
          </div>
        </div>
      )}
    </div>
  );
}

function OperatorPanel({
  user,
  onLogin,
  onLogout,
}: {
  user: SessionUser | null;
  onLogin: (session: Session) => void;
  onLogout?: () => void;
}) {
  const { language, t } = useI18n();
  const operatorCardInput = useRef<HTMLInputElement>(null);
  const [loginOpen, setLoginOpen] = useState(false);
  const [loginIdentifier, setLoginIdentifier] = useState("");
  const [loginCardCode, setLoginCardCode] = useState("");
  const [pairingRequired, setPairingRequired] = useState(false);
  const [loginBusy, setLoginBusy] = useState(false);
  const [loginError, setLoginError] = useState("");
  const [forms, setForms] = useState<InspectionForm[]>([]);
  const [formId, setFormId] = useState("");
  const [vin, setVin] = useState("");
  const [productIdentified, setProductIdentified] = useState(false);
  const [routeCheckId, setRouteCheckId] = useState<string | null>(null);
  const [product, setProduct] = useState<{
    partNumber: string;
    productFamily: string;
  } | null>(null);
  const [stationId, setStationId] = useState("");
  const [stationName, setStationName] = useState("");
  const [newStationName, setNewStationName] = useState("");
  const [newStationProcessName, setNewStationProcessName] = useState("");
  const [stationProcessId, setStationProcessId] = useState("");
  const [identifying, setIdentifying] = useState(false);
  const [status, setStatus] = useState("");
  const [offlineQueueCount, setOfflineQueueCount] = useState(
    () => readInspectionQueue().length,
  );

  useEffect(() => {
    let flushing = false;
    const flush = async () => {
      if (flushing || !navigator.onLine) return;
      flushing = true;
      const queue = readInspectionQueue();
      while (queue.length) {
        try {
          await api("/inspections", {
            method: "POST",
            body: JSON.stringify(queue[0].payload),
          });
          queue.shift();
          writeInspectionQueue(queue);
          setOfflineQueueCount(queue.length);
        } catch {
          break;
        }
      }
      flushing = false;
    };
    window.addEventListener("online", flush);
    void flush();
    return () => window.removeEventListener("online", flush);
  }, []);

  function openOperatorLogin() {
    setLoginError("");
    setLoginIdentifier("");
    setLoginCardCode("");
    setPairingRequired(false);
    setLoginOpen(true);
    window.setTimeout(() => operatorCardInput.current?.focus(), 0);
  }

  function closeOperatorLogin() {
    setLoginOpen(false);
  }

  async function loginOperator(event: FormEvent) {
    event.preventDefault();
    setLoginBusy(true);
    setLoginError("");
    try {
      const result = pairingRequired
        ? await api<Session>("/auth/pair-card", {
            method: "POST",
            body: JSON.stringify({
              identifier: loginIdentifier,
              cardCode: loginCardCode,
            }),
          })
        : await api<CardLoginResult>("/auth/card-login", {
            method: "POST",
            body: JSON.stringify({ identifier: loginIdentifier }),
          });
      if ("requiresPairing" in result) {
        setPairingRequired(true);
        return;
      }
      onLogin(result);
      setLoginOpen(false);
      if (pairingRequired) setLoginCardCode("");
      else setLoginIdentifier("");
    } catch (reason) {
      setLoginIdentifier("");
      setLoginError(
        reason instanceof Error ? reason.message : t("login.cardError"),
      );
      window.setTimeout(() => operatorCardInput.current?.focus(), 0);
    } finally {
      setLoginBusy(false);
    }
  }
  const [answers, setAnswers] = useState<Record<string, InspectionAnswerValue>>(
    {},
  );
  const inspectionStartedAt = useRef<number | null>(null);
  const correctedQuestions = useRef(new Set<string>());
  const answerAtFocus = useRef(new Map<string, InspectionAnswerValue>());
  const [notice, setNotice] = useState("");
  const [operatorNoticeKind, setOperatorNoticeKind] = useState<
    "info" | "success" | "error"
  >("info");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [showSummary, setShowSummary] = useState(false);
  const [enlargedImage, setEnlargedImage] = useState<{
    url: string;
    alt: string;
  } | null>(null);
  const form = useMemo(
    () => forms.find((item) => item.id === formId),
    [forms, formId],
  );
  const availableForms = useMemo(() => {
    if (!stationName || !stationProcessId) return [];
    return forms.filter((item) => item.processIds.includes(stationProcessId));
  }, [forms, stationName, stationProcessId]);
  const answeredCount =
    form?.questions.filter((question) => {
      const value = answers[question.id];
      return value !== undefined && value !== null && value !== "";
    }).length ?? 0;
  const progress = form?.questions.length
    ? Math.round((answeredCount / form.questions.length) * 100)
    : 0;
  const currentQuestionSource = form?.questions[questionIndex];
  const currentQuestion = currentQuestionSource
    ? localizeQuestion(currentQuestionSource, language)
    : undefined;
  const automaticStatus = useMemo(() => {
    if (!form) return null;
    const assessedQuestions = form.questions.filter(
      (question) =>
        canAssessAutomatically(question) &&
        (question.isRequired ||
          (answers[question.id] !== undefined &&
            answers[question.id] !== null &&
            answers[question.id] !== "")),
    );
    if (
      assessedQuestions.length === 0 ||
      form.questions.some(
        (question) => question.isRequired && !canAssessAutomatically(question),
      )
    )
      return null;
    const passed = assessedQuestions.every((question) =>
      isQuestionAnswerOk(question, answers[question.id]),
    );
    return (
      form.allowedStatuses.find(
        (candidate) => isPassedStatus(candidate) === passed,
      ) ?? ""
    );
  }, [answers, form]);
  const finalStatus = automaticStatus === null ? status : automaticStatus;

  function updateAnswer(
    questionId: string,
    value: InspectionAnswerValue,
    trackCorrection = true,
  ) {
    setAnswers((current) => {
      const previous = current[questionId];
      if (
        trackCorrection &&
        previous !== undefined &&
        previous !== null &&
        previous !== "" &&
        previous !== value
      ) {
        correctedQuestions.current.add(questionId);
      }
      return { ...current, [questionId]: value };
    });
  }

  function resetInspectionTelemetry() {
    inspectionStartedAt.current = null;
    correctedQuestions.current.clear();
    answerAtFocus.current.clear();
  }

  useEffect(() => {
    void Promise.all([
      api<InspectionForm[]>("/forms"),
      api<Station>("/stations/current").catch(() => null),
    ])
      .then(([data, currentStation]) => {
        localStorage.setItem(
          OFFLINE_INSPECTION_CONTEXT_KEY,
          JSON.stringify({ forms: data, station: currentStation }),
        );
        setForms(data);
        const normalizedStationId = currentStation?.code ?? "";
        setStationId(normalizedStationId);
        setStationName(currentStation?.name ?? "");
        setStationProcessId(currentStation?.process?.id ?? "");
        const firstAvailable = data.find(
          (item) =>
            Boolean(currentStation?.process) &&
            item.processIds.includes(currentStation!.process!.id),
        );
        setFormId(firstAvailable?.id ?? "");
      })
      .catch((error: Error) => {
        try {
          const cached = JSON.parse(
            localStorage.getItem(OFFLINE_INSPECTION_CONTEXT_KEY) ?? "null",
          ) as { forms: InspectionForm[]; station: Station | null } | null;
          if (!cached) throw error;
          setForms(cached.forms);
          setStationId(cached.station?.code ?? "");
          setStationName(cached.station?.name ?? "");
          setStationProcessId(cached.station?.process?.id ?? "");
          setFormId(
            cached.forms.find((item) =>
              item.processIds.includes(cached.station?.process?.id ?? ""),
            )?.id ?? "",
          );
          setNotice("Tryb offline — używane są ostatnio zapisane formularze.");
        } catch {
          setNotice(error.message);
        }
      })
      .finally(() => setLoading(false));
  }, []);

  function changeStation(rawValue: string) {
    const value = rawValue.toUpperCase();
    setStationId(value);
    setStationName("");
    setStationProcessId("");
    setFormId("");
    setAnswers({});
    setStatus("");
    setQuestionIndex(0);
    setShowSummary(false);
    setRouteCheckId(null);
    setProduct(null);
    resetInspectionTelemetry();
  }

  async function identifyStation(event: FormEvent) {
    event.preventDefault();
    if (!stationId.trim()) return;
    setIdentifying(true);
    setNotice("");
    try {
      const station = await api<Station>("/stations/identify", {
        method: "POST",
        body: JSON.stringify({
          code: stationId,
          name: newStationName || undefined,
          processName: newStationProcessName || undefined,
        }),
      });
      setStationId(station.code);
      setStationName(station.name);
      setStationProcessId(station.process?.id ?? "");
      setNewStationName("");
      setNewStationProcessName("");
      const nextForms = forms.filter(
        (item) =>
          Boolean(station.process) &&
          item.processIds.includes(station.process!.id),
      );
      setFormId(nextForms[0]?.id ?? "");
      setNotice(t("notice.stationPaired", { name: station.name }));
      setOperatorNoticeKind("success");
    } catch (error) {
      setOperatorNoticeKind("error");
      setNotice(
        error instanceof Error
          ? error.message
          : t("notice.stationIdentifyError"),
      );
    } finally {
      setIdentifying(false);
    }
  }

  useEffect(() => {
    if (!enlargedImage) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setEnlargedImage(null);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [enlargedImage]);

  async function setPhoto(questionId: string, file?: File) {
    if (!file) return;
    try {
      const url = await uploadImage(file);
      updateAnswer(questionId, url);
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : t("notice.uploadError"),
      );
    }
  }

  function finishLocalInspection(message: string) {
    setNotice(message);
    setOperatorNoticeKind("success");
    setVin("");
    setProductIdentified(false);
    setStatus("");
    setAnswers({});
    setQuestionIndex(0);
    setShowSummary(false);
    setRouteCheckId(null);
    setProduct(null);
    resetInspectionTelemetry();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!form) return;
    if (form.requiresLogin && !user) {
      setNotice(t("inspection.loginRequired"));
      setOperatorNoticeKind("error");
      openOperatorLogin();
      return;
    }
    const missing = form.questions.filter(
      (question) =>
        question.isRequired &&
        (answers[question.id] === undefined ||
          answers[question.id] === null ||
          answers[question.id] === ""),
    );
    if (missing.length) {
      setNotice(
        t("notice.requiredItems", {
          items: missing.map((question) => question.label).join(", "),
        }),
      );
      document
        .getElementById(`question-${missing[0].id}`)
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    setBusy(true);
    setNotice("");
    const clientSubmissionId = crypto.randomUUID();
    const payload = {
      clientSubmissionId,
      formId,
      routeCheckId,
      vinOrSerialNumber: vin,
      stationId,
      status: finalStatus,
      durationSeconds: inspectionStartedAt.current
        ? Math.min(
            86400,
            Math.max(
              0,
              Math.round(
                (event.timeStamp - inspectionStartedAt.current) / 1000,
              ),
            ),
          )
        : undefined,
      answerCorrections: correctedQuestions.current.size,
      answers: form.questions.map((q) => ({
        questionId: q.id,
        value: answers[q.id] ?? null,
      })),
    };
    try {
      await api("/inspections", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      finishLocalInspection(
        "Inspekcja zapisana. Wynik oczekuje na potwierdzenie SCADA.",
      );
    } catch (error) {
      if (!navigator.onLine || error instanceof TypeError) {
        const queue = readInspectionQueue();
        queue.push({ id: clientSubmissionId, payload });
        writeInspectionQueue(queue);
        setOfflineQueueCount(queue.length);
        finishLocalInspection(
          "Brak połączenia. Inspekcja została zapisana lokalnie i zostanie wysłana automatycznie po odzyskaniu sieci.",
        );
      } else {
        setOperatorNoticeKind("error");
        setNotice(
          error instanceof Error ? error.message : t("notice.saveError"),
        );
      }
    } finally {
      setBusy(false);
    }
  }

  async function identifyProduct(event: FormEvent) {
    event.preventDefault();
    const inspectionStart = event.timeStamp;
    const serialNumber = vin.trim();
    if (!serialNumber) return;
    if (form?.requiresLogin && !user) {
      setNotice(t("inspection.loginRequired"));
      setOperatorNoticeKind("error");
      openOperatorLogin();
      return;
    }
    setBusy(true);
    setNotice("");
    try {
      const result = await api<RouteCheckResult>("/scada/route-check", {
        method: "POST",
        body: JSON.stringify({ serialNumber, stationCode: stationId }),
      });
      if (!result.allowed) {
        setNotice(t("notice.productDenied", { serial: serialNumber }));
        setOperatorNoticeKind("error");
        return;
      }
      setVin(serialNumber);
      setRouteCheckId(result.routeCheckId);
      setProduct(result.integrationEnabled ? result.product : null);
      setProductIdentified(true);
      inspectionStartedAt.current = inspectionStart;
      correctedQuestions.current.clear();
      setNotice(t("inspection.allowed"));
      setOperatorNoticeKind("success");
    } catch (error) {
      setOperatorNoticeKind("error");
      setNotice(
        error instanceof Error
          ? t("notice.productCheckDetails", { message: error.message })
          : t("notice.productCheckError"),
      );
    } finally {
      setBusy(false);
    }
  }

  function goToNextQuestion() {
    if (!form || !currentQuestion) return;
    const value = answers[currentQuestion.id];
    if (
      currentQuestion.isRequired &&
      (value === undefined || value === null || value === "")
    ) {
      setNotice(t("inspection.requiredAnswer"));
      return;
    }
    setNotice("");
    if (questionIndex === form.questions.length - 1) setShowSummary(true);
    else setQuestionIndex((index) => index + 1);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function goBack() {
    setNotice("");
    if (showSummary) setShowSummary(false);
    else setQuestionIndex((index) => Math.max(0, index - 1));
  }

  function answerField(question: InspectionQuestion) {
    const common = { required: question.isRequired };
    if (question.type === "CHECKBOX")
      return (
        <div className="choice-row">
          <button
            type="button"
            className={
              answers[question.id] === true ? "choice active pass" : "choice"
            }
            onClick={() => updateAnswer(question.id, true)}
          >
            {question.okImageUrl && (
              <img src={question.okImageUrl} alt="Wzorzec OK" />
            )}
            <span>✓ OK</span>
          </button>
          <button
            type="button"
            className={
              answers[question.id] === false ? "choice active fail" : "choice"
            }
            onClick={() => updateAnswer(question.id, false)}
          >
            {question.nokImageUrl && (
              <img src={question.nokImageUrl} alt="Wzorzec NOK" />
            )}
            <span>× NOK</span>
          </button>
        </div>
      );
    if (question.type === "SELECT")
      return (
        <div className="radio-options" role="radiogroup">
          {question.options?.map((option, index) => {
            const value = currentQuestionSource?.options?.[index] ?? option;
            return (
              <label
                className={`radio-option${answers[question.id] === value ? " selected" : ""}`}
                key={value}
              >
                <input
                  {...common}
                  type="radio"
                  name={`question-${question.id}`}
                  value={value}
                  checked={answers[question.id] === value}
                  onChange={() => updateAnswer(question.id, value)}
                />
                <span className="radio-indicator" aria-hidden="true" />
                <span>{option}</span>
              </label>
            );
          })}
        </div>
      );
    if (question.type === "PHOTO_UPLOAD") {
      const answer = answers[question.id];
      const photoUrl = typeof answer === "string" ? answer : "";
      return (
        <label
          className={`upload-box inspection-photo-upload${photoUrl ? " has-photo" : ""}`}
        >
          {photoUrl && (
            <img
              src={photoUrl}
              alt={t("inspection.uploadedPhoto", { label: question.label })}
            />
          )}
          <span>
            {photoUrl ? t("inspection.retakePhoto") : t("inspection.addPhoto")}
          </span>
          <input
            type="file"
            accept="image/*"
            capture="environment"
            required={question.isRequired}
            onClick={(event) => {
              event.currentTarget.value = "";
            }}
            onChange={(e) => void setPhoto(question.id, e.target.files?.[0])}
          />
        </label>
      );
    }
    return (
      <input
        {...common}
        type={question.type === "NUMBER_RANGE" ? "number" : "text"}
        value={String(answers[question.id] ?? "")}
        onFocus={() =>
          answerAtFocus.current.set(question.id, answers[question.id] ?? null)
        }
        onBlur={() => {
          const initial = answerAtFocus.current.get(question.id);
          const current = answers[question.id];
          if (
            initial !== undefined &&
            initial !== null &&
            initial !== "" &&
            initial !== current
          ) {
            correctedQuestions.current.add(question.id);
          }
          answerAtFocus.current.delete(question.id);
        }}
        onChange={(e) =>
          updateAnswer(
            question.id,
            question.type === "NUMBER_RANGE"
              ? Number(e.target.value)
              : e.target.value,
            false,
          )
        }
      />
    );
  }

  return (
    <main
      className={`station-shell${productIdentified && form ? " inspection-in-progress" : ""}`}
    >
      <header className="station-bar">
        <a
          className="brand"
          href={`/${language === "uk" ? "ua" : language}/inspection`}
        >
          <span>IH</span>
          <div>
            Inspect Hub<small>{t("inspection.mode")}</small>
          </div>
        </a>
        <div className="station-session">
          <span>
            <strong>
              {stationName || stationId || t("inspection.unassigned")}
            </strong>
            <small>{user?.name ?? t("inspection.publicAccess")}</small>
          </span>
          {onLogout && (
            <button className="ghost" type="button" onClick={onLogout}>
              {t("common.logout")}
            </button>
          )}
          {!user && (
            <button
              className="operator-login-button"
              type="button"
              onClick={openOperatorLogin}
            >
              {t("login.operatorButton")}
            </button>
          )}
          <SettingsMenu />
        </div>
      </header>
      {loginOpen && (
        <div
          className="operator-login-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeOperatorLogin();
          }}
        >
          <section
            className="operator-login-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="operator-login-title"
          >
            <button
              className="dialog-close"
              type="button"
              aria-label={t("common.close")}
              onClick={closeOperatorLogin}
            >
              ×
            </button>
            <div className="card-reader-icon" aria-hidden="true">
              ▣
            </div>
            <h2 id="operator-login-title">{t("login.cardTitle")}</h2>
            <p className="muted">
              {pairingRequired
                ? t("login.cardCodePrompt")
                : t("login.cardHint")}
            </p>
            <form onSubmit={loginOperator}>
              <label className="card-identifier-label">
                {t("login.cardIdentifier")}
                <input
                  ref={operatorCardInput}
                  inputMode="text"
                  autoComplete="off"
                  pattern="[A-Za-z0-9]+"
                  maxLength={30}
                  value={loginIdentifier}
                  onChange={(event) =>
                    setLoginIdentifier(
                      event.target.value
                        .replace(/[^A-Za-z0-9]/g, "")
                        .toUpperCase(),
                    )
                  }
                  required
                  readOnly={pairingRequired}
                />
              </label>
              {pairingRequired && (
                <label className="card-identifier-label">
                  {t("login.cardCode")}
                  <input
                    inputMode="numeric"
                    autoComplete="off"
                    pattern="[0-9]{4}"
                    maxLength={4}
                    value={loginCardCode}
                    onChange={(event) =>
                      setLoginCardCode(event.target.value.replace(/\D/g, ""))
                    }
                    autoFocus
                    required
                  />
                  <small>{t("login.cardCodeHint")}</small>
                </label>
              )}
              {loginError && <p className="error">{loginError}</p>}
              <button className="primary" disabled={loginBusy}>
                {loginBusy ? t("login.cardBusy") : t("login.cardButton")}
              </button>
            </form>
          </section>
        </div>
      )}
      <div className="workspace operator-workspace">
        <header className="page-heading operator-heading">
          <div>
            <p className="eyebrow">{t("inspection.eyebrow")}</p>
            <h1>{t("inspection.title")}</h1>
            <p className="heading-copy">{t("inspection.subtitle")}</p>
          </div>
          <span className="online">
            <i /> {t("inspection.online")}
          </span>
          {offlineQueueCount > 0 && (
            <span className="offline-queue-badge">
              ↻ {offlineQueueCount} oczekuje na synchronizację
            </span>
          )}
        </header>
        {notice && (
          <div
            className={`notice operator-notice ${operatorNoticeKind}`}
            role={operatorNoticeKind === "error" ? "alert" : "status"}
          >
            <span className="operator-notice-icon" aria-hidden="true">
              {operatorNoticeKind === "error"
                ? "!"
                : operatorNoticeKind === "success"
                  ? "✓"
                  : "i"}
            </span>
            <span>
              <strong>
                {operatorNoticeKind === "error"
                  ? t("inspection.blocked")
                  : operatorNoticeKind === "success"
                    ? t("inspection.ready")
                    : t("inspection.info")}
              </strong>
              <small>{notice}</small>
            </span>
          </div>
        )}
        {loading && (
          <section className="panel operator-empty">
            <span className="spinner" />
            <h2>{t("inspection.loading")}</h2>
          </section>
        )}
        {!loading && stationName && availableForms.length === 0 && (
          <section className="panel operator-empty">
            <span className="empty-icon">!</span>
            <h2>{t("inspection.noForms")}</h2>
            <p className="muted">
              {stationProcessId
                ? t("inspection.noFormsProcess")
                : t("inspection.noStationProcess")}
            </p>
            <form className="station-identify" onSubmit={identifyStation}>
              <input
                value={stationId}
                onChange={(e) => changeStation(e.target.value)}
                placeholder="ST-001"
                aria-label={t("inspection.stationCode")}
              />
              <button className="secondary" disabled={identifying}>
                {identifying
                  ? t("inspection.connecting")
                  : t("inspection.changePairing")}
              </button>
            </form>
          </section>
        )}
        {!loading && !stationName && (
          <section className="panel operator-empty station-pairing-card">
            <span className="empty-icon station-device-icon">▦</span>
            <h2>{t("inspection.pairTitle")}</h2>
            <p className="muted">{t("inspection.pairHelp")}</p>
            <form className="station-identify" onSubmit={identifyStation}>
              <label>
                {t("inspection.stationCode")}
                <input
                  value={stationId}
                  onChange={(e) => changeStation(e.target.value)}
                  placeholder="np. ST-001"
                  autoFocus
                  required
                />
              </label>
              <label>
                {t("inspection.stationName")}
                <input
                  value={newStationName}
                  onChange={(event) => setNewStationName(event.target.value)}
                  placeholder={t("inspection.stationNamePlaceholder")}
                />
              </label>
              <label>
                {t("inspection.stationProcess")}
                <input
                  value={newStationProcessName}
                  onChange={(event) =>
                    setNewStationProcessName(event.target.value)
                  }
                  placeholder={t("inspection.stationProcessPlaceholder")}
                />
              </label>
              <button className="primary" disabled={identifying}>
                {identifying
                  ? t("inspection.connecting")
                  : t("inspection.pair")}
              </button>
            </form>
          </section>
        )}
        {!loading && availableForms.length > 0 && !productIdentified && (
          <section className="panel product-identification-card">
            <div className="serial-scan-icon" aria-hidden="true">
              ▤
            </div>
            <p className="eyebrow">{t("inspection.identification")}</p>
            <h2>{t("inspection.scanTitle")}</h2>
            <p className="muted">{t("inspection.scanHelp")}</p>
            <form
              className="product-identification-form"
              onSubmit={identifyProduct}
            >
              <label htmlFor="inspection-serial-number">
                {t("inspection.serial")}
              </label>
              <div className="serial-input-row">
                <input
                  id="inspection-serial-number"
                  value={vin}
                  onChange={(event) => setVin(event.target.value)}
                  placeholder={t("inspection.serialPlaceholder")}
                  autoComplete="off"
                  autoFocus
                  required
                />
                <button className="primary" disabled={busy}>
                  {busy ? t("inspection.checking") : t("inspection.start")}
                </button>
              </div>
            </form>
          </section>
        )}
        {!loading && availableForms.length > 0 && productIdentified && (
          <form onSubmit={submit}>
            <section
              className="panel inspection-meta"
              aria-label={t("inspection.data")}
            >
              <div className="meta-title">
                <span>01</span>
                <div>
                  <h2>{t("inspection.controlIdentification")}</h2>
                  <p>{t("inspection.chooseAndScan")}</p>
                </div>
              </div>
              <label>
                {t("inspection.form")}
                <select
                  value={formId}
                  onChange={(e) => {
                    const nextForm = forms.find(
                      (item) => item.id === e.target.value,
                    );
                    if (nextForm?.requiresLogin && !user) {
                      setNotice(t("inspection.loginRequired"));
                      setOperatorNoticeKind("error");
                      openOperatorLogin();
                      return;
                    }
                    setFormId(e.target.value);
                    setAnswers({});
                    setStatus("");
                    setQuestionIndex(0);
                    setShowSummary(false);
                  }}
                  required
                >
                  <option value="">{t("inspection.chooseStandard")}</option>
                  {availableForms.map((item) => (
                    <option value={item.id} key={item.id}>
                      {item.code} · {item.title} · v{item.version}
                    </option>
                  ))}
                </select>
              </label>
              <dl className="inspection-context">
                <div>
                  <dt>{t("inspection.serial")}</dt>
                  <dd>{vin}</dd>
                </div>
                <div>
                  <dt>{t("inspection.station")}</dt>
                  <dd>
                    {stationName} · {stationId}
                  </dd>
                </div>
                {product && (
                  <>
                    <div>
                      <dt>{t("common.partNumber")}</dt>
                      <dd>{product.partNumber}</dd>
                    </div>
                    <div>
                      <dt>{t("inspection.family")}</dt>
                      <dd>{product.productFamily}</dd>
                    </div>
                  </>
                )}
              </dl>
            </section>
            {form && (
              <div className="inspection-progress">
                <div>
                  <span>{t("inspection.progress")}</span>
                  <strong>
                    {answeredCount} / {form.questions.length}
                  </strong>
                </div>
                <div className="progress-track">
                  <i style={{ width: `${progress}%` }} />
                </div>
              </div>
            )}
            {form && currentQuestion && !showSummary && (
              <section className="question-step">
                <div className="step-label">
                  {t("inspection.question", {
                    current: questionIndex + 1,
                    total: form.questions.length,
                  })}
                </div>
                <article
                  id={`question-${currentQuestion.id}`}
                  className={`panel operator-question question-current ${answers[currentQuestion.id] !== undefined && answers[currentQuestion.id] !== "" ? "answered" : ""}`}
                >
                  <span className="question-number">
                    {String(questionIndex + 1).padStart(2, "0")}
                  </span>
                  <div className="question-body">
                    <div className="question-title">
                      <h2>
                        {currentQuestion.label}
                        {currentQuestion.isRequired && <sup>*</sup>}
                      </h2>
                      {questionSeverity(currentQuestion) !== "NORMAL" && (
                        <span
                          className={`question-severity ${questionSeverity(currentQuestion).toLowerCase()}`}
                        >
                          {questionSeverity(currentQuestion)}
                        </span>
                      )}
                      {answers[currentQuestion.id] !== undefined &&
                        answers[currentQuestion.id] !== "" && (
                          <span className="done-mark">✓</span>
                        )}
                    </div>
                    {currentQuestion.description && (
                      <p className="muted">{currentQuestion.description}</p>
                    )}
                    {currentQuestion.instructionImageUrl && (
                      <div className="instruction-visual">
                        <span className="question-section-label">
                          {t("inspection.instructionPhoto")}
                        </span>
                        <button
                          className="instruction-image"
                          type="button"
                          onClick={() =>
                            setEnlargedImage({
                              url: currentQuestion.instructionImageUrl!,
                              alt: t("aria.instruction", {
                                label: currentQuestion.label,
                              }),
                            })
                          }
                        >
                          <img
                            src={currentQuestion.instructionImageUrl}
                            alt={t("aria.instruction", {
                              label: currentQuestion.label,
                            })}
                          />
                          <span>{t("inspection.enlarge")}</span>
                        </button>
                      </div>
                    )}
                    <div className="question-answer">
                      <span className="question-section-label">
                        {t("inspection.answer")}
                      </span>
                      {answerField(currentQuestion)}
                    </div>
                  </div>
                </article>
                <div className="step-actions">
                  <button
                    className="secondary"
                    type="button"
                    onClick={goBack}
                    disabled={questionIndex === 0}
                  >
                    {t("inspection.back")}
                  </button>
                  <button
                    className="primary next-question"
                    type="button"
                    onClick={goToNextQuestion}
                  >
                    {questionIndex === form.questions.length - 1
                      ? t("inspection.summaryNext")
                      : t("inspection.next")}{" "}
                    →
                  </button>
                </div>
              </section>
            )}
            {form && showSummary && (
              <section className="panel inspection-summary final-summary">
                <p className="eyebrow">{t("inspection.summary")}</p>
                <h2>{form.title}</h2>
                <dl>
                  <div>
                    <dt>{t("inspection.standard")}</dt>
                    <dd>{form.code}</dd>
                  </div>
                  <div>
                    <dt>{t("inspection.version")}</dt>
                    <dd>v{form.version}</dd>
                  </div>
                  <div>
                    <dt>{t("inspection.answers")}</dt>
                    <dd>
                      {answeredCount} / {form.questions.length}
                    </dd>
                  </div>
                </dl>
                {automaticStatus === null && (
                  <>
                    <div className="summary-divider" />
                    <h3>{t("inspection.result")}</h3>
                    <div className="status-options">
                      {form.allowedStatuses.map((item) => (
                        <label
                          className={`status-option ${item.toUpperCase() === "PASSED" ? "passed" : item.toUpperCase() === "FAILED" ? "failed" : ""}${status === item ? " selected" : ""}`}
                          key={item}
                        >
                          <input
                            type="radio"
                            name="status"
                            value={item}
                            checked={status === item}
                            onChange={() => setStatus(item)}
                            required
                          />
                          <span>{item}</span>
                        </label>
                      ))}
                    </div>
                  </>
                )}
                <div className="step-actions summary-actions">
                  <button className="secondary" type="button" onClick={goBack}>
                    {t("inspection.backQuestion")}
                  </button>
                  <button className="primary submit-inspection" disabled={busy}>
                    {busy ? t("inspection.sending") : t("inspection.finish")}
                    <small>{t("inspection.submitHelp")}</small>
                  </button>
                </div>
              </section>
            )}
          </form>
        )}
      </div>
      <footer className="station-footer">
        <div className="station-footer-content">
          <span className="station-footer-brand" aria-label="Inspect Hub">
            <strong>Inspect Hub</strong>
          </span>
          <span className="station-footer-divider" aria-hidden="true" />
          <span className="station-footer-credit">
            <span>{t("common.developedBy")}</span>
            <strong>Bartosz Strzemieczny</strong>
            <a href="mailto:strzemieczny@borgwarner.com">
              strzemieczny@borgwarner.com
            </a>
          </span>
        </div>
      </footer>
      {enlargedImage && (
        <div
          className="image-lightbox"
          role="dialog"
          aria-modal="true"
          aria-label={t("inspection.enlargedImage")}
          onClick={() => setEnlargedImage(null)}
        >
          <button
            type="button"
            className="lightbox-close"
            aria-label={t("inspection.closeImage")}
            onClick={() => setEnlargedImage(null)}
          >
            ×
          </button>
          <img
            src={enlargedImage.url}
            alt={enlargedImage.alt}
            onClick={(event) => event.stopPropagation()}
          />
        </div>
      )}
    </main>
  );
}

function PublicReport({ publicReportId }: { publicReportId: string }) {
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

  if (!report) {
    return (
      <main className="public-report-state">
        <a className="brand" href={`/${language === "uk" ? "ua" : language}/`}>
          <span>IH</span> Inspect Hub
        </a>
        <SettingsMenu />
        <section className="panel">
          {state === "loading" ? (
            <>
              <span className="spinner" />
              <h1>{t("report.loading")}</h1>
            </>
          ) : state === "not-found" ? (
            <>
              <span className="report-state-icon">?</span>
              <h1>{t("report.notFound")}</h1>
              <p>{t("report.checkAddress")}</p>
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
        <a className="brand" href={`/${language === "uk" ? "ua" : language}/`}>
          <span>IH</span> Inspect Hub
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

        {report.retest.isRetest && report.retest.originalReportId && (
          <aside className="retest-notice">
            <span>↻</span>
            <div>
              <strong>Ponowna inspekcja (retest)</strong>
              <p>
                Powiązana z wcześniejszą inspekcją NOK
                {report.retest.originalCompletedAt
                  ? ` z ${new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(new Date(report.retest.originalCompletedAt))}`
                  : ""}
                .
              </p>
            </div>
            <a
              href={`/${language === "uk" ? "ua" : language}/reports/${report.retest.originalReportId}`}
            >
              Otwórz pierwotny raport ↗
            </a>
          </aside>
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
                  <img
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

type QualityDashboardData = {
  generatedAt: string;
  windowHours: number;
  summary: {
    inspections: number;
    nok: number;
    activeNokStreaks: number;
    criticalDefects: number;
  };
  nokStreaks: Array<{
    stationCode: string;
    formCode: string;
    formName: string;
    count: number;
    threshold: number;
    latestAt: string;
    reportId: string;
  }>;
  criticalDefects: Array<{
    inspectionId: string;
    reportId: string;
    serialNumber: string;
    stationCode: string;
    formCode: string;
    questionId: string;
    questionLabel: string;
    occurredAt: string;
  }>;
};

function QualityDashboard() {
  const { language, locale } = useI18n();
  const route = (path: string) =>
    `/${language === "uk" ? "ua" : language}${path}`;
  const [data, setData] = useState<QualityDashboardData | null>(null);
  const [connection, setConnection] = useState<
    "connecting" | "live" | "offline"
  >("connecting");

  useEffect(() => {
    let active = true;
    let socket: WebSocket | null = null;
    let reconnectTimer = 0;
    const refresh = () =>
      api<QualityDashboardData>("/inspections/quality-dashboard")
        .then((result) => active && setData(result))
        .catch(() => active && setConnection("offline"));
    const connect = () => {
      if (!active) return;
      setConnection("connecting");
      socket = new WebSocket(qualityWebSocketUrl());
      socket.addEventListener("open", () => {
        setConnection("live");
        void refresh();
      });
      socket.addEventListener("message", () => void refresh());
      socket.addEventListener("close", () => {
        if (!active) return;
        setConnection("offline");
        reconnectTimer = window.setTimeout(connect, 3000);
      });
      socket.addEventListener("error", () => socket?.close());
    };
    void refresh();
    connect();
    return () => {
      active = false;
      window.clearTimeout(reconnectTimer);
      socket?.close();
    };
  }, []);

  const time = (value: string) =>
    new Intl.DateTimeFormat(locale, {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }).format(new Date(value));

  return (
    <main className="quality-live-shell">
      <header className="quality-live-nav">
        <a className="brand dashboard-brand" href={route("/")}>
          <span>IH</span>
          <div>
            Inspect Hub<small>QUALITY LIVE</small>
          </div>
        </a>
        <div className={`quality-connection ${connection}`}>
          <i />{" "}
          {connection === "live"
            ? "NA ŻYWO"
            : connection === "connecting"
              ? "ŁĄCZENIE…"
              : "BRAK POŁĄCZENIA"}
        </div>
      </header>
      <div className="quality-live-content">
        <section className="quality-live-heading">
          <div>
            <p className="eyebrow">MONITOR JAKOŚCI · OSTATNIE 24 GODZINY</p>
            <h1>Alerty jakościowe</h1>
            <p>
              Serie kolejnych wyników NOK i krytyczne niezgodności z inspekcji.
            </p>
          </div>
          <a href={route("/")}>← Dashboard wyników</a>
        </section>

        <section className="quality-live-kpis">
          <article>
            <span>Inspekcje</span>
            <strong>{data?.summary.inspections ?? "—"}</strong>
          </article>
          <article>
            <span>Wyniki NOK</span>
            <strong>{data?.summary.nok ?? "—"}</strong>
          </article>
          <article className="warning">
            <span>Aktywne serie NOK</span>
            <strong>{data?.summary.activeNokStreaks ?? "—"}</strong>
          </article>
          <article className="critical">
            <span>Wady krytyczne</span>
            <strong>{data?.summary.criticalDefects ?? "—"}</strong>
          </article>
        </section>

        <section className="quality-live-grid">
          <article className="quality-feed-panel">
            <header>
              <div>
                <span className="feed-icon warning">↯</span>
                <h2>Serie NOK</h2>
              </div>
              <small>próg ustawiany w formularzu</small>
            </header>
            <div className="quality-feed">
              {data?.nokStreaks.map((item) => (
                <a
                  href={route(`/reports/${item.reportId}`)}
                  className="feed-row urgent"
                  key={`${item.stationCode}-${item.formCode}`}
                >
                  <span className="streak-count">
                    {item.count}
                    <small>× NOK</small>
                  </span>
                  <div>
                    <strong>{item.stationCode}</strong>
                    <p>
                      {item.formName} · {item.formCode} · próg {item.threshold}
                    </p>
                  </div>
                  <time>{time(item.latestAt)}</time>
                </a>
              ))}
              {!data?.nokStreaks.length && (
                <p className="quality-empty">Brak aktywnych serii NOK.</p>
              )}
            </div>
          </article>

          <article className="quality-feed-panel critical-panel">
            <header>
              <div>
                <span className="feed-icon critical">!</span>
                <h2>Wady krytyczne</h2>
              </div>
              <small>odpowiedzi NOK na cechach krytycznych</small>
            </header>
            <div className="quality-feed">
              {data?.criticalDefects.map((item) => (
                <a
                  href={route(`/reports/${item.reportId}`)}
                  className="feed-row critical-row"
                  key={`${item.inspectionId}-${item.questionId}`}
                >
                  <span className="critical-mark">!</span>
                  <div>
                    <strong>{item.questionLabel}</strong>
                    <p>
                      {item.stationCode} · {item.formCode} · {item.serialNumber}
                    </p>
                  </div>
                  <time>{time(item.occurredAt)}</time>
                </a>
              ))}
              {!data?.criticalDefects.length && (
                <p className="quality-empty">Brak wad krytycznych.</p>
              )}
            </div>
          </article>
        </section>
        <footer className="quality-live-footer">
          Ostatnie przeliczenie: {data ? time(data.generatedAt) : "—"} · dane
          odświeżane po każdej zapisanej inspekcji
        </footer>
      </div>
    </main>
  );
}

function App() {
  const { language, t } = useI18n();
  const [user, setUser] = useState<SessionUser | null>(() => {
    const raw = localStorage.getItem("inspect-hub-user");
    return raw ? (JSON.parse(raw) as SessionUser) : null;
  });

  const route = (path: string) =>
    `/${language === "uk" ? "ua" : language}${path}`;
  const originalPath = window.location.pathname;
  const routeMatch = originalPath.match(/^\/(pl|en|ua)(\/.*)?$/);
  if (!routeMatch) {
    window.history.replaceState(
      {},
      "",
      `${route(originalPath === "/" ? "/" : originalPath)}${window.location.search}${window.location.hash}`,
    );
  }
  let path = routeMatch?.[2] || originalPath;
  const pageTitleKey =
    path === "/"
      ? "pageTitle.dashboard"
      : path === "/quality"
        ? "pageTitle.quality"
        : /^\/reports\/[^/]+\/?$/.test(path)
          ? "pageTitle.report"
          : path === "/inspection"
            ? "pageTitle.inspection"
            : !user
              ? "pageTitle.login"
              : "pageTitle.admin";
  const pageTitle = `Inspect Hub · ${t(pageTitleKey)}`;

  useEffect(() => {
    document.title = pageTitle;
  }, [pageTitle]);

  if (path === "/") return <Dashboard />;
  if (path === "/quality") return <QualityDashboard />;
  const publicReportMatch = path.match(/^\/reports\/([^/]+)\/?$/);
  if (publicReportMatch) {
    return (
      <PublicReport publicReportId={decodeURIComponent(publicReportMatch[1])} />
    );
  }
  if (path === "/inspection") {
    return (
      <OperatorPanel
        user={user}
        onLogin={loginUser}
        onLogout={user ? logoutUser : undefined}
      />
    );
  }
  if (!user) {
    if (path !== "/login") {
      window.history.replaceState({}, "", route("/login"));
    }
    return <Login onLogin={loginUser} />;
  }

  function loginUser(session: Session) {
    localStorage.setItem("inspect-hub-token", session.accessToken);
    localStorage.setItem("inspect-hub-user", JSON.stringify(session.user));
    window.history.replaceState(
      {},
      "",
      route(session.user.role === "OPERATOR" ? "/inspection" : "/admin"),
    );
    setUser(session.user);
  }

  function logoutUser() {
    localStorage.removeItem("inspect-hub-token");
    localStorage.removeItem("inspect-hub-user");
    window.history.replaceState({}, "", route("/login"));
    setUser(null);
  }

  if (user.role === "OPERATOR" && path !== "/inspection") {
    window.history.replaceState({}, "", route("/inspection"));
    return (
      <OperatorPanel user={user} onLogin={loginUser} onLogout={logoutUser} />
    );
  } else if (path === "/login") {
    window.history.replaceState({}, "", route("/admin"));
    path = "/admin";
  }

  if (path !== "/admin") {
    window.history.replaceState({}, "", route("/admin"));
  }

  return (
    <>
      <nav>
        <a className="brand" href={route("/admin")}>
          <span>IH</span> Inspect Hub
        </a>
        <div className="nav-actions">
          <a className="station-link" href={route("/inspection")}>
            {t("nav.openStation")}
          </a>
          <span className="user-chip">
            {user.name} · {user.role}
          </span>
          <button className="ghost" onClick={logoutUser}>
            {t("common.logout")}
          </button>
          <SettingsMenu />
        </div>
      </nav>
      <AdminPanel />
    </>
  );
}

export default App;
