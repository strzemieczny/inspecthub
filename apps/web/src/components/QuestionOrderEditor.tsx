import { useRef, useState } from "react";
import type { InspectionQuestion } from "@inspect-hub/types";
import { useI18n } from "../lib/i18n";
import "./QuestionOrderEditor.css";

export function QuestionOrderEditor({
  questions,
  disabled,
  onMove,
}: {
  questions: InspectionQuestion[];
  disabled: boolean;
  onMove: (id: string, targetIndex: number) => void;
}) {
  const { t } = useI18n();
  const listRef = useRef<HTMLOListElement>(null);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const draggedIndex = questions.findIndex(
    (question) => question.id === draggedId,
  );

  function move(question: InspectionQuestion, index: number) {
    if (disabled || index < 0 || index >= questions.length) return;
    onMove(question.id, index);
    setAnnouncement(
      t("form.questionMoved", {
        label: question.label || t("form.untitledQuestion"),
        position: index + 1,
        total: questions.length,
      }),
    );
  }

  function dropPosition(x: number, y: number): number | null {
    const row = document
      .elementFromPoint(x, y)
      ?.closest<HTMLElement>("[data-order-id]");
    if (!row || !listRef.current?.contains(row)) return null;
    const index = questions.findIndex(
      (item) => item.id === row.dataset.orderId,
    );
    return index < 0 ? null : index;
  }

  function finishDrag() {
    setDraggedId(null);
    setDropIndex(null);
  }

  return (
    <details className="panel question-order-editor" open>
      <summary>
        <span>{t("form.questionOrder")}</span>
        <small>{questions.length}</small>
      </summary>
      <p className="question-order-help">{t("form.questionOrderHelp")}</p>
      <ol className="question-order-list" ref={listRef}>
        {questions.map((question, index) => {
          const label = question.label || t("form.untitledQuestion");
          return (
            <li
              key={question.id}
              data-order-id={question.id}
              className={[
                draggedId === question.id ? "is-dragging" : "",
                draggedId && draggedIndex !== index && dropIndex === index
                  ? draggedIndex < index
                    ? "drop-after"
                    : "drop-before"
                  : "",
              ]
                .filter(Boolean)
                .join(" ")}
            >
              <span
                className="question-drag-handle"
                aria-hidden="true"
                title={t("form.dragQuestion", { label })}
                onPointerDown={(event) => {
                  if (disabled || questions.length < 2 || event.button !== 0)
                    return;
                  event.preventDefault();
                  event.currentTarget.setPointerCapture(event.pointerId);
                  setDraggedId(question.id);
                }}
                onPointerMove={(event) => {
                  if (!event.currentTarget.hasPointerCapture(event.pointerId))
                    return;
                  const position = dropPosition(event.clientX, event.clientY);
                  setDropIndex(position);
                  if (event.clientY < 40) window.scrollBy(0, -16);
                  else if (event.clientY > window.innerHeight - 40)
                    window.scrollBy(0, 16);
                }}
                onPointerUp={(event) => {
                  if (!event.currentTarget.hasPointerCapture(event.pointerId))
                    return;
                  const position = dropPosition(event.clientX, event.clientY);
                  if (position !== null && position !== index)
                    move(question, position);
                  event.currentTarget.releasePointerCapture(event.pointerId);
                  finishDrag();
                }}
                onPointerCancel={finishDrag}
                onLostPointerCapture={finishDrag}
              >
                <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                  {[6, 10, 14].flatMap((y) =>
                    [7, 13].map((x) => (
                      <circle key={`${x}-${y}`} cx={x} cy={y} r="1.4" />
                    )),
                  )}
                </svg>
              </span>
              <button
                type="button"
                className="question-order-title"
                onClick={() => {
                  const card = document.getElementById(
                    `question-editor-${question.id}`,
                  );
                  card?.scrollIntoView({
                    block: "start",
                    behavior: window.matchMedia(
                      "(prefers-reduced-motion: reduce)",
                    ).matches
                      ? "instant"
                      : "smooth",
                  });
                  card
                    ?.querySelector<HTMLInputElement>("input")
                    ?.focus({ preventScroll: true });
                }}
                title={t("form.editOrderedQuestion", { label })}
              >
                <span className="question-order-number">{index + 1}.</span>
                <span>{label}</span>
              </button>
              <select
                value={index}
                disabled={disabled || questions.length < 2}
                aria-label={t("form.questionPosition", { label })}
                onChange={(event) => move(question, Number(event.target.value))}
              >
                {questions.map((item, position) => (
                  <option key={item.id} value={position}>
                    {position + 1} / {questions.length}
                  </option>
                ))}
              </select>
              <div className="question-order-arrows">
                <button
                  type="button"
                  disabled={disabled || index === 0}
                  onClick={() => move(question, index - 1)}
                  aria-label={t("form.moveQuestionUp", { label })}
                  title={t("form.moveQuestionUp", { label })}
                >
                  <svg
                    viewBox="0 0 20 20"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    aria-hidden="true"
                  >
                    <path d="m5 12 5-5 5 5" />
                  </svg>
                </button>
                <button
                  type="button"
                  disabled={disabled || index === questions.length - 1}
                  onClick={() => move(question, index + 1)}
                  aria-label={t("form.moveQuestionDown", { label })}
                  title={t("form.moveQuestionDown", { label })}
                >
                  <svg
                    viewBox="0 0 20 20"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    aria-hidden="true"
                  >
                    <path d="m5 8 5 5 5-5" />
                  </svg>
                </button>
              </div>
            </li>
          );
        })}
      </ol>
      <p className="question-order-status" role="status" aria-live="polite">
        {announcement}
      </p>
    </details>
  );
}
