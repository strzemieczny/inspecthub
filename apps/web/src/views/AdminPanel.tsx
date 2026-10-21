import { QuestionOrderEditor } from "../components/QuestionOrderEditor";
import { moveQuestion } from "../lib/question-order";
import { AdminSidebar } from "../components/AdminSidebar";
import { SkeletonImage } from "../components/SkeletonImage";
import { ViewSkeleton } from "../components/ViewSkeleton";
import type {
  FieldType,
  InspectionForm,
  InspectionQuestion,
  QuestionSeverity,
  Station,
} from "@inspect-hub/types";
import {
  lazy,
  Suspense,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { api, uploadImage, type SessionUser } from "../lib/api";

import { useUpdateGuard } from "../lib/use-update-guard";
import { useI18n } from "../lib/i18n";

import {
  emptyQuestion,
  hasNewFormDraftContent,
  NEW_FORM_DRAFT_KEY,
  type NewFormDraft,
  normalizePartNumbers,
  parseOptionsInput,
  questionSeverity,
  readNewFormDraft,
  removeEmptyOptions,
} from "./shared";

const ScadaSettingsPanel = lazy(() => import("./ScadaSettingsPanel"));
const AuditEventsPanel = lazy(() => import("./AuditEventsPanel"));
const FormRevisionHistory = lazy(() =>
  import("../components/FormRevisionHistory").then((module) => ({
    default: module.FormRevisionHistory,
  })),
);
const StationsManager = lazy(() =>
  import("../components/StationsManager").then((module) => ({
    default: module.StationsManager,
  })),
);
const UsersManager = lazy(() =>
  import("../components/UsersManager").then((module) => ({
    default: module.UsersManager,
  })),
);

export default function AdminPanel({ role }: { role: SessionUser["role"] }) {
  const canManageScada = role === "ADMIN";
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
  const [partNumbers, setPartNumbers] = useState<string[]>(
    initialDraft?.partNumbers ?? [],
  );
  const [partNumberInput, setPartNumberInput] = useState("");

  function addPartNumbers(value = partNumberInput) {
    setPartNumbers((current) => normalizePartNumbers([...current, value]));
    setPartNumberInput("");
  }
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
  const [uploadingImage, setUploadingImage] = useState<string | null>(null);
  const [stations, setStations] = useState<Station[]>([]);
  const [loading, setLoading] = useState(true);
  const [revisionsLoading, setRevisionsLoading] = useState(false);
  const [forms, setForms] = useState<InspectionForm[]>([]);
  const [editingForm, setEditingForm] = useState<InspectionForm | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewIndex, setPreviewIndex] = useState(0);
  const [revisions, setRevisions] = useState<InspectionForm[]>([]);
  const formContent = {
    title,
    code,
    statuses,
    nokStreakThreshold,
    requiresLogin,
    processIds,
    partNumbers: normalizePartNumbers([...partNumbers, partNumberInput]),
    questions,
  };
  const unsavedForm = editingForm
    ? JSON.stringify(formContent) !==
      JSON.stringify({
        title: editingForm.title,
        code: editingForm.code,
        statuses: editingForm.allowedStatuses,
        nokStreakThreshold: editingForm.nokStreakThreshold,
        requiresLogin: editingForm.requiresLogin,
        processIds: editingForm.processIds,
        partNumbers: editingForm.partNumbers ?? [],
        questions: editingForm.questions,
      })
    : hasNewFormDraftContent(formContent);
  useUpdateGuard(Boolean(loading || busy || uploadingImage || unsavedForm));
  const revisionRequest = useRef(0);
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
      .catch((reason: Error) => setNotice(reason.message))
      .finally(() => setLoading(false));
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
      partNumbers: normalizePartNumbers([...partNumbers, partNumberInput]),
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
    partNumbers,
    partNumberInput,
    questions,
    section,
    statuses,
    t,
    title,
  ]);

  async function editForm(form: InspectionForm) {
    const request = ++revisionRequest.current;
    setRevisionsLoading(true);
    setSection("forms-edit");
    setEditingForm(form);
    setRevisions([]);
    setTitle(form.title);
    setCode(form.code);
    setStatuses([...form.allowedStatuses]);
    setNokStreakThreshold(form.nokStreakThreshold);
    setRequiresLogin(form.requiresLogin);
    setProcessIds([...form.processIds]);
    setPartNumbers(form.partNumbers ?? []);
    setPartNumberInput("");
    setQuestions(structuredClone(form.questions));
    setNotice("");
    try {
      const history = await api<InspectionForm[]>(
        `/forms/${form.id}/revisions`,
      );
      if (request === revisionRequest.current) setRevisions(history);
    } catch (reason) {
      if (request === revisionRequest.current) {
        setNotice(
          reason instanceof Error ? reason.message : t("notice.revisionsError"),
        );
      }
    } finally {
      if (request === revisionRequest.current) setRevisionsLoading(false);
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
    setPartNumbers(draft?.partNumbers ?? []);
    setPartNumberInput("");
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
    setUploadingImage(`${id}:instruction`);
    try {
      updateQuestion(id, {
        instructionImageUrl: await uploadImage(file, "forms"),
      });
      setNotice(t("notice.instructionUploaded"));
    } catch (reason) {
      setNotice(
        reason instanceof Error ? reason.message : t("notice.uploadError"),
      );
    } finally {
      setBusy(false);
      setUploadingImage(null);
    }
  }

  async function uploadAnswerImage(
    id: string,
    answer: "ok" | "nok",
    file?: File,
  ) {
    if (!file) return;
    setBusy(true);
    setUploadingImage(`${id}:${answer}`);
    try {
      const imageUrl = await uploadImage(file, "forms");
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
      setUploadingImage(null);
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
            partNumbers: normalizePartNumbers([
              ...partNumbers,
              partNumberInput,
            ]),
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
        setPartNumbers([]);
        setPartNumberInput("");
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
      <AdminSidebar
        role={role}
        section={section}
        sidebarCollapsed={sidebarCollapsed}
        onToggle={toggleSidebar}
        onNewForm={startNewForm}
        onSectionChange={setSection}
      />
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
        <Suspense
          key={section}
          fallback={
            <ViewSkeleton
              variant={
                section === "settings"
                  ? "scada"
                  : section === "forms-new"
                    ? "form"
                    : section === "forms-edit"
                      ? "table"
                      : section
              }
            />
          }
        >
          {section === "logs" ? (
            <AuditEventsPanel />
          ) : section === "settings" ? (
            canManageScada ? (
              <ScadaSettingsPanel />
            ) : null
          ) : section === "users" ? (
            <UsersManager />
          ) : section === "stations" ? (
            <StationsManager
              stations={stations}
              onChange={loadStations}
              loading={loading}
            />
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
                    {loading && <ViewSkeleton variant="history" />}
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
                    {!loading && forms.length === 0 && (
                      <p className="muted">{t("form.empty")}</p>
                    )}
                  </div>
                  {editingForm && revisionsLoading && (
                    <ViewSkeleton variant="history" />
                  )}
                  {editingForm && !revisionsLoading && revisions.length > 0 && (
                    <Suspense fallback={<ViewSkeleton variant="history" />}>
                      <FormRevisionHistory
                        revisions={revisions}
                        code={editingForm.code}
                        processes={processes}
                      />
                    </Suspense>
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
                              setStatuses(
                                statuses.filter((_, i) => i !== index),
                              )
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
                    <label htmlFor="form-part-number">
                      Part Number (SCADA)
                    </label>
                    <div className="part-number-field">
                      <div
                        className="part-number-tags"
                        aria-label="Przypisane numery PN"
                      >
                        {partNumbers.map((partNumber) => (
                          <span className="part-number-tag" key={partNumber}>
                            <span title={partNumber}>{partNumber}</span>
                            <button
                              type="button"
                              aria-label={`Usuń PN ${partNumber}`}
                              disabled={busy}
                              onClick={() =>
                                setPartNumbers((current) =>
                                  current.filter(
                                    (value) => value !== partNumber,
                                  ),
                                )
                              }
                            >
                              <svg
                                width="12"
                                height="12"
                                viewBox="0 0 16 16"
                                fill="none"
                                aria-hidden="true"
                              >
                                <path
                                  d="m4 4 8 8M12 4l-8 8"
                                  stroke="currentColor"
                                  strokeWidth="1.6"
                                  strokeLinecap="round"
                                />
                              </svg>
                            </button>
                          </span>
                        ))}
                      </div>
                      <div className="part-number-entry">
                        <input
                          id="form-part-number"
                          value={partNumberInput}
                          onChange={(event) =>
                            setPartNumberInput(event.target.value)
                          }
                          onBlur={() => addPartNumbers()}
                          onKeyDown={(event) => {
                            if (
                              !event.nativeEvent.isComposing &&
                              ["Enter", ",", ";"].includes(event.key)
                            ) {
                              event.preventDefault();
                              addPartNumbers();
                            }
                          }}
                          onPaste={(event) => {
                            const value = event.clipboardData.getData("text");
                            if (/[\n,;]/.test(value)) {
                              event.preventDefault();
                              const input = event.currentTarget;
                              const combined =
                                partNumberInput.slice(
                                  0,
                                  input.selectionStart ??
                                    partNumberInput.length,
                                ) +
                                value +
                                partNumberInput.slice(
                                  input.selectionEnd ?? partNumberInput.length,
                                );
                              addPartNumbers(combined);
                            }
                          }}
                          placeholder="Dodaj numer PN…"
                          autoCapitalize="characters"
                          autoComplete="off"
                          disabled={busy}
                        />
                        <button
                          type="button"
                          disabled={busy || !partNumberInput.trim()}
                          onClick={() => addPartNumbers()}
                        >
                          <svg
                            width="15"
                            height="15"
                            viewBox="0 0 16 16"
                            fill="none"
                            aria-hidden="true"
                          >
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
                    {questions.length > 1 && (
                      <QuestionOrderEditor
                        key={editingForm?.id ?? "new-form"}
                        questions={questions}
                        disabled={busy}
                        onMove={(id, targetIndex) =>
                          setQuestions((current) =>
                            moveQuestion(current, id, targetIndex),
                          )
                        }
                      />
                    )}
                    {questions.map((question, index) => (
                      <article
                        className="panel question-card"
                        id={`question-editor-${question.id}`}
                        key={question.id}
                      >
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
                        <label>
                          {t("form.verificationDescription")}
                          <textarea
                            className="verification-description-input"
                            value={question.description ?? ""}
                            onChange={(event) =>
                              updateQuestion(question.id, {
                                description: event.target.value,
                              })
                            }
                            placeholder={t(
                              "form.verificationDescriptionPlaceholder",
                            )}
                            rows={3}
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
                                            translation?.options?.join(",") ??
                                            ""
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
                        ) : question.type !== "PHOTO_UPLOAD" ? (
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
                        ) : null}
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
                            <label
                              className={`upload-box answer-image-upload${uploadingImage === `${question.id}:ok` ? " is-uploading" : ""}`}
                              aria-busy={uploadingImage === `${question.id}:ok`}
                            >
                              {question.okImageUrl ? (
                                <>
                                  <SkeletonImage
                                    src={question.okImageUrl}
                                    alt="Wzorzec OK"
                                  />
                                  <span>{t("form.okReady")}</span>
                                </>
                              ) : (
                                t("form.addOk")
                              )}
                              {uploadingImage === `${question.id}:ok` && (
                                <span className="photo-upload-loader">
                                  <span
                                    className="spinner"
                                    aria-hidden="true"
                                  />
                                  <span>{t("inspection.uploadingPhoto")}</span>
                                </span>
                              )}
                              <input
                                type="file"
                                accept="image/png,image/jpeg,image/webp"
                                disabled={busy}
                                onChange={(e) =>
                                  void uploadAnswerImage(
                                    question.id,
                                    "ok",
                                    e.target.files?.[0],
                                  )
                                }
                              />
                            </label>
                            <label
                              className={`upload-box answer-image-upload nok${uploadingImage === `${question.id}:nok` ? " is-uploading" : ""}`}
                              aria-busy={
                                uploadingImage === `${question.id}:nok`
                              }
                            >
                              {question.nokImageUrl ? (
                                <>
                                  <SkeletonImage
                                    src={question.nokImageUrl}
                                    alt="Wzorzec NOK"
                                  />
                                  <span>{t("form.nokReady")}</span>
                                </>
                              ) : (
                                t("form.addNok")
                              )}
                              {uploadingImage === `${question.id}:nok` && (
                                <span className="photo-upload-loader">
                                  <span
                                    className="spinner"
                                    aria-hidden="true"
                                  />
                                  <span>{t("inspection.uploadingPhoto")}</span>
                                </span>
                              )}
                              <input
                                type="file"
                                accept="image/png,image/jpeg,image/webp"
                                disabled={busy}
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
                        <label
                          className={`upload-box${uploadingImage === `${question.id}:instruction` ? " is-uploading" : ""}`}
                          aria-busy={
                            uploadingImage === `${question.id}:instruction`
                          }
                        >
                          {question.instructionImageUrl
                            ? t("form.instructionReady")
                            : t("form.addInstruction")}
                          {uploadingImage === `${question.id}:instruction` && (
                            <span className="photo-upload-loader">
                              <span className="spinner" aria-hidden="true" />
                              <span>{t("inspection.uploadingPhoto")}</span>
                            </span>
                          )}
                          <input
                            type="file"
                            accept="image/png,image/jpeg,image/webp"
                            disabled={busy}
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
        </Suspense>
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
                    <p className="muted verification-description">
                      {questions[previewIndex].description}
                    </p>
                  )}
                  {questions[previewIndex].instructionImageUrl && (
                    <SkeletonImage
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
