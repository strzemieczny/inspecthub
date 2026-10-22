import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useI18n } from "../lib/i18n";
import "./ReportPhotoViewer.css";

export type ReportPhoto = { id: string; src: string; label: string };

export function ReportPhotoViewer({
  photos,
  initialIndex,
  onClose,
}: {
  photos: ReportPhoto[];
  initialIndex: number;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const thumbnailsRef = useRef<HTMLDivElement>(null);
  const zoomCenter = useRef<{ x: number; y: number } | null>(null);
  const ignoreNextClick = useRef(false);
  const gesture = useRef<{
    x: number;
    y: number;
    left: number;
    top: number;
  } | null>(null);
  const [index, setIndex] = useState(initialIndex);
  const [zoom, setZoom] = useState(1);
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const photo = photos[index]!;

  useLayoutEffect(() => {
    const strip = thumbnailsRef.current;
    const active = strip?.querySelector<HTMLButtonElement>(
      '[aria-pressed="true"]',
    );
    if (!strip || !active) return;
    const revealActive = () => {
      strip.scrollTo({
        left: active.offsetLeft - (strip.clientWidth - active.offsetWidth) / 2,
        top: 0,
      });
    };
    revealActive();
    const observer = new ResizeObserver(revealActive);
    observer.observe(strip);
    return () => observer.disconnect();
  }, [index]);

  useLayoutEffect(() => {
    const stage = stageRef.current;
    const center = zoomCenter.current;
    if (!stage || !center) return;
    // Apply the saved center after the canvas has its new dimensions,
    // before the browser paints the enlarged image.
    stage.scrollLeft = center.x * stage.scrollWidth - stage.clientWidth / 2;
    stage.scrollTop = center.y * stage.scrollHeight - stage.clientHeight / 2;
    zoomCenter.current = null;
  }, [zoom]);

  useEffect(() => {
    const dialog = dialogRef.current!;
    const previousOverflow = document.body.style.overflow;
    const previousFocus = document.activeElement;
    dialog.showModal();
    document.body.style.overflow = "hidden";
    return () => {
      dialog.close();
      document.body.style.overflow = previousOverflow;
      if (previousFocus instanceof HTMLElement) previousFocus.focus();
    };
  }, []);

  function selectPhoto(nextIndex: number) {
    if (nextIndex === index || nextIndex < 0 || nextIndex >= photos.length)
      return;
    setIndex(nextIndex);
    zoomCenter.current = null;
    setZoom(1);
    setFailed(false);
    setLoaded(false);
    stageRef.current?.scrollTo(0, 0);
  }

  function changeZoom(nextZoom: number) {
    const clampedZoom = Math.min(4, Math.max(1, nextZoom));
    if (clampedZoom === zoom) return;
    const stage = stageRef.current;
    if (stage) {
      zoomCenter.current = {
        x: (stage.scrollLeft + stage.clientWidth / 2) / stage.scrollWidth,
        y: (stage.scrollTop + stage.clientHeight / 2) / stage.scrollHeight,
      };
    }
    setZoom(clampedZoom);
  }

  return (
    <dialog
      ref={dialogRef}
      className="report-photo-viewer print-hidden"
      aria-label={t("report.photoViewer")}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      onKeyDown={(event) => {
        if (event.altKey || event.ctrlKey || event.metaKey) return;
        if (event.key === "+" || event.key === "=") {
          event.preventDefault();
          changeZoom(zoom + 0.5);
        }
        if (event.key === "-") {
          event.preventDefault();
          changeZoom(zoom - 0.5);
        }
        if (event.key === "0") {
          event.preventDefault();
          changeZoom(1);
        }
        if (zoom === 1 && event.key === "ArrowLeft") {
          event.preventDefault();
          selectPhoto(index - 1);
        }
        if (zoom === 1 && event.key === "ArrowRight") {
          event.preventDefault();
          selectPhoto(index + 1);
        }
      }}
    >
      <header className="report-photo-header">
        <div className="report-photo-caption" aria-live="polite">
          <span>
            {t("report.photoPosition", {
              current: index + 1,
              total: photos.length,
            })}
          </span>
          <h2>{photo.label}</h2>
        </div>
        <div
          className="report-photo-tools"
          role="group"
          aria-label={t("report.photoZoom")}
        >
          <button
            type="button"
            aria-label={t("inspection.zoomOut")}
            title={t("inspection.zoomOut")}
            disabled={zoom === 1 || failed}
            onClick={() => changeZoom(zoom - 0.5)}
          >
            −
          </button>
          <button
            type="button"
            className="report-photo-zoom"
            aria-label={t("inspection.resetZoom")}
            title={t("inspection.resetZoom")}
            onClick={() => changeZoom(1)}
          >
            {zoom * 100}%
          </button>
          <button
            type="button"
            aria-label={t("inspection.zoomIn")}
            title={t("inspection.zoomIn")}
            disabled={zoom === 4 || failed}
            onClick={() => changeZoom(zoom + 0.5)}
          >
            +
          </button>
        </div>
        <button
          autoFocus
          type="button"
          className="report-photo-close"
          aria-label={t("common.close")}
          title={t("common.close")}
          onClick={onClose}
        >
          ×
        </button>
      </header>

      <div className="report-photo-body">
        {photos.length > 1 && (
          <button
            type="button"
            className="report-photo-prev"
            aria-label={t("report.previousPhoto")}
            disabled={index === 0}
            onClick={() => selectPhoto(index - 1)}
          >
            ‹
          </button>
        )}
        <div
          className={`report-photo-stage${zoom > 1 ? " is-zoomed" : ""}`}
          ref={stageRef}
          tabIndex={0}
          role="region"
          aria-label={t("report.photo", { label: photo.label })}
          aria-busy={!loaded && !failed}
          onClick={(event) => {
            if (ignoreNextClick.current) {
              ignoreNextClick.current = false;
              return;
            }
            if (event.target instanceof HTMLImageElement || zoom > 1) {
              changeZoom(zoom === 1 ? 2 : 1);
            } else if (event.target === event.currentTarget) {
              onClose();
            }
          }}
          onPointerDown={(event) => {
            if (event.button !== 0) return;
            ignoreNextClick.current = false;
            gesture.current = {
              x: event.clientX,
              y: event.clientY,
              left: event.currentTarget.scrollLeft,
              top: event.currentTarget.scrollTop,
            };
            if (zoom > 1 && event.pointerType === "mouse")
              event.currentTarget.setPointerCapture(event.pointerId);
          }}
          onPointerMove={(event) => {
            if (!gesture.current || zoom === 1 || event.pointerType !== "mouse")
              return;
            event.currentTarget.scrollLeft =
              gesture.current.left + gesture.current.x - event.clientX;
            event.currentTarget.scrollTop =
              gesture.current.top + gesture.current.y - event.clientY;
          }}
          onPointerUp={(event) => {
            const start = gesture.current;
            gesture.current = null;
            if (start) {
              ignoreNextClick.current =
                Math.hypot(event.clientX - start.x, event.clientY - start.y) >
                5;
            }
            if (!start || zoom !== 1 || event.pointerType === "mouse") return;
            const dx = event.clientX - start.x;
            if (
              Math.abs(dx) > 60 &&
              Math.abs(dx) > Math.abs(event.clientY - start.y) * 1.5
            )
              selectPhoto(index + (dx < 0 ? 1 : -1));
          }}
          onPointerCancel={() => {
            gesture.current = null;
            ignoreNextClick.current = true;
          }}
        >
          {failed ? (
            <p className="report-photo-message" role="alert">
              {t("report.photoError")}
            </p>
          ) : (
            <>
              {!loaded && (
                <span className="report-photo-message" role="status">
                  {t("common.loading")}
                </span>
              )}
              <div
                className="report-photo-canvas"
                style={{ width: `${zoom * 100}%`, height: `${zoom * 100}%` }}
              >
                <img
                  key={photo.id}
                  src={photo.src}
                  alt={t("report.photo", { label: photo.label })}
                  draggable={false}
                  onLoad={() => setLoaded(true)}
                  onError={() => setFailed(true)}
                />
              </div>
            </>
          )}
        </div>
        {photos.length > 1 && (
          <button
            type="button"
            className="report-photo-next"
            aria-label={t("report.nextPhoto")}
            disabled={index === photos.length - 1}
            onClick={() => selectPhoto(index + 1)}
          >
            ›
          </button>
        )}
      </div>

      <footer className="report-photo-footer">
        {photos.length > 1 && (
          <div
            className="report-photo-thumbnails"
            ref={thumbnailsRef}
            role="group"
            aria-label={t("report.photoViewer")}
          >
            {photos.map((item, itemIndex) => (
              <button
                key={item.id}
                type="button"
                aria-label={t("report.photo", { label: item.label })}
                aria-pressed={itemIndex === index}
                onClick={() => selectPhoto(itemIndex)}
              >
                <img src={item.src} alt="" loading="lazy" draggable={false} />
              </button>
            ))}
          </div>
        )}
        <p>
          {t(
            zoom > 1
              ? "report.photoPanHint"
              : photos.length > 1
                ? "report.photoHint"
                : "report.photoSingleHint",
          )}
        </p>
      </footer>
    </dialog>
  );
}
