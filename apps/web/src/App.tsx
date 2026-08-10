import {
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
  type FormEvent,
} from "react";
import type {
  FieldType,
  InspectionAnswerValue,
  InspectionForm,
  InspectionQuestion,
  PublicInspectionReport,
  RouteCheckResult,
  ScadaSettings,
  Station,
} from "@inspect-hub/types";
import {
  ApiError,
  api,
  uploadImage,
  type Session,
  type SessionUser,
} from "./lib/api";
import "./App.css";

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
});

function AdminMenuIcon({
  type,
}: {
  type: "forms" | "stations" | "users" | "settings";
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
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z" />
      <path d="M19 12a7 7 0 0 0-.1-1l2-1.6-2-3.4-2.5 1A8 8 0 0 0 14.7 6L14.3 3h-4.6l-.4 3A8 8 0 0 0 7.6 7L5.1 6l-2 3.4L5.1 11a7 7 0 0 0 0 2l-2 1.6 2 3.4 2.5-1a8 8 0 0 0 1.7 1l.4 3h4.6l.4-3a8 8 0 0 0 1.7-1l2.5 1 2-3.4-2-1.6a7 7 0 0 0 .1-1Z" />
    </svg>
  );
}

function ScadaSettingsPanel() {
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
      setNotice("Ustawienia connectora SCADA zostały zapisane.");
    } catch (error) {
      setNotice(
        error instanceof Error
          ? error.message
          : "Nie udało się zapisać ustawień",
      );
    } finally {
      setBusy(false);
    }
  }

  if (!settings)
    return (
      <section className="panel">{notice || "Ładowanie ustawień…"}</section>
    );
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
          <p className="eyebrow">INTEGRACJA PRODUKCYJNA</p>
          <h2>Connector SCADA</h2>
          <p>
            Kontroluj dostęp produktu do inspekcji i automatycznie przekazuj
            wyniki do systemu produkcyjnego.
          </p>
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
          <span>{settings.enabled ? "SCADA" : "Symulacja DEV"}</span>
        </label>
      </header>
      <div className="scada-settings-body">
        <div className="scada-info">
          <span aria-hidden="true">↔</span>
          <p>
            Route check działa synchronicznie. Wyniki zakończonych inspekcji są
            kolejkowane i wysyłane asynchronicznie.
          </p>
        </div>
        <div className="settings-grid">
          <label>
            Bazowy URL SCADA
            <input
              type="url"
              value={settings.baseUrl}
              onChange={(e) => update("baseUrl", e.target.value)}
              placeholder="http://scada.local:8080"
              required={settings.enabled}
            />
            <small>Protokół, host i opcjonalny port systemu SCADA.</small>
          </label>
          <label>
            Publiczny URL Inspect Hub
            <input
              type="url"
              value={settings.publicWebUrl}
              onChange={(e) => update("publicWebUrl", e.target.value)}
              required
            />
            <small>Używany do generowania linków do raportów.</small>
          </label>
          <label>
            Ścieżka route check
            <input
              value={settings.routeCheckPath}
              onChange={(e) => update("routeCheckPath", e.target.value)}
              required
            />
          </label>
          <label>
            Ścieżka wysyłki wyniku
            <input
              value={settings.submitResultPath}
              onChange={(e) => update("submitResultPath", e.target.value)}
              required
            />
          </label>
          <label className="timeout-field">
            Timeout połączenia
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
          {settings.enabled
            ? "Żądania będą wysyłane do skonfigurowanego serwera SCADA."
            : "Aktywna lokalna symulacja: numery _OK / _NOK."}
        </span>
        <button className="primary" disabled={busy}>
          {busy ? "Zapisywanie…" : "Zapisz ustawienia"}
        </button>
      </footer>
    </form>
  );
}

interface DashboardData {
  generatedAt: string;
  summary: {
    completedToday: number;
    passRate: number;
    issuesToday: number;
    activeStations: number;
    mesSyncRate: number;
    completedTrend: number | null;
    issuesTrend: number | null;
  };
  daily: { date: string; total: number; passed: number }[];
  recent: {
    publicReportId: string;
    vinOrSerialNumber: string;
    stationId: string;
    status: string;
    mesSynced: boolean;
    createdAt: string;
    form: { title: string; code: string };
  }[];
}

const emptyDashboard: DashboardData = {
  generatedAt: new Date().toISOString(),
  summary: {
    completedToday: 0,
    passRate: 0,
    issuesToday: 0,
    activeStations: 0,
    mesSyncRate: 0,
    completedTrend: null,
    issuesTrend: null,
  },
  daily: Array.from({ length: 7 }, (_, index) => {
    const date = new Date();
    date.setDate(date.getDate() - 6 + index);
    return { date: date.toISOString().slice(0, 10), total: 0, passed: 0 };
  }),
  recent: [],
};

