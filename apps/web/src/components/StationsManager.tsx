import { TableSkeletonRows } from "./ViewSkeleton";
import { Fragment, useState, type FormEvent } from "react";
import type { Station } from "@inspect-hub/types";
import { CompactSelect } from "./CompactSelect";
import { api } from "../lib/api";
import { useUpdateGuard } from "../lib/use-update-guard";
import { useI18n } from "../lib/i18n";

export function StationsManager({
  stations,
  onChange,
  loading = false,
}: {
  stations: Station[];
  loading?: boolean;
  onChange: () => Promise<void>;
}) {
  const { t, locale } = useI18n();
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [processName, setProcessName] = useState("");
  const [drafts, setDrafts] = useState<
    Record<string, { code: string; name: string; processName: string }>
  >({});
  const [notice, setNotice] = useState("");
  const [busyId, setBusyId] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const unsavedDraft = Object.entries(drafts).some(([id, draft]) => {
    const station = stations.find((item) => item.id === id);
    return (
      !station ||
      draft.code !== station.code ||
      draft.name !== station.name ||
      draft.processName !== (station.process?.name ?? "")
    );
  });
  useUpdateGuard(
    Boolean(loading || busyId || code || name || processName || unsavedDraft),
  );
  const query = search.trim().toLocaleLowerCase();
  const filtered = stations.filter(
    (station) =>
      (status === "all" || station.active === (status === "active")) &&
      [
        station.code,
        station.name,
        station.process?.name,
        station.ipAddress,
        station.mobileDeviceId,
      ].some((value) => value?.toLocaleLowerCase().includes(query)),
  );
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const start = (currentPage - 1) * pageSize;
  const visibleStations = filtered.slice(start, start + pageSize);

  function closeEditor() {
    if (expandedId) {
      setDrafts((current) => {
        const next = { ...current };
        delete next[expandedId];
        return next;
      });
    }
    setExpandedId(null);
  }

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
    const draft = drafts[station.id] ?? {
      code: station.code,
      name: station.name,
      processName: station.process?.name ?? "",
    };
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
      setExpandedId(null);
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

  async function unpairTablet(station: Station) {
    if (!window.confirm(t("stations.confirmUnpair", { code: station.code })))
      return;
    setBusyId(station.id);
    setNotice("");
    try {
      await api(`/stations/${station.id}/mobile-device`, { method: "DELETE" });
      setNotice(t("stations.tabletDisconnected"));
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
      <details className="station-add">
        <summary>{t("stations.add")}</summary>
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
      </details>
      <div className="stations-toolbar">
        <input
          type="search"
          aria-label={t("stations.search")}
          placeholder={t("stations.search")}
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            setPage(1);
          }}
        />
        <CompactSelect
          label={t("stations.status")}
          value={status}
          options={[
            { value: "all", label: t("stations.allStatuses") },
            { value: "active", label: t("stations.active") },
            { value: "inactive", label: t("stations.inactive") },
          ]}
          onChange={(value) => {
            setStatus(value);
            setPage(1);
          }}
        />
      </div>
      <div
        className="stations-table-scroll"
        role="region"
        aria-label={t("admin.stations")}
        tabIndex={0}
      >
        <table className="stations-table" aria-busy={loading}>
          <colgroup>
            <col className="station-col-code" />
            <col />
            <col />
            <col className="station-col-status" />
            <col className="station-col-tablet" />
            <col className="station-col-action" />
          </colgroup>
          <thead>
            <tr>
              <th scope="col">{t("stations.code")}</th>
              <th scope="col">{t("stations.name")}</th>
              <th scope="col">{t("stations.process")}</th>
              <th scope="col">{t("stations.status")}</th>
              <th scope="col">{t("stations.tablet")}</th>
              <th scope="col">{t("stations.details")}</th>
            </tr>
          </thead>
          <tbody>
            {loading && <TableSkeletonRows columns={6} />}
            {!loading &&
              visibleStations.map((station) => {
                const draft = drafts[station.id] ?? {
                  code: station.code,
                  name: station.name,
                  processName: station.process?.name ?? "",
                };
                const expanded = expandedId === station.id;
                return (
                  <Fragment key={station.id}>
                    <tr
                      className={
                        expanded
                          ? "station-summary expanded"
                          : "station-summary"
                      }
                    >
                      <td title={station.code}>
                        <strong>{station.code}</strong>
                      </td>
                      <td title={station.name}>{station.name}</td>
                      <td title={station.process?.name}>
                        {station.process?.name || "—"}
                      </td>
                      <td>
                        <span
                          className={
                            station.active
                              ? "station-state active"
                              : "station-state"
                          }
                        >
                          {station.active
                            ? t("stations.active")
                            : t("stations.inactive")}
                        </span>
                      </td>
                      <td>
                        <span
                          className={
                            station.mobileDeviceId ? "station-paired" : "muted"
                          }
                        >
                          {station.mobileDeviceId ? t("stations.paired") : "—"}
                        </span>
                      </td>
                      <td>
                        <button
                          type="button"
                          className="station-edit-button"
                          aria-expanded={expanded}
                          aria-controls={`station-editor-${station.id}`}
                          aria-label={`${t("stations.details")}: ${station.code}`}
                          disabled={busyId !== ""}
                          onClick={() => {
                            closeEditor();
                            if (!expanded) setExpandedId(station.id);
                          }}
                        >
                          {expanded ? t("common.close") : t("stations.details")}
                        </button>
                      </td>
                    </tr>
                    {expanded && (
                      <tr
                        className="station-editor-row"
                        id={`station-editor-${station.id}`}
                      >
                        <td colSpan={6}>
                          <form
                            className="station-editor"
                            onSubmit={(event) => {
                              event.preventDefault();
                              void updateStation(station);
                            }}
                          >
                            <div className="station-editor-fields">
                              <label>
                                {t("stations.code")}
                                <input
                                  required
                                  value={draft.code}
                                  onChange={(event) =>
                                    setDrafts((current) => ({
                                      ...current,
                                      [station.id]: {
                                        ...draft,
                                        code: event.target.value.toUpperCase(),
                                      },
                                    }))
                                  }
                                />
                              </label>
                              <label>
                                {t("stations.name")}
                                <input
                                  required
                                  value={draft.name}
                                  onChange={(event) =>
                                    setDrafts((current) => ({
                                      ...current,
                                      [station.id]: {
                                        ...draft,
                                        name: event.target.value,
                                      },
                                    }))
                                  }
                                />
                              </label>
                              <label>
                                {t("stations.process")}
                                <input
                                  required
                                  value={draft.processName}
                                  onChange={(event) =>
                                    setDrafts((current) => ({
                                      ...current,
                                      [station.id]: {
                                        ...draft,
                                        processName: event.target.value,
                                      },
                                    }))
                                  }
                                />
                              </label>
                            </div>
                            <dl className="station-device-details">
                              <div>
                                <dt>IP</dt>
                                <dd>{station.ipAddress ?? "—"}</dd>
                              </div>
                              <div>
                                <dt>{t("stations.tablet")}</dt>
                                <dd>
                                  {station.mobileDeviceId ??
                                    t("stations.unpaired")}
                                </dd>
                              </div>
                              <div>
                                <dt>{t("stations.lastSeen")}</dt>
                                <dd>
                                  {station.mobileLastSeenAt
                                    ? new Date(
                                        station.mobileLastSeenAt,
                                      ).toLocaleString(locale)
                                    : "—"}
                                </dd>
                              </div>
                            </dl>
                            <div className="station-editor-actions">
                              <button
                                className="primary"
                                disabled={busyId !== ""}
                              >
                                {t("common.save")}
                              </button>
                              <button
                                className="secondary"
                                type="button"
                                disabled={busyId !== ""}
                                onClick={closeEditor}
                              >
                                {t("common.close")}
                              </button>
                              <button
                                className="secondary"
                                type="button"
                                disabled={busyId !== ""}
                                onClick={() =>
                                  void updateStation(station, {
                                    active: !station.active,
                                  })
                                }
                              >
                                {station.active
                                  ? t("stations.deactivate")
                                  : t("stations.activate")}
                              </button>
                              {station.mobileDeviceId && (
                                <button
                                  className="secondary"
                                  type="button"
                                  disabled={busyId !== ""}
                                  onClick={() => void unpairTablet(station)}
                                >
                                  {t("stations.unpairTablet")}
                                </button>
                              )}
                              <button
                                className="icon-button danger"
                                type="button"
                                disabled={busyId !== ""}
                                onClick={() => void removeStation(station)}
                              >
                                {t("common.delete")}
                              </button>
                            </div>
                          </form>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            {!loading && filtered.length === 0 && (
              <tr>
                <td colSpan={6} className="stations-empty">
                  {t(stations.length ? "stations.noMatches" : "stations.empty")}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="stations-pagination">
        <span aria-live="polite">
          {t("stations.range", {
            from: filtered.length ? start + 1 : 0,
            to: Math.min(start + pageSize, filtered.length),
            count: filtered.length,
          })}
        </span>
        <div className="stations-page-size">
          <span>{t("stations.perPage")}</span>
          <CompactSelect
            label={t("stations.perPage")}
            value={String(pageSize)}
            placement="top"
            options={[20, 50, 100].map((size) => ({
              value: String(size),
              label: String(size),
            }))}
            onChange={(value) => {
              setPageSize(Number(value));
              setPage(1);
            }}
          />
        </div>
        <div className="stations-page-buttons">
          <button
            className="secondary"
            type="button"
            disabled={currentPage === 1}
            onClick={() => setPage(currentPage - 1)}
          >
            {t("stations.previous")}
          </button>
          <span>
            {currentPage} / {pageCount}
          </span>
          <button
            className="secondary"
            type="button"
            disabled={currentPage === pageCount}
            onClick={() => setPage(currentPage + 1)}
          >
            {t("stations.next")}
          </button>
        </div>
      </div>
      {notice && <p className="notice">{notice}</p>}
    </section>
  );
}
