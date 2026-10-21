import { SkeletonImage } from "../components/SkeletonImage";
import { ViewSkeleton } from "../components/ViewSkeleton";
import type {
  InspectionAnswerValue,
  InspectionForm,
  InspectionQuestion,
  RouteCheckResult,
  Station,
} from "@inspect-hub/types";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import {
  api,
  uploadImage,
  type CardLoginResult,
  type Session,
  type SessionUser,
} from "../lib/api";

import { SettingsMenu, useI18n } from "../lib/i18n";
import { appPath, appRoute } from "../lib/routing";

import {
  OFFLINE_INSPECTION_CONTEXT_KEY,
  canAssessAutomatically,
  createClientId,
  isPassedStatus,
  isQuestionAnswerOk,
  localizeQuestion,
  questionSeverity,
  readInspectionQueue,
  writeInspectionQueue,
} from "./shared";
export default function OperatorPanel({
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
  const [serialScannerOpen, setSerialScannerOpen] = useState(false);
  const [serialScannerError, setSerialScannerError] = useState("");
  const [serialPhotoBusy, setSerialPhotoBusy] = useState(false);
  const serialScannerVideo = useRef<HTMLVideoElement>(null);
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
  const [uploadingPhotoId, setUploadingPhotoId] = useState<string | null>(null);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [showSummary, setShowSummary] = useState(false);
  const [enlargedImage, setEnlargedImage] = useState<{
    url: string;
    alt: string;
  } | null>(null);
  const [imageZoom, setImageZoom] = useState(1);
  const lightboxStageRef = useRef<HTMLDivElement>(null);
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
        (question) =>
          question.type !== "PHOTO_UPLOAD" &&
          question.isRequired &&
          !canAssessAutomatically(question),
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

  useEffect(() => {
    if (!serialScannerOpen) return;

    let cancelled = false;
    let scannerControls: { stop: () => void } | null = null;

    const stopScanner = () => {
      scannerControls?.stop();
      if (serialScannerVideo.current) {
        const stream = serialScannerVideo.current.srcObject;
        if (stream instanceof MediaStream) {
          stream.getTracks().forEach((track) => track.stop());
        }
        serialScannerVideo.current.srcObject = null;
      }
    };

    const startScanner = async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setSerialScannerError(t("inspection.cameraUnsupported"));
        return;
      }

      try {
        const video = serialScannerVideo.current;
        if (!video) return;
        const { BrowserMultiFormatReader } = await import("@zxing/browser");
        const reader = new BrowserMultiFormatReader(undefined, {
          delayBetweenScanAttempts: 150,
          delayBetweenScanSuccess: 500,
        });
        const controls = await reader.decodeFromConstraints(
          {
            audio: false,
            video: { facingMode: { ideal: "environment" } },
          },
          video,
          (result) => {
            if (cancelled || !result) return;
            const serialNumber = result.getText().trim();
            if (!serialNumber) return;
            setVin(serialNumber.toUpperCase());
            setNotice(t("inspection.cameraScanned"));
            setOperatorNoticeKind("success");
            setSerialScannerOpen(false);
          },
        );
        if (cancelled) controls.stop();
        else scannerControls = controls;
      } catch (error) {
        if (cancelled) return;
        const denied =
          error instanceof DOMException &&
          (error.name === "NotAllowedError" || error.name === "SecurityError");
        setSerialScannerError(
          t(
            denied
              ? "inspection.cameraPermissionDenied"
              : "inspection.cameraError",
          ),
        );
      }
    };

    void startScanner();
    return () => {
      cancelled = true;
      stopScanner();
    };
  }, [serialScannerOpen, t]);

  useEffect(() => {
    if (!serialScannerOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSerialScannerOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [serialScannerOpen]);

  async function scanSerialFromPhoto(file?: File) {
    if (!file) return;
    setSerialPhotoBusy(true);
    const imageUrl = URL.createObjectURL(file);
    try {
      const { BarcodeFormat, BrowserMultiFormatReader } =
        await import("@zxing/browser");
      const reader = new BrowserMultiFormatReader();
      reader.possibleFormats = [
        BarcodeFormat.CODE_128,
        BarcodeFormat.CODE_39,
        BarcodeFormat.CODE_93,
        BarcodeFormat.EAN_13,
        BarcodeFormat.EAN_8,
        BarcodeFormat.ITF,
        BarcodeFormat.UPC_A,
        BarcodeFormat.UPC_E,
        BarcodeFormat.QR_CODE,
        BarcodeFormat.DATA_MATRIX,
        BarcodeFormat.PDF_417,
      ];

      const image = await new Promise<HTMLImageElement>((resolve, reject) => {
        const element = new Image();
        element.onload = () => resolve(element);
        element.onerror = reject;
        element.src = imageUrl;
      });

      let decodedText = "";
      const cropRatios = [1, 0.82, 0.64];
      for (const cropRatio of cropRatios) {
        const sourceWidth = Math.round(image.naturalWidth * cropRatio);
        const sourceHeight = Math.round(image.naturalHeight * cropRatio);
        const sourceX = Math.round((image.naturalWidth - sourceWidth) / 2);
        const sourceY = Math.round((image.naturalHeight - sourceHeight) / 2);
        const outputScale = Math.min(
          1,
          1800 / Math.max(sourceWidth, sourceHeight),
        );
        const outputWidth = Math.max(1, Math.round(sourceWidth * outputScale));
        const outputHeight = Math.max(
          1,
          Math.round(sourceHeight * outputScale),
        );

        for (const rotate of [false, true]) {
          const canvas = document.createElement("canvas");
          canvas.width = rotate ? outputHeight : outputWidth;
          canvas.height = rotate ? outputWidth : outputHeight;
          const context = canvas.getContext("2d", {
            willReadFrequently: true,
          });
          if (!context) continue;
          if (rotate) {
            context.translate(canvas.width, 0);
            context.rotate(Math.PI / 2);
          }
          context.drawImage(
            image,
            sourceX,
            sourceY,
            sourceWidth,
            sourceHeight,
            0,
            0,
            outputWidth,
            outputHeight,
          );

          try {
            decodedText = reader.decodeFromCanvas(canvas).getText().trim();
          } catch {
            const pixels = context.getImageData(
              0,
              0,
              canvas.width,
              canvas.height,
            );
            for (let index = 0; index < pixels.data.length; index += 4) {
              const gray =
                pixels.data[index] * 0.299 +
                pixels.data[index + 1] * 0.587 +
                pixels.data[index + 2] * 0.114;
              const contrasted = gray < 150 ? 0 : 255;
              pixels.data[index] = contrasted;
              pixels.data[index + 1] = contrasted;
              pixels.data[index + 2] = contrasted;
            }
            context.putImageData(pixels, 0, 0);
            try {
              decodedText = reader.decodeFromCanvas(canvas).getText().trim();
            } catch {
              // Continue with another crop or orientation.
            }
          }
          if (decodedText) break;
        }
        if (decodedText) break;
      }

      const serialNumber = decodedText;
      if (!serialNumber) throw new Error("Empty barcode");
      setVin(serialNumber.toUpperCase());
      setNotice(t("inspection.cameraScanned"));
      setOperatorNoticeKind("success");
      setSerialScannerOpen(false);
    } catch {
      setSerialScannerError(t("inspection.cameraPhotoUnreadable"));
    } finally {
      URL.revokeObjectURL(imageUrl);
      setSerialPhotoBusy(false);
    }
  }

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
        setFormId("");
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
          setFormId("");
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
      setFormId("");
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
    const handleLightboxKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setEnlargedImage(null);
      if (event.key === "+" || event.key === "=") {
        setImageZoom((zoom) => Math.min(4, zoom + 0.5));
      }
      if (event.key === "-") {
        setImageZoom((zoom) => Math.max(1, zoom - 0.5));
      }
      if (event.key === "0") setImageZoom(1);
    };
    window.addEventListener("keydown", handleLightboxKey);
    return () => window.removeEventListener("keydown", handleLightboxKey);
  }, [enlargedImage]);

  useEffect(() => {
    const stage = lightboxStageRef.current;
    if (!stage || imageZoom === 1) return;
    const frame = window.requestAnimationFrame(() => {
      stage.scrollTo({
        left: (stage.scrollWidth - stage.clientWidth) / 2,
        top: (stage.scrollHeight - stage.clientHeight) / 2,
      });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [imageZoom]);

  async function setPhoto(questionId: string, file?: File) {
    if (!file) return;
    setUploadingPhotoId(questionId);
    try {
      const url = await uploadImage(file, "inspections");
      updateAnswer(questionId, url);
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : t("notice.uploadError"),
      );
    } finally {
      setUploadingPhotoId(null);
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
    const clientSubmissionId = createClientId();
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
    const serialNumber = vin.trim().toUpperCase();
    if (!serialNumber) return;
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
      const matchedForm = result.form;
      if (!matchedForm)
        throw new Error("Brak dopasowanego formularza dla produktu.");
      if (matchedForm.requiresLogin && !user) {
        setNotice(t("inspection.loginRequired"));
        setOperatorNoticeKind("error");
        openOperatorLogin();
        return;
      }
      setForms((current) => [
        ...current.filter((item) => item.id !== matchedForm.id),
        matchedForm,
      ]);
      setFormId(matchedForm.id);
      setAnswers({});
      setStatus("");
      setQuestionIndex(0);
      setShowSummary(false);
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
              <SkeletonImage src={question.okImageUrl} alt="Wzorzec OK" />
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
              <SkeletonImage src={question.nokImageUrl} alt="Wzorzec NOK" />
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
      const isUploadingPhoto = uploadingPhotoId === question.id;
      return (
        <label
          className={`upload-box inspection-photo-upload${photoUrl ? " has-photo" : ""}${isUploadingPhoto ? " is-uploading" : ""}`}
          aria-busy={isUploadingPhoto}
        >
          {photoUrl && (
            <SkeletonImage
              src={photoUrl}
              alt={t("inspection.uploadedPhoto", { label: question.label })}
            />
          )}
          <span className="photo-upload-action">
            {photoUrl ? t("inspection.retakePhoto") : t("inspection.addPhoto")}
          </span>
          {isUploadingPhoto && (
            <span className="photo-upload-loader">
              <span className="spinner" aria-hidden="true" />
              <span>{t("inspection.uploadingPhoto")}</span>
            </span>
          )}
          <input
            type="file"
            accept="image/*"
            capture="environment"
            required={question.isRequired}
            disabled={isUploadingPhoto}
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
        <a className="brand" href={appRoute(language, "/inspection")}>
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
        {loading && <ViewSkeleton variant="inspection" />}
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
                  onChange={(event) => setVin(event.target.value.toUpperCase())}
                  placeholder={t("inspection.serialPlaceholder")}
                  autoComplete="off"
                  autoCapitalize="characters"
                  autoFocus
                  required
                />
                <button
                  className="secondary camera-scan-button"
                  type="button"
                  aria-label={t("inspection.openCamera")}
                  title={t("inspection.openCamera")}
                  onClick={() => {
                    setSerialScannerError("");
                    setSerialScannerOpen(true);
                  }}
                >
                  <svg
                    viewBox="0 0 24 24"
                    width="22"
                    height="22"
                    aria-hidden="true"
                  >
                    <path
                      d="M8.4 5.5 9.6 3.8h4.8l1.2 1.7H19a2 2 0 0 1 2 2v10.7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7.5a2 2 0 0 1 2-2h3.4Z"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinejoin="round"
                    />
                    <circle
                      cx="12"
                      cy="12.7"
                      r="3.6"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                    />
                  </svg>
                </button>
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
                </div>
              </div>
              <label>
                {t("inspection.form")}
                <input
                  readOnly
                  value={
                    form
                      ? `${form.code} · ${form.title} · v${form.version}`
                      : ""
                  }
                />
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
                      <p className="muted verification-description">
                        {currentQuestion.description}
                      </p>
                    )}
                    {currentQuestion.instructionImageUrl && (
                      <div className="instruction-visual">
                        <span className="question-section-label">
                          {t("inspection.instructionPhoto")}
                        </span>
                        <button
                          className="instruction-image"
                          type="button"
                          onClick={() => {
                            setImageZoom(1);
                            setEnlargedImage({
                              url: currentQuestion.instructionImageUrl!,
                              alt: t("aria.instruction", {
                                label: currentQuestion.label,
                              }),
                            });
                          }}
                        >
                          <SkeletonImage
                            src={currentQuestion.instructionImageUrl}
                            alt={t("aria.instruction", {
                              label: currentQuestion.label,
                            })}
                          />
                          <span className="instruction-enlarge">
                            {t("inspection.enlarge")}
                          </span>
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
      {serialScannerOpen && (
        <div
          className="serial-scanner-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setSerialScannerOpen(false);
            }
          }}
        >
          <section
            className="serial-scanner-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="serial-scanner-title"
          >
            <button
              className="dialog-close"
              type="button"
              aria-label={t("common.close")}
              onClick={() => setSerialScannerOpen(false)}
            >
              ×
            </button>
            <h2 id="serial-scanner-title">{t("inspection.cameraTitle")}</h2>
            <p className="muted">{t("inspection.cameraHelp")}</p>
            <div className="serial-camera-preview">
              <video
                ref={serialScannerVideo}
                muted
                playsInline
                aria-label={t("inspection.cameraPreview")}
              />
              {!serialScannerError && (
                <div className="serial-camera-target" aria-hidden="true" />
              )}
              {serialScannerError && (
                <div className="serial-camera-error" role="alert">
                  {serialScannerError}
                </div>
              )}
            </div>
            {serialScannerError && (
              <label
                className={`secondary serial-photo-button${serialPhotoBusy ? " disabled" : ""}`}
              >
                <input
                  className="serial-photo-input"
                  type="file"
                  accept="image/*"
                  capture="environment"
                  disabled={serialPhotoBusy}
                  onChange={(event) => {
                    const file = event.currentTarget.files?.[0];
                    event.currentTarget.value = "";
                    void scanSerialFromPhoto(file);
                  }}
                />
                <span aria-hidden="true">▣</span>
                {serialPhotoBusy
                  ? t("inspection.cameraPhotoReading")
                  : t("inspection.cameraTakePhoto")}
              </label>
            )}
            <button
              className="secondary"
              type="button"
              onClick={() => setSerialScannerOpen(false)}
            >
              {t("inspection.cameraCancel")}
            </button>
          </section>
        </div>
      )}
      {enlargedImage && (
        <div
          className="image-lightbox"
          role="dialog"
          aria-modal="true"
          aria-label={t("inspection.enlargedImage")}
          onClick={() => setEnlargedImage(null)}
        >
          <div
            className="lightbox-toolbar"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              aria-label={t("inspection.zoomOut")}
              disabled={imageZoom === 1}
              onClick={() => setImageZoom((zoom) => Math.max(1, zoom - 0.5))}
            >
              −
            </button>
            <button
              className="lightbox-zoom-value"
              type="button"
              aria-label={t("inspection.resetZoom")}
              onClick={() => setImageZoom(1)}
            >
              {Math.round(imageZoom * 100)}%
            </button>
            <button
              type="button"
              aria-label={t("inspection.zoomIn")}
              disabled={imageZoom === 4}
              onClick={() => setImageZoom((zoom) => Math.min(4, zoom + 0.5))}
            >
              +
            </button>
          </div>
          <button
            type="button"
            className="lightbox-close"
            aria-label={t("inspection.closeImage")}
            onClick={() => setEnlargedImage(null)}
          >
            ×
          </button>
          <div className="image-lightbox-stage" ref={lightboxStageRef}>
            <div
              className="image-lightbox-canvas"
              style={{
                width: `${imageZoom * 100}%`,
                height: `${imageZoom * 100}%`,
              }}
            >
              <img
                className={imageZoom === 1 ? "can-zoom-in" : "can-zoom-out"}
                src={enlargedImage.url}
                alt={enlargedImage.alt}
                style={{ transform: `scale(${imageZoom})` }}
                onClick={(event) => {
                  event.stopPropagation();
                  setImageZoom((zoom) => (zoom === 1 ? 2 : 1));
                }}
              />
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