function Dashboard() {
  const [data, setData] = useState<DashboardData>(emptyDashboard);
  const [connection, setConnection] = useState<"loading" | "live" | "error">(
    "loading",
  );

  useEffect(() => {
    void api<DashboardData>("/inspections/public-dashboard")
      .then((result) => {
        setData(result);
        setConnection("live");
      })
      .catch(() => setConnection("error"));
  }, []);

  const maxTotal = Math.max(...data.daily.map((item) => item.total), 1);
  const passStatus = (status: string) =>
    ["PASSED", "PASS", "OK", "ZDAŁ", "ZDAL"].includes(status.toUpperCase());
  const time = (value: string) =>
    new Intl.DateTimeFormat("pl-PL", {
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(value));
  const day = (value: string) =>
    new Intl.DateTimeFormat("pl-PL", { weekday: "short" })
      .format(new Date(`${value}T12:00:00`))
      .replace(".", "");
  const trend = (value: number | null) =>
    value === null ? (
      <small>Brak danych porównawczych</small>
    ) : (
      <small>
        <b className={value <= 0 ? "good" : ""}>
          {value > 0 ? "↑" : value < 0 ? "↓" : "→"} {Math.abs(value).toFixed(1)}
          %
        </b>{" "}
        vs. wczoraj
      </small>
    );

  return (
    <main className="dashboard-shell">
      <header className="dashboard-nav">
        <a className="brand dashboard-brand" href="/">
          <span>IH</span>
          <div>
            Inspect Hub<small>Quality intelligence</small>
          </div>
        </a>
        <div className="dashboard-nav-actions">
          <span
            className={`live-badge ${connection === "error" ? "offline" : ""}`}
          >
            <i />
            {connection === "live"
              ? `Ostatnia aktualizacja: ${time(data.generatedAt)}`
              : connection === "error"
                ? "Dane niedostępne"
                : "Pobieranie danych…"}
          </span>
          <a className="login-link" href="/login">
            Zaloguj się <b>↗</b>
          </a>
        </div>
      </header>
      <div className="dashboard-content">
        <section className="dashboard-title">
          <div>
            <p className="eyebrow">CENTRUM JAKOŚCI · PRODUKCJA</p>
            <h1>Wyniki inspekcji</h1>
            <p>Aktualny obraz jakości procesu na wszystkich stanowiskach.</p>
          </div>
          <div className="dashboard-updated">
            <span>Stan danych na</span>
            <strong>{time(data.generatedAt)}</strong>
            <small>Pobrano przy otwarciu strony</small>
          </div>
        </section>

        <section className="metric-grid">
          <article className="metric-card featured">
            <div className="metric-icon">✓</div>
            <div>
              <span>Inspekcje dzisiaj</span>
              <strong>
                {data.summary.completedToday.toLocaleString("pl-PL")}
              </strong>
              {trend(data.summary.completedTrend)}
            </div>
          </article>
          <article className="metric-card">
            <div className="metric-icon rate">%</div>
            <div>
              <span>First pass yield</span>
              <strong>{data.summary.passRate.toFixed(1)}%</strong>
              <small>Cel dzienny: 97,0%</small>
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
              <span>Niezgodności</span>
              <strong>{data.summary.issuesToday}</strong>
              {trend(data.summary.issuesTrend)}
            </div>
          </article>
          <article className="metric-card">
            <div className="metric-icon station">▦</div>
            <div>
              <span>Aktywne stanowiska</span>
              <strong>
                {data.summary.activeStations}
                <em>/ 14</em>
              </strong>
              <small>
                <i className="tiny-live" /> Pracują prawidłowo
              </small>
            </div>
          </article>
        </section>

        <section className="dashboard-main-grid">
          <article className="dashboard-card chart-card">
            <div className="card-heading">
              <div>
                <h2>Przepustowość i jakość</h2>
                <p>Wyniki z ostatnich 7 dni</p>
              </div>
              <div className="legend">
                <span>
                  <i className="legend-total" /> Wszystkie
                </span>
                <span>
                  <i className="legend-pass" /> Zgodne
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
              <div className="bar-chart">
                {data.daily.map((item) => (
                  <div className="bar-column" key={item.date}>
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
                  </div>
                ))}
              </div>
            </div>
          </article>
          <aside className="dashboard-card quality-card">
            <div className="card-heading">
              <div>
                <h2>Stan jakości</h2>
                <p>Dzisiejsza produkcja</p>
              </div>
            </div>
            <div
              className="quality-ring"
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
                <span>zgodnych</span>
              </div>
            </div>
            <div className="quality-breakdown">
              <div>
                <span>
                  <i className="pass-dot" /> Zgodne
                </span>
                <strong>
                  {Math.max(
                    data.summary.completedToday - data.summary.issuesToday,
                    0,
                  ).toLocaleString("pl-PL")}
                </strong>
              </div>
              <div>
                <span>
                  <i className="fail-dot" /> Niezgodne
                </span>
                <strong>{data.summary.issuesToday}</strong>
              </div>
            </div>
            <div className="mes-health">
              <span>Synchronizacja SCADA</span>
              <strong>
                {data.summary.mesSyncRate.toFixed(1)}% <i />
              </strong>
            </div>
          </aside>
        </section>

        <section className="dashboard-card recent-card">
          <div className="card-heading">
            <div>
              <h2>Raporty z inspekcji</h2>
              <p>Wszystkie zapisane wyniki ze stanowisk kontrolnych</p>
            </div>
            <span className="table-count">{data.recent.length} raportów</span>
          </div>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Czas</th>
                  <th>Produkt</th>
                  <th>Standard kontroli</th>
                  <th>Stanowisko</th>
                  <th>Wynik</th>
                  <th>SCADA</th>
                  <th>Raport</th>
                </tr>
              </thead>
              <tbody>
                {data.recent.map((item) => (
                  <tr key={item.publicReportId}>
                    <td>{time(item.createdAt)}</td>
                    <td>
                      <strong>{item.vinOrSerialNumber}</strong>
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
                        {passStatus(item.status) ? "Zgodna" : "Niezgodna"}
                      </span>
                    </td>
                    <td>
                      <span
                        className={item.mesSynced ? "sync-ok" : "sync-wait"}
                      >
                        {item.mesSynced ? "✓ Zapisano" : "○ Oczekuje"}
                      </span>
                    </td>
                    <td>
                      <a
                        className="report-table-link"
                        href={`/reports/${item.publicReportId}`}
                      >
                        Podejrzyj <span aria-hidden="true">↗</span>
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {data.recent.length === 0 && (
              <div className="empty-table">
                {connection === "error"
                  ? "Nie udało się pobrać danych z API."
                  : "Brak zapisanych inspekcji."}
              </div>
            )}
          </div>
        </section>
        <footer className="dashboard-footer">
          <span>Inspect Hub · Quality Operations</span>
          <span>
            Dane pobierane przy otwarciu strony · Numery produktów zostały
            zanonimizowane
          </span>
        </footer>
      </div>
    </main>
  );
}

function Login({ onLogin }: { onLogin: (session: Session) => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

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
      setError(
        reason instanceof Error ? reason.message : "Nie udało się zalogować",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-shell">
      <section className="auth-card">
        <div className="brand-mark">IH</div>
        <p className="eyebrow">QUALITY OPERATIONS</p>
        <h1>Inspect Hub</h1>
        <p className="muted">
          Jedno miejsce dla standardów, inspekcji i traceability.
        </p>
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
            Hasło
            <input
              type="password"
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </label>
          {error && <p className="error">{error}</p>}
          <button className="primary" disabled={busy}>
            {busy ? "Logowanie…" : "Zaloguj się"}
          </button>
        </form>
        <p className="auth-note">
          Konta tworzy administrator w sekcji Użytkownicy panelu
          administracyjnego.
        </p>
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
        body: JSON.stringify({ code, name, processName }),
      });
      setCode("");
      setName("");
      setProcessName("");
      setNotice("Stanowisko zostało dodane.");
      await onChange();
    } catch (reason) {
      setNotice(
        reason instanceof Error
          ? reason.message
          : "Nie udało się dodać stanowiska",
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
      setNotice("Zmiany stanowiska zostały zapisane.");
      await onChange();
    } catch (reason) {
      setNotice(
        reason instanceof Error
          ? reason.message
          : "Nie udało się zapisać stanowiska",
      );
    } finally {
      setBusyId("");
    }
  }

  async function removeStation(station: Station) {
    if (
      !window.confirm(
        `Usunąć stanowisko ${station.code}? Zostanie też usunięte z przypisań formularzy.`,
      )
    )
      return;
    setBusyId(station.id);
    setNotice("");
    try {
      await api(`/stations/${station.id}`, { method: "DELETE" });
      setNotice("Stanowisko zostało usunięte.");
      await onChange();
    } catch (reason) {
      setNotice(
        reason instanceof Error
          ? reason.message
          : "Nie udało się usunąć stanowiska",
      );
    } finally {
      setBusyId("");
    }
  }

  return (
    <section className="panel stations-manager">
      <div className="stations-heading">
        <div>
          <p className="eyebrow">KONFIGURACJA</p>
          <h2>Stanowiska</h2>
          <p className="muted">
            Zarządzaj stanowiskami dostępnymi przy przypisywaniu formularzy.
          </p>
        </div>
        <span className="table-count">{stations.length} stanowisk</span>
      </div>
      <form className="station-create" onSubmit={createStation}>
        <label>
          Kod stanowiska
          <input
            value={code}
            onChange={(event) => setCode(event.target.value.toUpperCase())}
            placeholder="ST-001"
            required
          />
        </label>
        <label>
          Nazwa
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Kontrola końcowa"
            required
          />
        </label>
        <label>
          Proces inspekcji
          <input
            value={processName}
            onChange={(event) => setProcessName(event.target.value)}
            placeholder="Kontrola końcowa"
            required
          />
        </label>
        <button className="primary" disabled={busyId === "new"}>
          {busyId === "new" ? "Dodawanie…" : "Dodaj stanowisko"}
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
                aria-label={`Kod stanowiska ${station.code}`}
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
                  aria-label={`Nazwa stanowiska ${station.code}`}
                  value={draft.name}
                  onChange={(event) =>
                    setDrafts({
                      ...drafts,
                      [station.id]: { ...draft, name: event.target.value },
                    })
                  }
                />
                <small>IP: {station.ipAddress ?? "jeszcze niepowiązane"}</small>
              </div>
              <input
                aria-label={`Proces stanowiska ${station.code}`}
                value={draft.processName}
                placeholder="Nazwa procesu"
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
                {station.active ? "Aktywne" : "Nieaktywne"}
              </span>
              <div className="station-actions">
                <button
                  className="secondary"
                  type="button"
                  disabled={busyId === station.id}
                  onClick={() => void updateStation(station)}
                >
                  Zapisz
                </button>
                <button
                  className="secondary"
                  type="button"
                  disabled={busyId === station.id}
                  onClick={() =>
                    void updateStation(station, { active: !station.active })
                  }
                >
                  {station.active ? "Dezaktywuj" : "Aktywuj"}
                </button>
                <button
                  className="icon-button danger"
                  type="button"
                  disabled={busyId === station.id}
                  onClick={() => void removeStation(station)}
                >
                  Usuń
                </button>
              </div>
            </article>
          );
        })}
        {stations.length === 0 && (
          <p className="muted station-list-empty">
            Nie dodano jeszcze żadnych stanowisk.
          </p>
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
      setNotice("Użytkownik został utworzony.");
    } catch (reason) {
      setNotice(
        reason instanceof Error
          ? reason.message
          : "Nie udało się utworzyć użytkownika",
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
      setNotice("Rola użytkownika została zmieniona.");
    } catch (reason) {
      setNotice(
        reason instanceof Error ? reason.message : "Nie udało się zmienić roli",
      );
    } finally {
      setBusyId(null);
    }
  }

  async function removeUser(user: ManagedUser) {
    if (!window.confirm(`Usunąć konto ${user.email}?`)) return;
    setBusyId(user.id);
    try {
      await api(`/users/${user.id}`, { method: "DELETE" });
      await loadUsers();
      setNotice("Użytkownik został usunięty.");
    } catch (reason) {
      setNotice(
        reason instanceof Error
          ? reason.message
          : "Nie udało się usunąć użytkownika",
      );
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section className="panel users-manager">
      <div className="stations-heading">
        <div>
          <p className="eyebrow">KONTA I UPRAWNIENIA</p>
          <h2>Użytkownicy</h2>
        </div>
        <span className="status-dot">{users.length} kont</span>
      </div>
      <form className="user-create" onSubmit={createUser}>
        <label>
          Imię i nazwisko
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
          Hasło
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
            minLength={8}
          />
        </label>
        <label>
          Rola
          <select
            value={role}
            onChange={(event) =>
              setRole(event.target.value as SessionUser["role"])
            }
          >
            <option value="OPERATOR">Operator</option>
            <option value="ADMIN">Administrator</option>
          </select>
        </label>
        <button className="primary" disabled={busyId === "new"}>
          {busyId === "new" ? "Tworzenie…" : "Dodaj użytkownika"}
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
              {new Intl.DateTimeFormat("pl-PL").format(
                new Date(user.createdAt),
              )}
            </small>
            <select
              aria-label={`Rola użytkownika ${user.name}`}
              value={user.role}
              disabled={busyId === user.id}
              onChange={(event) =>
                void changeRole(user, event.target.value as SessionUser["role"])
              }
            >
              <option value="OPERATOR">Operator</option>
              <option value="ADMIN">Administrator</option>
            </select>
            <button
              className="icon-button danger"
              type="button"
              disabled={busyId === user.id}
              onClick={() => void removeUser(user)}
            >
              Usuń
            </button>
          </article>
        ))}
      </div>
      {notice && <p className="notice">{notice}</p>}
    </section>
  );
}

