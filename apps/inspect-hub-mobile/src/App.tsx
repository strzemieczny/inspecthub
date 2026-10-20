import { useEffect, useEffectEvent, useRef, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Keyboard,
  Modal,
  Pressable,
  ScrollView,
  StatusBar,
  Text,
  type TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import * as Crypto from "expo-crypto";
import Feather from "@expo/vector-icons/Feather";
import type {
  InspectionAnswerValue,
  InspectionForm,
  RouteCheckResult,
  Station,
  MobileStationPairing,
} from "@inspect-hub/types";
import { dataWedge, type Scan } from "../modules/zebra-datawedge/src";
import { operatorDisplay } from "../modules/operator-display/src";
import { api, ApiError, setApiSession, setApiDevice } from "./api";
import {
  automaticStatus,
  hasValue,
  isPassed,
  submissionFor,
  type Draft,
  type Session,
} from "./inspection";
import { storage } from "./storage";
import { INACTIVITY_TIMEOUT_MS } from "./inactivity";
import { useInactivityLogout } from "./useInactivityLogout";
import { Question } from "./Question";
import { NumericKeypad } from "./NumericKeypad";
import { Button, colors, Field, IconButton, Photo, s } from "./ui";

export default function App() {
  return (
    <SafeAreaProvider>
      <OperatorApp />
    </SafeAreaProvider>
  );
}
function OperatorApp() {
  useEffect(() => {
    operatorDisplay?.activate();
    return () => operatorDisplay?.deactivate();
  }, []);
  const { width } = useWindowDimensions();
  const wideHeader = width >= 600;
  const [ready, setReady] = useState(false);
  const [session, setSession] = useState<
    (Session & { lastActiveAt?: number }) | null
  >(null);
  const [station, setStation] = useState<Station | null>(null);
  const [stationCode, setStationCode] = useState("");
  const [stationName, setStationName] = useState("");
  const [stationProcessName, setStationProcessName] = useState("");
  const [stationSettingsOpen, setStationSettingsOpen] = useState(false);
  const [serial, setSerial] = useState("");
  const [formChoice, setFormChoice] = useState<{
    serial: string;
    forms: InspectionForm[];
  } | null>(null);
  const serialInput = useRef<TextInput>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState(false);
  const [loginOpen, setLoginOpen] = useState(false);
  const [discardOpen, setDiscardOpen] = useState(false);
  const [loginIdentifier, setLoginIdentifier] = useState("");
  const [loginCardCode, setLoginCardCode] = useState("");
  const [pairingRequired, setPairingRequired] = useState(false);
  const [lastScan, setLastScan] = useState("");
  const running = useRef(false);
  const writes = useRef(Promise.resolve());
  const draftRef = useRef<Draft | null>(null);
  const inspectionAfterLogin = useRef<{
    serial: string;
    formId: string;
  } | null>(null);
  const recordActivity = useInactivityLogout(session, () => {
    setApiSession(null);
    setSession(null);
    void storage.saveSession(null).catch(() => {});
    closeOperatorLogin();
    message("Wylogowano po ponad 30 minutach bez aktywności.");
  });

  useEffect(() => {
    if (
      !ready ||
      !station ||
      draft ||
      busy ||
      loginOpen ||
      stationSettingsOpen ||
      formChoice
    )
      return;
    // The serial field remounts disabled while submit is still finishing.
    // Wait until it is editable and native layout has caught up before focusing.
    const frame = requestAnimationFrame(() => serialInput.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [ready, station, draft, busy, loginOpen, stationSettingsOpen, formChoice]);

  function message(value: string, isError = false) {
    setNotice(value);
    setError(isError);
  }
  function openOperatorLogin() {
    Keyboard.dismiss();
    setLoginIdentifier("");
    setLoginCardCode("");
    setPairingRequired(false);
    message("");
    setLoginOpen(true);
  }
  function closeOperatorLogin() {
    inspectionAfterLogin.current = null;
    setLoginOpen(false);
    setLoginIdentifier("");
    setLoginCardCode("");
    setPairingRequired(false);
  }
  useEffect(() => {
    if (!loginOpen) return;
    Keyboard.dismiss();
    const listener = Keyboard.addListener("keyboardDidShow", () =>
      Keyboard.dismiss(),
    );
    return () => listener.remove();
  }, [loginOpen]);
  function commitDraft(value: Draft | null): Promise<void> {
    draftRef.current = value;
    setDraft(value);
    const write = writes.current
      .catch(() => {})
      .then(() => storage.saveDraft(value));
    writes.current = write;
    return write;
  }
  function editDraft(change: (current: Draft) => Draft) {
    if (!recordActivity()) return;
    if (!draftRef.current || draftRef.current.submission) return;
    void commitDraft(change(draftRef.current)).catch(() =>
      message(
        "Nie udało się zapisać szkicu w pamięci urządzenia. Nie zamykaj aplikacji.",
        true,
      ),
    );
  }
  async function run(task: () => Promise<void>) {
    if (!recordActivity()) return;
    if (running.current) return;
    running.current = true;
    setBusy(true);
    message("");
    try {
      await task();
    } catch (cause) {
      if (cause instanceof ApiError && cause.code === "DEVICE_NOT_PAIRED") {
        setStation(null);
        setFormChoice(null);
        await storage.saveStation(null).catch(() => {});
      }
      if (cause instanceof ApiError && cause.status === 401) {
        setSession(null);
        setApiSession(null);
        await storage.saveSession(null).catch(() => {});
        if (!loginOpen) openOperatorLogin();
      }
      message(
        cause instanceof TypeError ||
          (cause instanceof Error && cause.name === "AbortError")
          ? "Brak połączenia. Spróbuj ponownie. Szkic został zachowany."
          : cause instanceof Error
            ? cause.message
            : "Operacja nie powiodła się. Spróbuj ponownie.",
        true,
      );
    } finally {
      running.current = false;
      setBusy(false);
    }
  }
  useEffect(() => {
    let active = true;
    async function restore() {
      try {
        const [storedSession, savedStation, savedDraft, device] =
          await Promise.all([
            storage.session(),
            storage.station(),
            storage.draft(),
            storage.device(),
          ]);
        if (!active) return;
        const expired =
          storedSession &&
          Date.now() - storedSession.lastActiveAt > INACTIVITY_TIMEOUT_MS;
        const savedSession = expired ? null : storedSession;
        if (expired) await storage.saveSession(null);
        if (!active) return;
        setApiDevice(device);
        setApiSession(savedSession);
        setSession(savedSession);
        setStation(savedStation);
        setStationCode(savedDraft?.stationCode ?? savedStation?.code ?? "");
        draftRef.current = savedDraft;
        setDraft(savedDraft);
        if (savedDraft) message("Przywrócono niedokończoną inspekcję.");
        try {
          const current = await api<Station>("/stations/mobile/current");
          if (!active) return;
          if (savedDraft && savedDraft.stationCode !== current.code) {
            setStation(null);
            await storage.saveStation(null);
            message(
              "Szkic należy do stanowiska " +
                savedDraft.stationCode +
                ". Połącz tablet z tym stanowiskiem.",
              true,
            );
          } else {
            setStation(current);
            setStationCode(current.code);
            await storage.saveStation(current);
          }
        } catch (cause) {
          if (!active) return;
          if (cause instanceof ApiError && cause.code === "DEVICE_NOT_PAIRED") {
            setStation(null);
            await storage.saveStation(null);
            if (savedStation || savedDraft)
              message(
                "Połącz tablet ze stanowiskiem. Zapisany szkic zostanie zachowany.",
                true,
              );
          } else
            message(
              "Nie udało się potwierdzić przypisania tabletu. Sprawdź połączenie i spróbuj ponownie.",
              true,
            );
        }
        if (expired) {
          message("Wylogowano po ponad 30 minutach bez aktywności.");
        }
      } catch {
        if (active)
          message(
            "Nie udało się odczytać danych urządzenia. Uruchom aplikację ponownie.",
            true,
          );
      } finally {
        if (active) setReady(true);
      }
    }
    void restore();
    return () => {
      active = false;
    };
  }, []);

  const currentQuestion = draft?.form.questions[draft.index];
  const locked = !!draft?.submission;
  const automatic = draft ? automaticStatus(draft.form, draft.answers) : null;
  const finalStatus = draft ? (automatic ?? draft.status) : "";
  const ownerMismatch =
    !!draft && draft.operatorId !== (session?.user.id ?? null);

  async function pair(code: string) {
    if (draft && code.trim().toUpperCase() !== draft.stationCode) {
      throw new Error(
        "Aby dokończyć zapisany szkic, połącz tablet ze stanowiskiem " +
          draft.stationCode +
          ".",
      );
    }
    const device = await storage.device();
    setApiDevice(device);
    const paired = await api<MobileStationPairing>("/stations/mobile/pair", {
      method: "POST",
      body: JSON.stringify({
        code: code.trim().toUpperCase(),
        deviceId: device.deviceId,
        name: stationName.trim() || undefined,
        processName: stationProcessName.trim() || undefined,
      }),
    });
    const nextStation = paired.station;
    if (!nextStation.active || !nextStation.process)
      throw new Error(
        "Stanowisko musi być aktywne i mieć przypisany proces. Skontaktuj się z administratorem.",
      );
    await storage.saveStation(nextStation);
    setStation(nextStation);
    setStationCode(nextStation.code);
    setStationName("");
    setStationProcessName("");
    setStationSettingsOpen(false);
    setFormChoice(null);
    message(`Połączono ze stanowiskiem ${nextStation.name}.`);
  }
  async function handleStartInspection(
    value: string,
    formId?: string,
    operatorSession = session,
  ) {
    if (!station || !value.trim()) return;
    const normalized = value.trim().toUpperCase();
    const checkedStation = await api<Station>("/stations/mobile/current");
    setStation(checkedStation);
    await storage.saveStation(checkedStation);
    if (!checkedStation.active || !checkedStation.process) {
      throw new Error(
        "Konfiguracja stanowiska uległa zmianie. Odśwież stanowisko.",
      );
    }
    const result = await api<RouteCheckResult>("/scada/route-check", {
      method: "POST",
      body: JSON.stringify({
        serialNumber: normalized,
        stationCode: checkedStation.code,
        formId,
      }),
    });
    if (!result.allowed)
      throw new Error("Ta sztuka nie może być sprawdzana na tym stanowisku.");
    if (result.forms?.length) {
      setSerial(normalized);
      setFormChoice({ serial: normalized, forms: result.forms });
      return;
    }
    const selectedForm = result.form;
    if (!selectedForm)
      throw new Error("Brak dopasowanego formularza dla produktu.");
    if (selectedForm.requiresLogin && !operatorSession) {
      inspectionAfterLogin.current = {
        serial: normalized,
        formId: selectedForm.id,
      };
      openOperatorLogin();
      return;
    }
    await commitDraft({
      id: Crypto.randomUUID(),
      operatorId: operatorSession?.user.id ?? null,
      form: selectedForm,
      stationCode: checkedStation.code,
      serial: normalized,
      routeCheckId: result.routeCheckId,
      // This timestamp is recorded only by the scan/press handler, after route check.
      startedAt: Date.now(),
      answers: {},
      correctedIds: [],
      status: "",
      index: 0,
      summary: selectedForm.questions.length === 0,
    });
    setSerial(normalized);
    setFormChoice(null);
  }
  async function login(identifier = loginIdentifier) {
    const normalizedIdentifier = identifier.trim().toUpperCase();
    if (!/^[A-Z0-9]{1,30}$/.test(normalizedIdentifier))
      throw new Error("Identyfikator musi zawierać od 1 do 30 liter lub cyfr.");
    if (pairingRequired && !/^\d{4}$/.test(loginCardCode))
      throw new Error("Kod z odwrotu karty musi mieć dokładnie 4 cyfry.");
    let value: Session | { requiresPairing: true; verification?: boolean };
    try {
      value = pairingRequired
        ? await api<Session>("/auth/pair-card", {
            method: "POST",
            body: JSON.stringify({
              identifier: normalizedIdentifier,
              cardCode: loginCardCode,
            }),
          })
        : await api<
            Session | { requiresPairing: true; verification?: boolean }
          >("/auth/card-login", {
            method: "POST",
            body: JSON.stringify({ identifier: normalizedIdentifier }),
          });
    } finally {
      setLoginCardCode("");
    }
    if ("requiresPairing" in value) {
      setLoginIdentifier(normalizedIdentifier);
      setPairingRequired(true);
      return;
    }
    if (draft && draft.operatorId !== value.user.id)
      throw new Error(
        "Tę inspekcję rozpoczął inny operator. Zaloguj się na jego konto lub odrzuć szkic.",
      );
    await storage.saveSession(value);
    setApiSession(value);
    setSession(value);
    const pendingInspection = inspectionAfterLogin.current;
    closeOperatorLogin();
    message(`Zalogowano: ${value.user.name}.`);
    if (pendingInspection) {
      await handleStartInspection(
        pendingInspection.serial,
        pendingInspection.formId,
        value,
      );
    }
  }
  const onScan = useEffectEvent((scan: Scan) => {
    if (!recordActivity()) return;
    if (!ready || running.current || discardOpen) return;
    if (loginOpen) {
      if (!pairingRequired) {
        const identifier = scan.data.trim().toUpperCase();
        setLoginIdentifier(identifier);
        void run(() => login(identifier));
      }
      return;
    }
    setLastScan(scan.data);
    if ((draft && station) || formChoice) return; // Keep the serial while inspecting or choosing a form.
    if (!station || stationSettingsOpen) {
      setStationCode(scan.data);
      void run(() => pair(scan.data));
    } else {
      setSerial(scan.data);
      void run(() => handleStartInspection(scan.data));
    }
  });
  const onScannerResult = useEffectEvent(({ result }: { result: string }) => {
    message(
      result === "SUCCESS"
        ? "Skaner gotowy."
        : "Nie udało się skonfigurować skanera. Skontaktuj się z administratorem.",
      result !== "SUCCESS",
    );
  });
  useEffect(() => {
    if (!dataWedge) return;
    const scan = dataWedge.addListener("onScan", (value) => onScan(value));
    const result = dataWedge.addListener("onResult", (value) =>
      onScannerResult(value),
    );
    return () => {
      scan.remove();
      result.remove();
    };
  }, []);

  function answer(value: InspectionAnswerValue) {
    if (!currentQuestion) return;
    const id = currentQuestion.id;
    editDraft((current) => {
      const previous = current.answers[id];
      const corrected =
        hasValue(previous) &&
        previous !== value &&
        !current.correctedIds.includes(id);
      return {
        ...current,
        answers: { ...current.answers, [id]: value },
        correctedIds: corrected
          ? [...current.correctedIds, id]
          : current.correctedIds,
      };
    });
  }
  function next() {
    if (!draft || !currentQuestion) return;
    if (
      currentQuestion.isRequired &&
      !hasValue(draft.answers[currentQuestion.id])
    ) {
      message("Odpowiedz na wymagane pytanie przed przejściem dalej.", true);
      return;
    }
    message("");
    editDraft((current) =>
      current.index === current.form.questions.length - 1
        ? { ...current, summary: true }
        : { ...current, index: current.index + 1 },
    );
  }
  async function submit() {
    if (!draft) return;
    if (ownerMismatch) {
      openOperatorLogin();
      throw new Error("Zaloguj operatora, który rozpoczął tę inspekcję.");
    }
    const current = await api<Station>("/stations/mobile/current");
    if (current.code !== draft.stationCode) {
      setStation(null);
      await storage.saveStation(null);
      throw new Error(
        "Szkic należy do stanowiska " +
          draft.stationCode +
          ". Połącz tablet z tym stanowiskiem.",
      );
    }
    const submission = submissionFor(draft, Date.now());
    // Persist before networking, so a restart after a lost response retries the exact same request.
    const frozen = { ...draft, submission, summary: true };
    await commitDraft(frozen);
    try {
      await api("/inspections", {
        method: "POST",
        body: JSON.stringify(submission),
      });
    } catch (cause) {
      // A definitive validation rejection permits correcting the answers. Network/5xx stays frozen.
      if (
        cause instanceof ApiError &&
        cause.status >= 400 &&
        cause.status < 500 &&
        cause.status !== 401 &&
        cause.code !== "DEVICE_NOT_PAIRED" &&
        cause.status !== 408 &&
        cause.status !== 429
      ) {
        await commitDraft({ ...frozen, submission: undefined });
      }
      throw cause;
    }
    await commitDraft(null);
    setSerial("");
    message("Inspekcja zapisana. Zeskanuj kolejną sztukę.");
  }
  function discard() {
    Keyboard.dismiss();
    setDiscardOpen(true);
  }

  return (
    <SafeAreaView
      style={s.safe}
      onTouchStart={recordActivity}
      onTouchMove={recordActivity}
    >
      <StatusBar hidden />
      <View style={s.header}>
        <View style={s.headerBrand} accessible accessibilityLabel="Inspect Hub">
          <Image
            // Metro resolves bundled images through a static require.
            // eslint-disable-next-line @typescript-eslint/no-require-imports
            source={require("../assets/brand-symbol.png")}
            style={s.brandMark}
            accessibilityIgnoresInvertColors
            accessible={false}
          />
          {width >= 900 ? <Text style={s.brand}>Inspect Hub</Text> : null}
        </View>
        <View style={s.headerInfo}>
          <Text
            style={s.headerTitle}
            numberOfLines={1}
            accessibilityLabel={
              station
                ? `${station.name}, ${station.code}, ${station.process?.name ?? "Brak procesu"}`
                : "Połącz urządzenie ze stanowiskiem"
            }
          >
            {station?.name ?? "Stanowisko inspekcji"}
          </Text>
          {wideHeader && station ? (
            <Text style={s.headerMeta} numberOfLines={1}>
              {station.code} · {station.process?.name ?? "Brak procesu"}
            </Text>
          ) : null}
        </View>
        <View style={s.headerActions}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={
              session ? `Operator: ${session.user.name}` : "Zaloguj operatora"
            }
            accessibilityState={{ disabled: busy || !ready }}
            disabled={busy || !ready}
            onPress={openOperatorLogin}
            style={({ pressed }) => [
              s.headerOperator,
              (busy || !ready) && s.dim,
              pressed && s.pressed,
            ]}
          >
            <View style={[s.headerAvatar, session && s.headerAvatarActive]}>
              {session ? (
                <Text style={s.headerInitials}>
                  {session.user.name
                    .trim()
                    .split(/\s+/)
                    .slice(0, 2)
                    .map((part) => part[0])
                    .join("")
                    .toUpperCase()}
                </Text>
              ) : (
                <Feather
                  name="user"
                  size={19}
                  color={colors.muted}
                  accessible={false}
                  importantForAccessibility="no"
                />
              )}
            </View>
            {wideHeader ? (
              <Text style={s.headerOperatorText} numberOfLines={1}>
                {session?.user.name ?? "Zaloguj operatora"}
              </Text>
            ) : null}
          </Pressable>
          {station && !draft ? (
            <IconButton
              icon={stationSettingsOpen ? "x" : "settings"}
              label={
                stationSettingsOpen
                  ? "Wróć do inspekcji"
                  : "Ustawienia stanowiska"
              }
              selected={stationSettingsOpen}
              disabled={busy || !ready || !!formChoice}
              onPress={() => {
                setStationCode(station.code);
                setStationName("");
                setStationProcessName("");
                setStationSettingsOpen((open) => !open);
              }}
            />
          ) : null}
        </View>
      </View>
      {!ready ? (
        <ActivityIndicator
          size="large"
          color={colors.green}
          style={{ flex: 1 }}
        />
      ) : (
        <ScrollView
          style={s.inspectionScroll}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={s.content}
        >
          {!operatorDisplay ? (
            <View accessibilityRole="alert" style={[s.notice, s.error]}>
              <Text style={s.body}>
                Ta wersja aplikacji nie obsługuje pełnego ekranu. Zainstaluj
                aktualną wersję APK.
              </Text>
            </View>
          ) : null}
          {notice ? (
            <View
              accessibilityLiveRegion="polite"
              style={[s.notice, error && s.error]}
            >
              <Text style={s.body}>{notice}</Text>
            </View>
          ) : null}
          {busy ? (
            <ActivityIndicator
              accessibilityLabel="Trwa operacja"
              color={colors.green}
            />
          ) : null}
          {!draft || !station ? (
            <>
              <View>
                <Text style={s.title}>
                  {stationSettingsOpen
                    ? "Ustawienia stanowiska"
                    : station
                      ? "Nowa inspekcja"
                      : "Przygotuj stanowisko"}
                </Text>
                <Text style={s.subtitle}>
                  {station && !stationSettingsOpen
                    ? "Zeskanuj lub wpisz kod sztuki."
                    : "Zeskanuj lub wpisz kod stanowiska."}
                </Text>
              </View>
              {!station || stationSettingsOpen ? (
                <View style={s.panel}>
                  <Field
                    label="Kod stanowiska"
                    value={stationCode}
                    autoCapitalize="characters"
                    editable={!busy}
                    onChangeText={(value) => {
                      if (recordActivity()) setStationCode(value);
                    }}
                    onSubmitEditing={() => void run(() => pair(stationCode))}
                  />
                  <Text style={s.muted}>
                    Nazwę i proces uzupełnij tylko dla nowego stanowiska.
                  </Text>
                  <Field
                    label="Nazwa nowego stanowiska"
                    value={stationName}
                    editable={!busy}
                    onChangeText={(value) => {
                      if (recordActivity()) setStationName(value);
                    }}
                  />
                  <Field
                    label="Proces inspekcji nowego stanowiska"
                    value={stationProcessName}
                    autoCorrect={false}
                    editable={!busy}
                    onChangeText={(value) => {
                      if (recordActivity()) setStationProcessName(value);
                    }}
                    onSubmitEditing={() => void run(() => pair(stationCode))}
                  />
                  <View style={s.row}>
                    <Button
                      secondary
                      disabled={busy || !stationCode.trim()}
                      onPress={() => void run(() => pair(stationCode))}
                    >
                      {station
                        ? "Odśwież / zmień stanowisko"
                        : "Połącz stanowisko"}
                    </Button>
                    <Button
                      secondary
                      disabled={busy || !dataWedge}
                      onPress={() => {
                        dataWedge?.configure();
                        message("Konfigurowanie skanera…");
                      }}
                    >
                      Skonfiguruj skaner
                    </Button>
                  </View>
                  {draft ? (
                    <>
                      <Text style={s.body}>
                        Zapisany szkic: stanowisko {draft.stationCode}.
                      </Text>
                      <Button secondary disabled={busy} onPress={discard}>
                        Odrzuć szkic
                      </Button>
                    </>
                  ) : null}
                  {!dataWedge ? (
                    <Text style={s.muted}>
                      Skaner niedostępny. Wpisz kod ręcznie.
                    </Text>
                  ) : null}
                </View>
              ) : null}
              {station && !stationSettingsOpen && formChoice ? (
                <View style={s.panel}>
                  <Text style={s.title}>Wybierz formularz</Text>
                  <Text style={s.body}>Sztuka: {formChoice.serial}</Text>
                  {formChoice.forms.map((form) => (
                    <Button
                      key={form.id}
                      secondary
                      disabled={busy}
                      onPress={() =>
                        void run(() =>
                          handleStartInspection(formChoice.serial, form.id),
                        )
                      }
                    >
                      {form.title} · {form.code} · v{form.version}
                    </Button>
                  ))}
                  <Button
                    secondary
                    disabled={busy}
                    onPress={() => {
                      setFormChoice(null);
                      setSerial("");
                    }}
                  >
                    Anuluj wybór
                  </Button>
                </View>
              ) : null}
              {station && !stationSettingsOpen && !formChoice ? (
                <View style={s.panel}>
                  <Field
                    label="Numer seryjny / VIN"
                    inputRef={serialInput}
                    value={serial}
                    showSoftInputOnFocus={false}
                    submitBehavior="submit"
                    returnKeyType="go"
                    autoCapitalize="characters"
                    autoCorrect={false}
                    editable={!busy}
                    onChangeText={(value) => {
                      if (!recordActivity()) return;
                      const normalized = value.replace(/[\r\n]+/g, "");
                      setSerial(normalized);
                      if (/[\r\n]/.test(value)) {
                        void run(() => handleStartInspection(normalized));
                      }
                    }}
                    onSubmitEditing={({ nativeEvent }) =>
                      void run(() => handleStartInspection(nativeEvent.text))
                    }
                  />
                </View>
              ) : null}
              {lastScan ? (
                <Text selectable style={s.muted}>
                  Ostatni skan: {lastScan}
                </Text>
              ) : null}
            </>
          ) : (
            <>
              <View style={s.row}>
                <View style={s.column}>
                  <Text style={s.muted}>
                    {draft.form.title} · v{draft.form.version} ·{" "}
                    {draft.stationCode}
                  </Text>
                  <Text selectable style={s.serial}>
                    {draft.serial}
                  </Text>
                </View>
              </View>
              {ownerMismatch ? (
                <View style={[s.notice, s.error]}>
                  <Text style={s.body}>
                    Zaloguj się na konto operatora, który rozpoczął inspekcję.
                  </Text>
                  <Button onPress={openOperatorLogin}>Zaloguj operatora</Button>
                </View>
              ) : null}
              <Text style={s.body}>
                {draft.summary
                  ? "Podsumowanie inspekcji"
                  : `Pytanie ${draft.index + 1} z ${draft.form.questions.length}`}
              </Text>
              <View style={s.progress}>
                <View
                  style={[
                    s.progressFill,
                    {
                      width: `${draft.summary ? 100 : (draft.index / Math.max(1, draft.form.questions.length)) * 100}%`,
                    },
                  ]}
                />
              </View>
              {!draft.summary && currentQuestion ? (
                <Question
                  key={currentQuestion.id}
                  question={currentQuestion}
                  value={draft.answers[currentQuestion.id]}
                  disabled={busy || locked || ownerMismatch}
                  onChange={answer}
                  onUpload={(task) => run(task)}
                />
              ) : (
                <View style={[s.panel, s.summaryPanel]}>
                  {draft.form.questions.map((q) => {
                    const value = draft.answers[q.id];
                    const passed = !hasValue(value)
                      ? null
                      : q.expectedValue !== undefined
                        ? value === q.expectedValue
                        : q.type === "NUMBER_RANGE" && q.range
                          ? typeof value === "number" &&
                            value >= q.range.min &&
                            value <= q.range.max
                          : q.type === "CHECKBOX" && typeof value === "boolean"
                            ? value
                            : null;
                    return (
                      <View key={q.id} style={s.answerRow}>
                        <View style={s.answerContent}>
                          <Text style={[s.label, s.answerLabel]}>
                            {q.label}
                          </Text>
                          {typeof value === "boolean" &&
                          passed === value ? null : q.type === "PHOTO_UPLOAD" &&
                            typeof value === "string" &&
                            value ? (
                            <Photo uri={value} label="Zdjęcie z inspekcji" />
                          ) : (
                            <Text
                              style={[
                                s.body,
                                passed === true && s.resultPassText,
                                passed === false && s.resultFailText,
                              ]}
                            >
                              {typeof value === "boolean"
                                ? value
                                  ? "OK"
                                  : "NOK"
                                : String(value ?? "Brak odpowiedzi")}
                            </Text>
                          )}
                        </View>
                        {passed !== null ? (
                          <View
                            style={[
                              s.resultBadge,
                              passed ? s.resultPass : s.resultFail,
                            ]}
                          >
                            <Feather
                              name={passed ? "check" : "x"}
                              size={16}
                              color={passed ? colors.green : colors.red}
                              accessible={false}
                            />
                            <Text
                              style={[
                                s.resultText,
                                passed ? s.resultPassText : s.resultFailText,
                              ]}
                            >
                              {passed ? "OK" : "NOK"}
                            </Text>
                          </View>
                        ) : null}
                      </View>
                    );
                  })}
                  <View style={s.summaryFooter}>
                    {finalStatus ? (
                      <View
                        style={[
                          s.summaryResult,
                          isPassed(finalStatus) ? s.resultPass : s.resultFail,
                        ]}
                      >
                        <Text style={s.muted}>Wynik inspekcji</Text>
                        <Text
                          style={[
                            s.label,
                            isPassed(finalStatus)
                              ? s.resultPassText
                              : s.resultFailText,
                          ]}
                        >
                          {finalStatus}
                        </Text>
                      </View>
                    ) : (
                      <Text style={s.label}>
                        {automatic !== null
                          ? "Nie można ustalić wyniku. Skontaktuj się z administratorem."
                          : "Wybierz wynik inspekcji"}
                      </Text>
                    )}
                    {automatic === null ? (
                      <View style={s.row}>
                        {draft.form.allowedStatuses.map((status) => (
                          <Button
                            key={status}
                            secondary
                            selected={draft.status === status}
                            disabled={busy || locked || ownerMismatch}
                            onPress={() =>
                              editDraft((current) => ({ ...current, status }))
                            }
                          >
                            {status}
                          </Button>
                        ))}
                      </View>
                    ) : null}
                    {locked ? (
                      <Text style={s.body}>
                        Brak potwierdzenia zapisu. Ponów zapis inspekcji.
                      </Text>
                    ) : null}
                  </View>
                </View>
              )}
            </>
          )}
        </ScrollView>
      )}
      {ready && station && (draft || (!stationSettingsOpen && !formChoice)) ? (
        <View style={s.inspectionActions}>
          {draft ? (
            <>
              <Button secondary disabled={busy} onPress={discard}>
                Odrzuć
              </Button>
              {!draft.summary && currentQuestion ? (
                <>
                  <Button
                    secondary
                    disabled={busy || draft.index === 0}
                    onPress={() =>
                      editDraft((current) => ({
                        ...current,
                        index: Math.max(0, current.index - 1),
                      }))
                    }
                  >
                    Wstecz
                  </Button>
                  <Button disabled={busy || ownerMismatch} onPress={next}>
                    {draft.index === draft.form.questions.length - 1
                      ? "Podsumowanie"
                      : "Dalej"}
                  </Button>
                </>
              ) : (
                <>
                  <Button
                    secondary
                    disabled={busy || locked || !draft.form.questions.length}
                    onPress={() =>
                      editDraft((current) => ({ ...current, summary: false }))
                    }
                  >
                    Wróć do pytań
                  </Button>
                  <Button
                    disabled={busy || ownerMismatch || !finalStatus}
                    onPress={() => void run(submit)}
                  >
                    {locked ? "Ponów zapis" : "Zapisz inspekcję"}
                  </Button>
                </>
              )}
            </>
          ) : (
            <>
              {dataWedge ? (
                <Button
                  secondary
                  disabled={busy}
                  onPress={() => dataWedge?.trigger()}
                >
                  Skanuj kod
                </Button>
              ) : null}
              <Button
                disabled={busy || !serial.trim()}
                onPress={() => void run(() => handleStartInspection(serial))}
              >
                Rozpocznij inspekcję
              </Button>
            </>
          )}
        </View>
      ) : null}
      <Modal
        visible={discardOpen && !!draft && !loginOpen}
        transparent
        animationType="fade"
        onShow={() => Keyboard.dismiss()}
        onRequestClose={() => {
          if (!busy) setDiscardOpen(false);
        }}
      >
        <View
          style={s.modal}
          onTouchStart={recordActivity}
          onTouchMove={recordActivity}
        >
          <ScrollView
            style={s.dialog}
            contentContainerStyle={[s.panel, s.discardPanel]}
            keyboardShouldPersistTaps="handled"
            accessibilityViewIsModal
          >
            <View style={s.discardIcon}>
              <Feather
                name={locked ? "alert-triangle" : "trash-2"}
                size={28}
                color={colors.red}
                accessible={false}
                importantForAccessibility="no"
              />
            </View>
            <Text style={s.loginTitle} accessibilityRole="header">
              {locked ? "Nie można odrzucić inspekcji" : "Odrzucić inspekcję?"}
            </Text>
            <Text style={s.body}>
              {locked
                ? "Najpierw ponów zapis, aby potwierdzić wynik."
                : "Wszystkie odpowiedzi zostaną usunięte. Tej operacji nie można cofnąć."}
            </Text>
            <View style={s.discardSubject}>
              <Text style={s.label} numberOfLines={2}>
                {draft?.form.title}
              </Text>
              <Text style={s.serial} numberOfLines={2}>
                {draft?.serial}
              </Text>
            </View>
            <View style={s.row}>
              <View style={s.discardAction}>
                <Button
                  secondary
                  disabled={busy}
                  onPress={() => setDiscardOpen(false)}
                >
                  Wróć
                </Button>
              </View>
              {!locked ? (
                <View style={s.discardAction}>
                  <Button
                    danger
                    disabled={busy}
                    onPress={() =>
                      void run(async () => {
                        if (!draftRef.current || draftRef.current.submission)
                          return;
                        setDiscardOpen(false);
                        await commitDraft(null);
                        setSerial("");
                      })
                    }
                  >
                    Odrzuć inspekcję
                  </Button>
                </View>
              ) : null}
            </View>
          </ScrollView>
        </View>
      </Modal>
      <Modal
        visible={loginOpen}
        transparent
        animationType="fade"
        onShow={() => Keyboard.dismiss()}
        onRequestClose={() => {
          if (!busy) {
            closeOperatorLogin();
          }
        }}
      >
        <View
          style={s.modal}
          onTouchStart={recordActivity}
          onTouchMove={recordActivity}
        >
          <ScrollView
            keyboardShouldPersistTaps="handled"
            style={s.dialog}
            contentContainerStyle={[s.panel, s.loginPanel]}
          >
            <Text style={s.loginTitle}>Logowanie operatora</Text>
            <Text style={s.body}>
              {pairingRequired
                ? "Podaj kod z odwrotu karty."
                : "Zeskanuj lub wpisz numer identyfikatora."}
            </Text>
            {session ? (
              <Text style={s.body}>Zalogowano: {session.user.name}</Text>
            ) : null}
            {notice && error ? (
              <Text accessibilityLiveRegion="polite" style={s.body}>
                {notice}
              </Text>
            ) : null}
            <Field
              label="Numer identyfikatora"
              style={s.loginNumber}
              value={loginIdentifier}
              autoCapitalize="characters"
              autoCorrect={false}
              keyboardType="number-pad"
              showSoftInputOnFocus={false}
              autoComplete="off"
              importantForAutofill="no"
              maxLength={30}
              editable={!busy && !pairingRequired}
              onChangeText={(value) => {
                if (!recordActivity()) return;
                setLoginIdentifier(
                  value.replace(/[^A-Za-z0-9]/g, "").toUpperCase(),
                );
              }}
              onSubmitEditing={() => {
                if (!pairingRequired) void run(() => login());
              }}
            />
            {pairingRequired ? (
              <>
                <Field
                  label="4-cyfrowy kod z odwrotu karty"
                  style={s.loginNumber}
                  value={loginCardCode}
                  keyboardType="number-pad"
                  showSoftInputOnFocus={false}
                  autoComplete="off"
                  importantForAutofill="no"
                  secureTextEntry
                  maxLength={4}
                  editable={!busy}
                  onChangeText={(value) => {
                    if (recordActivity())
                      setLoginCardCode(value.replace(/\D/g, ""));
                  }}
                  onSubmitEditing={() => void run(() => login())}
                />
              </>
            ) : null}
            <NumericKeypad
              value={pairingRequired ? loginCardCode : loginIdentifier}
              onChange={pairingRequired ? setLoginCardCode : setLoginIdentifier}
              maxLength={pairingRequired ? 4 : 30}
              disabled={busy}
            />
            <Button
              disabled={
                busy ||
                !loginIdentifier.trim() ||
                (pairingRequired && loginCardCode.length !== 4)
              }
              onPress={() => void run(() => login())}
            >
              {busy ? "Logowanie…" : "Zaloguj"}
            </Button>
            {pairingRequired ? (
              <Button secondary disabled={busy} onPress={openOperatorLogin}>
                Użyj innego identyfikatora
              </Button>
            ) : null}
            {session ? (
              <Button
                secondary
                disabled={busy || !!draft}
                onPress={() =>
                  void run(async () => {
                    await storage.saveSession(null);
                    setApiSession(null);
                    setSession(null);
                    closeOperatorLogin();
                  })
                }
              >
                Wyloguj operatora
              </Button>
            ) : null}
            {draft ? (
              <Text style={s.muted}>
                Zmiana operatora jest dostępna po zakończeniu lub odrzuceniu
                inspekcji.
              </Text>
            ) : null}
            <Button secondary disabled={busy} onPress={closeOperatorLogin}>
              Zamknij
            </Button>
          </ScrollView>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
