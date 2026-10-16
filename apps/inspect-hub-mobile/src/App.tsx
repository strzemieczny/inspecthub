import { useEffect, useEffectEvent, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  ScrollView,
  StatusBar,
  Text,
  View,
} from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import * as Crypto from "expo-crypto";
import type {
  InspectionAnswerValue,
  InspectionForm,
  RouteCheckResult,
  Station,
} from "@inspect-hub/types";
import { dataWedge, type Scan } from "../modules/zebra-datawedge/src";
import { api, ApiError, setApiSession } from "./api";
import {
  automaticStatus,
  hasValue,
  submissionFor,
  type Draft,
  type Session,
} from "./inspection";
import { storage } from "./storage";
import { Question } from "./Question";
import { Button, colors, Field, Photo, s } from "./ui";

export default function App() {
  return (
    <SafeAreaProvider>
      <OperatorApp />
    </SafeAreaProvider>
  );
}
function OperatorApp() {
  const [ready, setReady] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [station, setStation] = useState<Station | null>(null);
  const [forms, setForms] = useState<InspectionForm[]>([]);
  const [formId, setFormId] = useState("");
  const [stationCode, setStationCode] = useState("");
  const [serial, setSerial] = useState("");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState(false);
  const [loginOpen, setLoginOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [lastScan, setLastScan] = useState("");
  const running = useRef(false);
  const writes = useRef(Promise.resolve());
  const draftRef = useRef<Draft | null>(null);

  function message(value: string, isError = false) {
    setNotice(value);
    setError(isError);
  }
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
    if (!draftRef.current || draftRef.current.submission) return;
    void commitDraft(change(draftRef.current)).catch(() =>
      message(
        "Nie udało się zapisać szkicu w pamięci urządzenia. Nie zamykaj aplikacji.",
        true,
      ),
    );
  }
  async function run(task: () => Promise<void>) {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    message("");
    try {
      await task();
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 401) {
        setSession(null);
        setApiSession(null);
        await storage.saveSession(null).catch(() => {});
        setLoginOpen(true);
      }
      message(
        cause instanceof TypeError ||
          (cause instanceof Error && cause.name === "AbortError")
          ? "Brak odpowiedzi serwera. Sprawdź połączenie i ponów operację. Szkic pozostaje na urządzeniu."
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
        const [savedSession, savedStation, savedDraft] = await Promise.all([
          storage.session(),
          storage.station(),
          storage.draft(),
        ]);
        if (!active) return;
        setApiSession(savedSession);
        setSession(savedSession);
        setStation(savedStation);
        setStationCode(savedStation?.code ?? "");
        draftRef.current = savedDraft;
        setDraft(savedDraft);
        if (savedDraft) message("Przywrócono niedokończoną inspekcję.");
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

  const availableForms = forms.filter(
    (form) =>
      !form.archivedAt &&
      !!station?.process &&
      form.processIds.includes(station.process.id),
  );
  const selectedForm = availableForms.find((form) => form.id === formId);
  const currentQuestion = draft?.form.questions[draft.index];
  const locked = !!draft?.submission;
  const automatic = draft ? automaticStatus(draft.form, draft.answers) : null;
  const finalStatus = draft ? (automatic ?? draft.status) : "";
  const ownerMismatch =
    !!draft && draft.operatorId !== (session?.user.id ?? null);

  async function pair(code: string) {
    const [nextStation, nextForms] = await Promise.all([
      api<Station>("/stations/identify", {
        method: "POST",
        body: JSON.stringify({ code: code.trim().toUpperCase() }),
      }),
      api<InspectionForm[]>("/forms"),
    ]);
    if (!nextStation.active || !nextStation.process)
      throw new Error(
        "Stanowisko musi być aktywne i mieć przypisany proces. Skontaktuj się z administratorem.",
      );
    await storage.saveStation(nextStation);
    setStation(nextStation);
    setStationCode(nextStation.code);
    setForms(nextForms);
    setFormId(
      nextForms.find(
        (form) =>
          !form.archivedAt && form.processIds.includes(nextStation.process!.id),
      )?.id ?? "",
    );
    message(`Połączono ze stanowiskiem ${nextStation.name}.`);
  }
  async function handleStartInspection(value: string) {
    if (!station || !selectedForm || !value.trim()) return;
    if (selectedForm.requiresLogin && !session) {
      setLoginOpen(true);
      return;
    }
    const normalized = value.trim().toUpperCase();
    const checkedStation = await api<Station>("/stations/identify", {
      method: "POST",
      body: JSON.stringify({ code: station.code }),
    });
    if (
      !checkedStation.active ||
      !checkedStation.process ||
      !selectedForm.processIds.includes(checkedStation.process.id)
    ) {
      throw new Error(
        "Konfiguracja stanowiska uległa zmianie. Odśwież stanowisko i wybierz formularz.",
      );
    }
    const result = await api<RouteCheckResult>("/scada/route-check", {
      method: "POST",
      body: JSON.stringify({
        serialNumber: normalized,
        stationCode: station.code,
      }),
    });
    if (!result.allowed)
      throw new Error(
        "SCADA nie zezwala na inspekcję tej sztuki na tym stanowisku.",
      );
    await commitDraft({
      id: Crypto.randomUUID(),
      operatorId: session?.user.id ?? null,
      form: selectedForm,
      stationCode: station.code,
      serial: normalized,
      routeCheckId: result.routeCheckId,
      // This timestamp is recorded only by the scan/press handler, after route check.
      // eslint-disable-next-line react-hooks/purity
      startedAt: Date.now(),
      answers: {},
      correctedIds: [],
      status: "",
      index: 0,
      summary: selectedForm.questions.length === 0,
    });
    setSerial(normalized);
  }
  const onScan = useEffectEvent((scan: Scan) => {
    if (!ready || running.current || loginOpen) return;
    setLastScan(`${scan.data}${scan.symbology ? ` · ${scan.symbology}` : ""}`);
    if (draft) return; // A scan can never replace the current inspection's serial.
    if (!station) {
      setStationCode(scan.data);
      void run(() => pair(scan.data));
    } else {
      setSerial(scan.data);
      if (selectedForm) void run(() => handleStartInspection(scan.data));
    }
  });
  const onScannerResult = useEffectEvent(({ result }: { result: string }) => {
    message(
      result === "SUCCESS"
        ? "Profil skanera gotowy. Zeskanuj kod przyciskiem urządzenia."
        : `DataWedge: ${result}. Sprawdź profil InspectHubMobile.`,
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
      setLoginOpen(true);
      throw new Error("Zaloguj operatora, który rozpoczął tę inspekcję.");
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
        cause.status !== 408 &&
        cause.status !== 429
      ) {
        await commitDraft({ ...frozen, submission: undefined });
      }
      throw cause;
    }
    await commitDraft(null);
    setSerial("");
    message(
      "Inspekcja zapisana w Inspect Hub. Przekazanie wyniku do SCADA odbywa się po stronie serwera. Możesz zeskanować kolejną sztukę.",
    );
  }
  function discard() {
    Alert.alert(
      "Odrzucić inspekcję?",
      locked
        ? "Wysyłka mogła dotrzeć do serwera. Najpierw ponów zapis, aby potwierdzić wynik."
        : "Odpowiedzi zapisane na tym urządzeniu zostaną usunięte.",
      locked
        ? [{ text: "Wróć" }]
        : [
            { text: "Zachowaj", style: "cancel" },
            {
              text: "Odrzuć",
              style: "destructive",
              onPress: () =>
                void run(async () => {
                  await commitDraft(null);
                  setSerial("");
                }),
            },
          ],
    );
  }
  async function login() {
    const value = await api<Session>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email: email.trim(), password }),
    });
    if (draft && draft.operatorId !== value.user.id)
      throw new Error(
        "Tę inspekcję rozpoczął inny operator. Zaloguj się na jego konto lub odrzuć szkic.",
      );
    await storage.saveSession(value);
    setApiSession(value);
    setSession(value);
    setPassword("");
    setLoginOpen(false);
    message(`Zalogowano: ${value.user.name}.`);
  }

  return (
    <SafeAreaView style={s.safe}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.white} />
      <View style={s.header}>
        <Text style={s.brand}>Inspect Hub</Text>
        <View style={s.headerInfo}>
          <Text style={s.headerTitle}>
            {station?.name ?? "Stanowisko inspekcji"}
          </Text>
          <Text style={s.muted}>
            {station
              ? `${station.code} · ${station.process?.name ?? "Brak procesu"}`
              : "Połącz tablet ze stanowiskiem"}
          </Text>
        </View>
        <Button
          secondary
          disabled={busy || !ready}
          onPress={() => setLoginOpen(true)}
        >
          {session?.user.name ?? "Zaloguj operatora"}
        </Button>
      </View>
      {!ready ? (
        <ActivityIndicator
          size="large"
          color={colors.green}
          style={{ flex: 1 }}
        />
      ) : (
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={s.content}
        >
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
          {!draft ? (
            <>
              <View>
                <Text style={s.title}>
                  {station ? "Nowa inspekcja" : "Przygotuj stanowisko"}
                </Text>
                <Text style={s.subtitle}>
                  {station
                    ? "Wybierz formularz i zeskanuj kod sztuki."
                    : "Zeskanuj kod stanowiska lub wpisz go poniżej."}
                </Text>
              </View>
              <View style={s.panel}>
                <Field
                  label="Kod stanowiska"
                  value={stationCode}
                  autoCapitalize="characters"
                  editable={!busy}
                  onChangeText={setStationCode}
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
                      message(
                        "Wysłano konfigurację skanera. Oczekiwanie na potwierdzenie DataWedge.",
                      );
                    }}
                  >
                    Skonfiguruj skaner
                  </Button>
                </View>
                {!dataWedge ? (
                  <Text style={s.muted}>
                    Moduł skanera jest dostępny po zbudowaniu aplikacji na
                    Androida. Kod możesz wpisać ręcznie.
                  </Text>
                ) : null}
              </View>
              {station ? (
                <View style={s.panel}>
                  <Text style={s.label}>Formularz inspekcji</Text>
                  {availableForms.length ? (
                    availableForms.map((form) => (
                      <Button
                        key={form.id}
                        secondary
                        selected={form.id === formId}
                        disabled={busy}
                        onPress={() => setFormId(form.id)}
                      >
                        {form.title} · {form.code} · v{form.version}
                      </Button>
                    ))
                  ) : (
                    <Text style={s.body}>
                      {forms.length
                        ? "Brak formularzy dla procesu stanowiska. Skontaktuj się z administratorem."
                        : "Odśwież stanowisko, aby pobrać aktualne formularze."}
                    </Text>
                  )}
                  {selectedForm ? (
                    <>
                      <Field
                        label="Numer seryjny / VIN"
                        value={serial}
                        autoCapitalize="characters"
                        autoCorrect={false}
                        editable={!busy}
                        onChangeText={setSerial}
                        onSubmitEditing={() =>
                          void run(() => handleStartInspection(serial))
                        }
                      />
                      <View style={s.row}>
                        <Button
                          disabled={busy || !serial.trim()}
                          onPress={() =>
                            void run(() => handleStartInspection(serial))
                          }
                        >
                          Rozpocznij inspekcję
                        </Button>
                        {dataWedge ? (
                          <Button
                            secondary
                            disabled={busy}
                            onPress={() => dataWedge?.trigger()}
                          >
                            Skanuj kod
                          </Button>
                        ) : null}
                      </View>
                      {selectedForm.requiresLogin && !session ? (
                        <Text style={s.body}>
                          Ten formularz wymaga zalogowania operatora.
                        </Text>
                      ) : null}
                    </>
                  ) : null}
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
                <Button secondary disabled={busy} onPress={discard}>
                  Odrzuć inspekcję
                </Button>
              </View>
              {ownerMismatch ? (
                <View style={[s.notice, s.error]}>
                  <Text style={s.body}>
                    Zapis wymaga konta operatora, który rozpoczął inspekcję.
                  </Text>
                  <Button onPress={() => setLoginOpen(true)}>
                    Zaloguj operatora
                  </Button>
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
                <>
                  <Question
                    key={currentQuestion.id}
                    question={currentQuestion}
                    value={draft.answers[currentQuestion.id]}
                    disabled={busy || locked || ownerMismatch}
                    onChange={answer}
                    onUpload={(task) => void run(task)}
                  />
                  <View style={s.row}>
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
                      Poprzednie pytanie
                    </Button>
                    <Button disabled={busy || ownerMismatch} onPress={next}>
                      {draft.index === draft.form.questions.length - 1
                        ? "Przejdź do podsumowania"
                        : "Następne pytanie"}
                    </Button>
                  </View>
                </>
              ) : (
                <View style={s.panel}>
                  {draft.form.questions.map((q) => (
                    <View key={q.id} style={s.answerRow}>
                      <Text style={s.label}>{q.label}</Text>
                      {q.type === "PHOTO_UPLOAD" &&
                      typeof draft.answers[q.id] === "string" &&
                      draft.answers[q.id] ? (
                        <Photo
                          uri={String(draft.answers[q.id])}
                          label="Zdjęcie z inspekcji"
                        />
                      ) : (
                        <Text style={s.body}>
                          {typeof draft.answers[q.id] === "boolean"
                            ? draft.answers[q.id]
                              ? "OK"
                              : "NOK"
                            : String(draft.answers[q.id] ?? "Brak odpowiedzi")}
                        </Text>
                      )}
                    </View>
                  ))}
                  <Text style={s.label}>
                    {automatic !== null
                      ? `Wynik automatyczny: ${finalStatus || "brak pasującego statusu — sprawdź konfigurację formularza"}`
                      : "Wybierz wynik inspekcji"}
                  </Text>
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
                      Oczekiwanie na potwierdzenie zapisu. Ponów wysyłkę, aby
                      sprawdzić wynik. Odpowiedzi są zablokowane do czasu
                      potwierdzenia.
                    </Text>
                  ) : null}
                  <View style={s.row}>
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
                      {locked ? "Ponów zapis inspekcji" : "Zapisz inspekcję"}
                    </Button>
                  </View>
                </View>
              )}
            </>
          )}
          <Text style={s.muted}>Inspect Hub · Aplikacja operatora</Text>
        </ScrollView>
      )}
      <Modal
        visible={loginOpen}
        transparent
        animationType="fade"
        onRequestClose={() => {
          if (!busy) {
            setLoginOpen(false);
            setPassword("");
          }
        }}
      >
        <KeyboardAvoidingView behavior="padding" style={s.modal}>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            style={s.dialog}
            contentContainerStyle={s.panel}
          >
            <Text style={s.title}>Operator</Text>
            {session ? (
              <Text style={s.body}>Zalogowano: {session.user.name}</Text>
            ) : null}
            {notice && error ? (
              <Text accessibilityLiveRegion="polite" style={s.body}>
                {notice}
              </Text>
            ) : null}
            <Field
              label="E-mail"
              value={email}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              editable={!busy}
              onChangeText={setEmail}
            />
            <Field
              label="Hasło"
              value={password}
              secureTextEntry
              editable={!busy}
              onChangeText={setPassword}
              onSubmitEditing={() => void run(login)}
            />
            <Button
              disabled={busy || !email.trim() || !password}
              onPress={() => void run(login)}
            >
              Zaloguj
            </Button>
            {session ? (
              <Button
                secondary
                disabled={busy || !!draft}
                onPress={() =>
                  void run(async () => {
                    await storage.saveSession(null);
                    setApiSession(null);
                    setSession(null);
                    setLoginOpen(false);
                    setPassword("");
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
            <Button
              secondary
              disabled={busy}
              onPress={() => {
                setLoginOpen(false);
                setPassword("");
              }}
            >
              Zamknij
            </Button>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}