function AdminPanel() {
  const [section, setSection] = useState<
    "forms-new" | "forms-edit" | "stations" | "users" | "settings"
  >("forms-new");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(
    () => localStorage.getItem("inspect-hub-admin-sidebar") === "collapsed",
  );
  const [title, setTitle] = useState("");
  const [code, setCode] = useState("");
  const [statuses, setStatuses] = useState(["PASSED", "FAILED"]);
  const [processIds, setProcessIds] = useState<string[]>([]);
  const [questions, setQuestions] = useState<InspectionQuestion[]>([
    emptyQuestion(),
  ]);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [stations, setStations] = useState<Station[]>([]);
  const [forms, setForms] = useState<InspectionForm[]>([]);
  const [editingForm, setEditingForm] = useState<InspectionForm | null>(null);
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
      ].sort((left, right) => left.name.localeCompare(right.name, "pl")),
    [stations],
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

  async function editForm(form: InspectionForm) {
    setSection("forms-edit");
    setEditingForm(form);
    setTitle(form.title);
    setCode(form.code);
    setStatuses([...form.allowedStatuses]);
    setProcessIds([...form.processIds]);
    setQuestions(structuredClone(form.questions));
    setNotice("");
    try {
      setRevisions(await api<InspectionForm[]>(`/forms/${form.id}/revisions`));
    } catch (reason) {
      setNotice(
        reason instanceof Error
          ? reason.message
          : "Nie udało się pobrać historii rewizji",
      );
    }
  }

  function startNewForm() {
    setSection("forms-new");
    setEditingForm(null);
    setTitle("");
    setCode("");
    setStatuses(["PASSED", "FAILED"]);
    setProcessIds([]);
    setQuestions([emptyQuestion()]);
    setRevisions([]);
    setNotice("");
  }

  function updateQuestion(id: string, patch: Partial<InspectionQuestion>) {
    setQuestions((items) =>
      items.map((item) => (item.id === id ? { ...item, ...patch } : item)),
    );
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
      setNotice("Grafika instruktażowa została przesłana.");
    } catch (reason) {
      setNotice(reason instanceof Error ? reason.message : "Błąd uploadu");
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
        `Zdjęcie referencyjne ${answer.toUpperCase()} zostało przesłane.`,
      );
    } catch (reason) {
      setNotice(reason instanceof Error ? reason.message : "Błąd uploadu");
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
            questions,
            processIds,
          }),
        },
      );
      await loadForms();
      if (editingForm) await editForm(saved);
      else startNewForm();
      setNotice(
        editingForm
          ? `Opublikowano rewizję ${saved.version}. Poprzednie wersje pozostały w historii.`
          : "Formularz został opublikowany w wersji 1.",
      );
    } catch (reason) {
      setNotice(
        reason instanceof Error ? reason.message : "Nie udało się zapisać",
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
            <strong>Zarządzanie</strong>
          </div>
          <button
            className="sidebar-toggle"
            type="button"
            onClick={toggleSidebar}
            aria-label={sidebarCollapsed ? "Rozwiń menu" : "Zwiń menu"}
            title={sidebarCollapsed ? "Rozwiń menu" : "Zwiń menu"}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d={sidebarCollapsed ? "m9 5 7 7-7 7" : "m15 5-7 7 7 7"} />
            </svg>
          </button>
        </div>
        <nav className="admin-menu" aria-label="Sekcje panelu administratora">
          <div className="admin-menu-group">
            <button
              className={section.startsWith("forms-") ? "active" : ""}
              type="button"
              onClick={startNewForm}
              title={sidebarCollapsed ? "Formularze" : undefined}
            >
              <i>
                <AdminMenuIcon type="forms" />
              </i>
              <span>
                Formularze<small>Standardy inspekcji</small>
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
                title={sidebarCollapsed ? "Nowy formularz" : undefined}
              >
                <i aria-hidden="true">＋</i>
                <span>Nowy formularz</span>
              </button>
              <button
                className={section === "forms-edit" ? "active" : ""}
                type="button"
                onClick={() => setSection("forms-edit")}
                title={sidebarCollapsed ? "Edycja formularzy" : undefined}
              >
                <i aria-hidden="true">✎</i>
                <span>Edycja formularzy</span>
              </button>
            </div>
          </div>
          <button
            className={section === "stations" ? "active" : ""}
            type="button"
            onClick={() => setSection("stations")}
            title={sidebarCollapsed ? "Stanowiska" : undefined}
          >
            <i>
              <AdminMenuIcon type="stations" />
            </i>
            <span>
              Stanowiska<small>Edycja stanowisk</small>
            </span>
          </button>
          <button
            className={section === "users" ? "active" : ""}
            type="button"
            onClick={() => setSection("users")}
            title={sidebarCollapsed ? "Użytkownicy" : undefined}
          >
            <i>
              <AdminMenuIcon type="users" />
            </i>
            <span>
              Użytkownicy<small>Konta i uprawnienia</small>
            </span>
          </button>
          <button
            className={section === "settings" ? "active" : ""}
            type="button"
            onClick={() => setSection("settings")}
            title={sidebarCollapsed ? "Integracja SCADA" : undefined}
          >
            <i>
              <AdminMenuIcon type="settings" />
            </i>
            <span>
              Integracja SCADA<small>Endpointy i połączenie</small>
            </span>
          </button>
        </nav>
      </aside>
      <div className="workspace admin-content">
        <header className="page-heading">
          <div>
            <p className="eyebrow">PANEL ADMINA</p>
            <h1>
              {section === "forms-new"
                ? "Nowy standard inspekcji"
                : section === "forms-edit"
                  ? editingForm
                    ? `Edycja: ${editingForm.code}`
                    : "Edycja formularzy"
                  : section === "stations"
                    ? "Zarządzanie stanowiskami"
                    : section === "users"
                      ? "Zarządzanie użytkownikami"
                      : "Integracja SCADA"}
            </h1>
            <p className="heading-copy">
              {section === "forms-new"
                ? "Utwórz i opublikuj nowy standard inspekcji."
                : section === "forms-edit"
                  ? "Wybierz formularz, edytuj go i przeglądaj jego rewizje."
                  : section === "stations"
                    ? "Dodawaj, edytuj i kontroluj dostępność stanowisk."
                    : section === "users"
                      ? "Twórz konta oraz nadawaj role administratora i operatora."
                      : "Skonfiguruj komunikację ze sterującym systemem produkcyjnym."}
            </p>
          </div>
          {section.startsWith("forms-") && (
            <span className="status-dot">
              {section === "forms-edit" && editingForm
                ? `Nowa rewizja v${editingForm.version + 1}`
                : section === "forms-edit"
                  ? `${forms.length} formularzy`
                  : "Nowy formularz"}
            </span>
          )}
        </header>
        {section === "settings" ? (
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
                    <p className="eyebrow">OPUBLIKOWANE STANDARDY</p>
                    <h2>Istniejące formularze</h2>
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
                        {form.questions.length} pytań · {form.processIds.length}{" "}
                        procesów
                      </small>
                      <button
                        className="secondary"
                        type="button"
                        onClick={() => void editForm(form)}
                      >
                        Edytuj
                      </button>
                    </article>
                  ))}
                  {forms.length === 0 && (
                    <p className="muted">
                      Nie opublikowano jeszcze żadnego formularza.
                    </p>
                  )}
                </div>
                {editingForm && revisions.length > 0 && (
                  <div className="revision-history">
                    <strong>Historia zmian: {editingForm.code}</strong>
                    <div>
                      {revisions.map((revision) => (
                        <span key={revision.id}>
                          <b>v{revision.version}</b>
                          {new Intl.DateTimeFormat("pl-PL", {
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
                  <h2>Ustawienia formularza</h2>
                  <label>
                    Tytuł
                    <input
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      placeholder="Kontrola końcowa drzwi"
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
                  <label>Statusy końcowe</label>
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
                    placeholder="Dodaj status i naciśnij Enter"
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
                    <strong>Status to decyzja jakościowa.</strong>
                    <br />
                    Może odpowiadać słownikowi zakładowemu, np. ZDAŁ, DO
                    POPRAWY, ZŁOM.
                  </div>
                  <label>Przypisane procesy</label>
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
                          <strong>PROCES</strong>
                          {process.name}
                        </span>
                      </label>
                    ))}
                    {processes.length === 0 && (
                      <span className="muted">
                        Najpierw przypisz nazwę procesu do stanowiska.
                      </span>
                    )}
                  </div>
                  <div className="tip">
                    Formularz będzie dostępny na wszystkich stanowiskach
                    należących do wybranych procesów.
                  </div>
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
                          Usuń
                        </button>
                      </div>
                      <label>
                        Treść pytania
                        <input
                          value={question.label}
                          onChange={(e) =>
                            updateQuestion(question.id, {
                              label: e.target.value,
                            })
                          }
                          placeholder="Czy element jest poprawnie zamocowany?"
                          required
                        />
                      </label>
                      <div className="inline-fields">
                        <label>
                          Typ odpowiedzi
                          <select
                            value={question.type}
                            onChange={(e) =>
                              changeQuestionType(
                                question.id,
                                e.target.value as FieldType,
                              )
                            }
                          >
                            <option value="CHECKBOX">Tak / Nie</option>
                            <option value="TEXT">Tekst</option>
                            <option value="SELECT">Lista</option>
                            <option value="PHOTO_UPLOAD">Zdjęcie</option>
                            <option value="NUMBER_RANGE">
                              Wartość liczbowa
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
                          Wymagane
                        </label>
                      </div>
                      {question.type === "SELECT" && (
                        <label>
                          Opcje (po przecinku)
                          <input
                            value={question.options?.join(", ") ?? ""}
                            onChange={(e) =>
                              updateQuestion(question.id, {
                                options: e.target.value
                                  .split(",")
                                  .map((v) => v.trim())
                                  .filter(Boolean),
                              })
                            }
                          />
                        </label>
                      )}
                      {question.type === "CHECKBOX" ? (
                        <label>
                          Oczekiwana wartość
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
                            <option value="">Nie określono</option>
                            <option value="true">Tak</option>
                            <option value="false">Nie</option>
                          </select>
                        </label>
                      ) : question.type === "SELECT" ? (
                        <label>
                          Oczekiwana wartość
                          <select
                            value={String(question.expectedValue ?? "")}
                            onChange={(e) =>
                              updateQuestion(question.id, {
                                expectedValue: e.target.value || undefined,
                              })
                            }
                          >
                            <option value="">Nie określono</option>
                            {question.options?.map((option) => (
                              <option value={option} key={option}>
                                {option}
                              </option>
                            ))}
                          </select>
                        </label>
                      ) : (
                        <label>
                          Oczekiwana wartość
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
                            placeholder="Podaj oczekiwaną odpowiedź"
                          />
                        </label>
                      )}
                      {question.type === "NUMBER_RANGE" && (
                        <div className="range-fields">
                          <label>
                            Zakres od
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
                            Zakres do
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
                                <span>✓ Zdjęcie OK gotowe</span>
                              </>
                            ) : (
                              "Dodaj zdjęcie dla OK"
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
                                <span>✓ Zdjęcie NOK gotowe</span>
                              </>
                            ) : (
                              "Dodaj zdjęcie dla NOK"
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
                          ? "✓ Obraz instrukcji gotowy"
                          : "Dodaj obraz instruktażowy"}
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
                    ＋ Dodaj kolejne pytanie
                  </button>
                  {notice && <p className="notice">{notice}</p>}
                  <button
                    className="primary publish"
                    disabled={
                      busy || statuses.length === 0 || processIds.length === 0
                    }
                  >
                    {busy
                      ? "Zapisywanie…"
                      : editingForm
                        ? `Opublikuj rewizję ${editingForm.version + 1}`
                        : "Opublikuj formularz"}
                  </button>
                </section>
              </form>
            )}
          </>
        ) : null}
      </div>
    </div>
  );
}

function OperatorPanel({
  user,
  onLogout,
}: {
  user: SessionUser | null;
  onLogout?: () => void;
}) {
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
  const [stationProcessId, setStationProcessId] = useState("");
  const [identifying, setIdentifying] = useState(false);
  const [status, setStatus] = useState("");
  const [answers, setAnswers] = useState<Record<string, InspectionAnswerValue>>(
    {},
  );
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
  const currentQuestion = form?.questions[questionIndex];

  useEffect(() => {
    void Promise.all([
      api<InspectionForm[]>("/forms"),
      api<Station>("/stations/current").catch(() => null),
    ])
      .then(([data, currentStation]) => {
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
      .catch((error: Error) => setNotice(error.message))
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
  }

  async function identifyStation(event: FormEvent) {
    event.preventDefault();
    if (!stationId.trim()) return;
    setIdentifying(true);
    setNotice("");
    try {
      const station = await api<Station>("/stations/identify", {
        method: "POST",
        body: JSON.stringify({ code: stationId }),
      });
      setStationId(station.code);
      setStationName(station.name);
      setStationProcessId(station.process?.id ?? "");
      const nextForms = forms.filter(
        (item) =>
          Boolean(station.process) &&
          item.processIds.includes(station.process!.id),
      );
      setFormId(nextForms[0]?.id ?? "");
      setNotice(`Urządzenie powiązano ze stanowiskiem ${station.name}.`);
      setOperatorNoticeKind("success");
    } catch (error) {
      setOperatorNoticeKind("error");
      setNotice(
        error instanceof Error
          ? error.message
          : "Nie udało się rozpoznać stanowiska",
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
      setAnswers((old) => ({ ...old, [questionId]: url }));
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Błąd uploadu");
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!form) return;
    const missing = form.questions.filter(
      (question) =>
        question.isRequired &&
        (answers[question.id] === undefined ||
          answers[question.id] === null ||
          answers[question.id] === ""),
    );
    if (missing.length) {
      setNotice(
        `Uzupełnij wymagane punkty: ${missing.map((question) => question.label).join(", ")}`,
      );
      document
        .getElementById(`question-${missing[0].id}`)
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    setBusy(true);
    setNotice("");
    try {
      await api("/inspections", {
        method: "POST",
        body: JSON.stringify({
          formId,
          routeCheckId,
          vinOrSerialNumber: vin,
          stationId,
          status,
          answers: form.questions.map((q) => ({
            questionId: q.id,
            value: answers[q.id] ?? null,
          })),
        }),
      });
      setNotice("Inspekcja zapisana. Wynik oczekuje na potwierdzenie SCADA.");
      setOperatorNoticeKind("success");
      setVin("");
      setProductIdentified(false);
      setStatus("");
      setAnswers({});
      setQuestionIndex(0);
      setShowSummary(false);
      setRouteCheckId(null);
      setProduct(null);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (error) {
      setOperatorNoticeKind("error");
      setNotice(
        error instanceof Error ? error.message : "Nie udało się zapisać",
      );
    } finally {
      setBusy(false);
    }
  }

  async function identifyProduct(event: FormEvent) {
    event.preventDefault();
    const serialNumber = vin.trim();
    if (!serialNumber) return;
    setBusy(true);
    setNotice("");
    try {
      const result = await api<RouteCheckResult>("/scada/route-check", {
        method: "POST",
        body: JSON.stringify({ serialNumber, stationCode: stationId }),
      });
      if (!result.allowed) {
        setNotice(
          `Produkt ${serialNumber} nie ma zgody na inspekcję w tym procesie. Odłóż produkt i skontaktuj się z liderem linii.`,
        );
        setOperatorNoticeKind("error");
        return;
      }
      setVin(serialNumber);
      setRouteCheckId(result.routeCheckId);
      setProduct(result.integrationEnabled ? result.product : null);
      setProductIdentified(true);
      setNotice("SCADA zezwoliła na inspekcję.");
      setOperatorNoticeKind("success");
    } catch (error) {
      setOperatorNoticeKind("error");
      setNotice(
        error instanceof Error
          ? `Nie udało się sprawdzić produktu: ${error.message}`
          : "Nie udało się sprawdzić produktu. Spróbuj ponownie lub skontaktuj się z liderem linii.",
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
      setNotice("Odpowiedz na wymagane pytanie, aby przejść dalej.");
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
            onClick={() => setAnswers({ ...answers, [question.id]: true })}
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
            onClick={() => setAnswers({ ...answers, [question.id]: false })}
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
        <select
          {...common}
          value={String(answers[question.id] ?? "")}
          onChange={(e) =>
            setAnswers({ ...answers, [question.id]: e.target.value })
          }
        >
          <option value="">Wybierz…</option>
          {question.options?.map((option) => (
            <option key={option}>{option}</option>
          ))}
        </select>
      );
    if (question.type === "PHOTO_UPLOAD")
      return (
        <label className="upload-box">
          {answers[question.id] ? "✓ Zdjęcie dodane" : "Dodaj zdjęcie usterki"}
          <input
            type="file"
            accept="image/*"
            capture="environment"
            required={question.isRequired}
            onChange={(e) => void setPhoto(question.id, e.target.files?.[0])}
          />
        </label>
      );
    return (
      <input
        {...common}
        type={question.type === "NUMBER_RANGE" ? "number" : "text"}
        value={String(answers[question.id] ?? "")}
        onChange={(e) =>
          setAnswers({
            ...answers,
            [question.id]:
              question.type === "NUMBER_RANGE"
                ? Number(e.target.value)
                : e.target.value,
          })
        }
      />
    );
  }

  return (
    <main
      className={`station-shell${productIdentified && form ? " inspection-in-progress" : ""}`}
    >
      <header className="station-bar">
        <a className="brand" href="/inspection">
          <span>IH</span>
          <div>
            Inspect Hub<small>Tryb stanowiskowy</small>
          </div>
        </a>
        <div className="station-session">
          <span>
            <strong>
              {stationName || stationId || "Nieprzypisana stacja"}
            </strong>
            <small>{user?.name ?? "Dostęp publiczny"}</small>
          </span>
          {onLogout && (
            <button className="ghost" type="button" onClick={onLogout}>
              Wyloguj
            </button>
          )}
        </div>
      </header>
      <div className="workspace operator-workspace">
        <header className="page-heading operator-heading">
          <div>
            <p className="eyebrow">STANOWISKO KONTROLI</p>
            <h1>Nowa inspekcja</h1>
            <p className="heading-copy">
              Przeprowadź kontrolę zgodnie z aktywnym standardem jakości.
            </p>
          </div>
          <span className="online">
            <i /> System online
          </span>
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
                  ? "Inspekcja zablokowana"
                  : operatorNoticeKind === "success"
                    ? "Gotowe"
                    : "Informacja"}
              </strong>
              <small>{notice}</small>
            </span>
          </div>
        )}
        {loading && (
          <section className="panel operator-empty">
            <span className="spinner" />
            <h2>Ładuję standardy kontroli…</h2>
          </section>
        )}
        {!loading && stationName && availableForms.length === 0 && (
          <section className="panel operator-empty">
            <span className="empty-icon">!</span>
            <h2>Brak formularzy dla procesu</h2>
            <p className="muted">
              {stationProcessId
                ? "Administrator musi przypisać formularz do procesu tego stanowiska."
                : "Administrator musi najpierw przypisać proces do tego stanowiska."}
            </p>
            <form className="station-identify" onSubmit={identifyStation}>
              <input
                value={stationId}
                onChange={(e) => changeStation(e.target.value)}
                placeholder="ST-001"
                aria-label="Kod stanowiska"
              />
              <button className="secondary" disabled={identifying}>
                {identifying ? "Łączenie…" : "Zmień powiązanie"}
              </button>
            </form>
          </section>
        )}
        {!loading && !stationName && (
          <section className="panel operator-empty station-pairing-card">
            <span className="empty-icon station-device-icon">▦</span>
            <h2>Powiąż urządzenie ze stanowiskiem</h2>
            <p className="muted">
              Wpisz kod stanowiska. Przy kolejnych uruchomieniach zostanie ono
              rozpoznane automatycznie po urządzeniu i adresie IP. Jeśli kod
              jest nowy, stanowisko zostanie utworzone automatycznie.
            </p>
            <form className="station-identify" onSubmit={identifyStation}>
              <label>
                Kod stanowiska
                <input
                  value={stationId}
                  onChange={(e) => changeStation(e.target.value)}
                  placeholder="np. ST-001"
                  autoFocus
                  required
                />
              </label>
              <button className="primary" disabled={identifying}>
                {identifying ? "Łączenie…" : "Powiąż urządzenie"}
              </button>
            </form>
          </section>
        )}
        {!loading && availableForms.length > 0 && !productIdentified && (
          <section className="panel product-identification-card">
            <div className="serial-scan-icon" aria-hidden="true">
              ▤
            </div>
            <p className="eyebrow">IDENTYFIKACJA PRODUKTU</p>
            <h2>Zeskanuj numer seryjny</h2>
            <p className="muted">
              Użyj skanera lub wpisz numer ręcznie, aby rozpocząć inspekcję.
            </p>
            <form
              className="product-identification-form"
              onSubmit={identifyProduct}
            >
              <label htmlFor="inspection-serial-number">Numer seryjny</label>
              <div className="serial-input-row">
                <input
                  id="inspection-serial-number"
                  value={vin}
                  onChange={(event) => setVin(event.target.value)}
                  placeholder="Zeskanuj lub wpisz numer seryjny"
                  autoComplete="off"
                  autoFocus
                  required
                />
                <button className="primary" disabled={busy}>
                  {busy ? "Sprawdzanie trasy…" : "Rozpocznij inspekcję"}
                </button>
              </div>
            </form>
          </section>
        )}
        {!loading && availableForms.length > 0 && productIdentified && (
          <form onSubmit={submit}>
            <section
              className="panel inspection-meta"
              aria-label="Dane inspekcji"
            >
              <div className="meta-title">
                <span>01</span>
                <div>
                  <h2>Identyfikacja kontroli</h2>
                  <p>Wybierz standard i zeskanuj produkt.</p>
                </div>
              </div>
              <label>
                Formularz
                <select
                  value={formId}
                  onChange={(e) => {
                    setFormId(e.target.value);
                    setAnswers({});
                    setStatus("");
                    setQuestionIndex(0);
                    setShowSummary(false);
                  }}
                  required
                >
                  <option value="">Wybierz standard…</option>
                  {availableForms.map((item) => (
                    <option value={item.id} key={item.id}>
                      {item.code} · {item.title} · v{item.version}
                    </option>
                  ))}
                </select>
              </label>
              <dl className="inspection-context">
                <div>
                  <dt>Numer seryjny</dt>
                  <dd>{vin}</dd>
                </div>
                <div>
                  <dt>Stanowisko</dt>
                  <dd>
                    {stationName} · {stationId}
                  </dd>
                </div>
                {product && (
                  <>
                    <div>
                      <dt>Part number</dt>
                      <dd>{product.partNumber}</dd>
                    </div>
                    <div>
                      <dt>Rodzina</dt>
                      <dd>{product.productFamily}</dd>
                    </div>
                  </>
                )}
              </dl>
            </section>
            {form && (
              <div className="inspection-progress">
                <div>
                  <span>POSTĘP KONTROLI</span>
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
                  PYTANIE {questionIndex + 1} Z {form.questions.length}
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
                          Zdjęcie instruktażowe
                        </span>
                        <button
                          className="instruction-image"
                          type="button"
                          onClick={() =>
                            setEnlargedImage({
                              url: currentQuestion.instructionImageUrl!,
                              alt: `Instrukcja: ${currentQuestion.label}`,
                            })
                          }
                        >
                          <img
                            src={currentQuestion.instructionImageUrl}
                            alt={`Instrukcja: ${currentQuestion.label}`}
                          />
                          <span>⌕ Powiększ zdjęcie</span>
                        </button>
                      </div>
                    )}
                    <div className="question-answer">
                      <span className="question-section-label">Odpowiedź</span>
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
                    ← Wstecz
                  </button>
                  <button
                    className="primary next-question"
                    type="button"
                    onClick={goToNextQuestion}
                  >
                    {questionIndex === form.questions.length - 1
                      ? "Przejdź do podsumowania"
                      : "Dalej"}{" "}
                    →
                  </button>
                </div>
              </section>
            )}
            {form && showSummary && (
              <section className="panel inspection-summary final-summary">
                <p className="eyebrow">PODSUMOWANIE</p>
                <h2>{form.title}</h2>
                <dl>
                  <div>
                    <dt>Standard</dt>
                    <dd>{form.code}</dd>
                  </div>
                  <div>
                    <dt>Wersja</dt>
                    <dd>v{form.version}</dd>
                  </div>
                  <div>
                    <dt>Odpowiedzi</dt>
                    <dd>
                      {answeredCount} / {form.questions.length}
                    </dd>
                  </div>
                </dl>
                <div className="summary-divider" />
                <h3>Wynik inspekcji</h3>
                <div className="status-options">
                  {form.allowedStatuses.map((item) => (
                    <label
                      className={
                        status === item
                          ? "status-option selected"
                          : "status-option"
                      }
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
                <div className="step-actions summary-actions">
                  <button className="secondary" type="button" onClick={goBack}>
                    ← Wróć do pytania
                  </button>
                  <button className="primary submit-inspection" disabled={busy}>
                    {busy ? "Przesyłanie…" : "Zakończ inspekcję"}
                    <small>Zapisz wynik i wyślij do SCADA</small>
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
            <span>Developed by</span>
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
          aria-label="Powiększone zdjęcie instrukcji"
          onClick={() => setEnlargedImage(null)}
        >
          <button
            type="button"
            className="lightbox-close"
            aria-label="Zamknij powiększenie"
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

  if (!report) {
    return (
      <main className="public-report-state">
        <a className="brand" href="/">
          <span>IH</span> Inspect Hub
        </a>
        <section className="panel">
          {state === "loading" ? (
            <>
              <span className="spinner" />
              <h1>Ładowanie raportu…</h1>
            </>
          ) : state === "not-found" ? (
            <>
              <span className="report-state-icon">?</span>
              <h1>Nie znaleziono raportu</h1>
              <p>Sprawdź, czy adres raportu jest poprawny.</p>
            </>
          ) : (
            <>
              <span className="report-state-icon">!</span>
              <h1>Nie udało się pobrać raportu</h1>
              <p>Spróbuj ponownie później.</p>
            </>
          )}
        </section>
      </main>
    );
  }

  const passed = ["PASSED", "PASS", "OK", "ZDAŁ", "ZDAL"].includes(
    report.result.toUpperCase(),
  );
  const formatValue = (
    value: PublicInspectionReport["answers"][number]["value"],
  ) => {
    if (value === null || value === "") return "Brak odpowiedzi";
    if (typeof value === "boolean") return value ? "Tak" : "Nie";
    return String(value);
  };

  return (
    <main className="public-report-shell">
      <header className="report-nav print-hidden">
        <a className="brand" href="/">
          <span>IH</span> Inspect Hub
        </a>
        <button
          className="primary"
          type="button"
          onClick={() => window.print()}
        >
          Drukuj raport
        </button>
      </header>
      <article className="public-report">
        <header className="report-heading">
          <div>
            <p className="eyebrow">RAPORT Z INSPEKCJI</p>
            <h1>{report.serialNumber}</h1>
            <p>
              {report.form.name} · {report.form.code} · wersja{" "}
              {report.form.version}
            </p>
          </div>
          <span className={`report-result ${passed ? "pass" : "fail"}`}>
            {passed ? "✓" : "×"} {report.result}
          </span>
        </header>

        <section className="report-summary-grid">
          <div>
            <span>Wszystkie pytania</span>
            <strong>{report.summary.total}</strong>
          </div>
          <div>
            <span>Zaliczone</span>
            <strong className="report-ok">{report.summary.passed}</strong>
          </div>
          <div>
            <span>Niezaliczone</span>
            <strong className="report-nok">{report.summary.failed}</strong>
          </div>
        </section>

        <section className="report-section">
          <h2>Dane produktu</h2>
          <dl className="report-details">
            <div>
              <dt>Numer seryjny</dt>
              <dd>{report.serialNumber}</dd>
            </div>
            {report.partNumber && (
              <div>
                <dt>Part number</dt>
                <dd>{report.partNumber}</dd>
              </div>
            )}
            {report.productFamily && (
              <div>
                <dt>Rodzina produktu</dt>
                <dd>{report.productFamily}</dd>
              </div>
            )}
            {report.scadaUnitHistoryUrl && (
              <div>
                <dt>Historia produktu</dt>
                <dd>
                  <a
                    href={report.scadaUnitHistoryUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Otwórz historię w SCADA ↗
                  </a>
                </dd>
              </div>
            )}
          </dl>
        </section>

        <section className="report-section">
          <h2>Wykonanie</h2>
          <dl className="report-details">
            <div>
              <dt>Data i godzina</dt>
              <dd>
                {new Intl.DateTimeFormat("pl-PL", {
                  dateStyle: "long",
                  timeStyle: "medium",
                }).format(new Date(report.completedAt))}
              </dd>
            </div>
            <div>
              <dt>Stanowisko</dt>
              <dd>
                {report.station.name
                  ? `${report.station.name} (${report.station.code})`
                  : report.station.code}
              </dd>
            </div>
            <div>
              <dt>Proces</dt>
              <dd>{report.process ?? "—"}</dd>
            </div>
            {report.operatorName && (
              <div>
                <dt>Operator</dt>
                <dd>{report.operatorName}</dd>
              </div>
            )}
            <div>
              <dt>Synchronizacja z systemem zewnętrznym</dt>
              <dd>
                <span
                  className={`sync-status ${report.externalSyncStatus === "SYNCED" ? "synced" : "pending"}`}
                >
                  {report.externalSyncStatus === "SYNCED"
                    ? "Zsynchronizowano"
                    : "Oczekuje"}
                </span>
              </dd>
            </div>
          </dl>
        </section>

        <section className="report-section report-answers">
          <h2>Odpowiedzi</h2>
          {report.answers.map((answer, index) => (
            <article className="report-answer" key={answer.questionId}>
              <span className="answer-index">
                {String(index + 1).padStart(2, "0")}
              </span>
              <div>
                <h3>{answer.label}</h3>
                {answer.imageUrl ? (
                  <img src={answer.imageUrl} alt={`Zdjęcie: ${answer.label}`} />
                ) : (
                  <p>{formatValue(answer.value)}</p>
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
          Inspect Hub · Raport {report.publicReportId}
        </footer>
      </article>
    </main>
  );
}

function App() {
  const [user, setUser] = useState<SessionUser | null>(() => {
    const raw = localStorage.getItem("inspect-hub-user");
    return raw ? (JSON.parse(raw) as SessionUser) : null;
  });

  let path = window.location.pathname;
  if (path === "/") return <Dashboard />;
  const publicReportMatch = path.match(/^\/reports\/([^/]+)\/?$/);
  if (publicReportMatch) {
    return (
      <PublicReport publicReportId={decodeURIComponent(publicReportMatch[1])} />
    );
  }
  if (path === "/inspection") {
    return (
      <OperatorPanel user={user} onLogout={user ? logoutUser : undefined} />
    );
  }
  if (!user) {
    if (path !== "/login") {
      window.history.replaceState({}, "", "/login");
    }
    return (
      <Login
        onLogin={(session) => {
          localStorage.setItem("inspect-hub-token", session.accessToken);
          localStorage.setItem(
            "inspect-hub-user",
            JSON.stringify(session.user),
          );
          window.history.replaceState(
            {},
            "",
            session.user.role === "OPERATOR" ? "/inspection" : "/admin",
          );
          setUser(session.user);
        }}
      />
    );
  }

  function logoutUser() {
    localStorage.removeItem("inspect-hub-token");
    localStorage.removeItem("inspect-hub-user");
    window.history.replaceState({}, "", "/login");
    setUser(null);
  }

  if (user.role === "OPERATOR" && path !== "/inspection") {
    window.history.replaceState({}, "", "/inspection");
    path = "/inspection";
  } else if (path === "/login") {
    window.history.replaceState({}, "", "/admin");
    path = "/admin";
  }

  if (path !== "/admin") {
    window.history.replaceState({}, "", "/admin");
  }

  return (
    <>
      <nav>
        <a className="brand" href="/admin">
          <span>IH</span> Inspect Hub
        </a>
        <div className="nav-actions">
          <a className="station-link" href="/inspection">
            Otwórz stanowisko
          </a>
          <span className="user-chip">
            {user.name} · {user.role}
          </span>
          <button className="ghost" onClick={logoutUser}>
            Wyloguj
          </button>
        </div>
      </nav>
      <AdminPanel />
    </>
  );
}

export default App;
