import { useState } from "react";
import { Text, View } from "react-native";
import type {
  InspectionAnswerValue,
  InspectionQuestion,
} from "@inspect-hub/types";
import { Button, Field, Photo, s } from "./ui";
import { uploadPhoto } from "./api";
import { PhotoCapture } from "./PhotoCapture";

export function Question({
  question: q,
  value,
  onChange,
  onUpload,
  disabled,
}: {
  question: InspectionQuestion;
  value: InspectionAnswerValue | undefined;
  onChange: (value: InspectionAnswerValue) => void;
  onUpload: (task: () => Promise<void>) => Promise<void>;
  disabled: boolean;
}) {
  const [measurement, setMeasurement] = useState(
    typeof value === "number" ? String(value) : "",
  );
  const photoQuestion = q.type === "PHOTO_UPLOAD";
  return (
    <View style={[s.panel, photoQuestion && s.photoQuestionPanel]}>
      <Text style={s.muted}>
        {q.isRequired ? "Odpowiedź wymagana" : "Odpowiedź opcjonalna"}
        {q.severity === "CRITICAL" || q.isCritical ? " · Cecha krytyczna" : ""}
      </Text>
      <Text style={[s.title, photoQuestion && s.photoQuestionTitle]}>
        {q.label}
      </Text>
      {q.description ? <Text style={s.subtitle}>{q.description}</Text> : null}
      {q.instructionImageUrl ? (
        <Photo
          uri={q.instructionImageUrl}
          label="Instrukcja"
          fit={photoQuestion}
        />
      ) : null}
      <View
        style={[
          s.row,
          photoQuestion &&
            (q.okImageUrl || q.nokImageUrl) &&
            s.photoQuestionReferences,
        ]}
      >
        {q.okImageUrl ? (
          <Photo
            uri={q.okImageUrl}
            label="Wzorzec OK"
            result="OK"
            fit={photoQuestion}
            onPress={q.type === "CHECKBOX" ? () => onChange(true) : undefined}
            selected={q.type === "CHECKBOX" && value === true}
            disabled={disabled}
          />
        ) : null}
        {q.nokImageUrl ? (
          <Photo
            uri={q.nokImageUrl}
            label="Wzorzec NOK"
            result="NOK"
            fit={photoQuestion}
            onPress={q.type === "CHECKBOX" ? () => onChange(false) : undefined}
            selected={q.type === "CHECKBOX" && value === false}
            disabled={disabled}
          />
        ) : null}
      </View>
      {q.type === "CHECKBOX" ? (
        <View style={s.row}>
          <View style={s.column}>
            <Button
              secondary
              selected={value === true}
              result="OK"
              disabled={disabled}
              onPress={() => onChange(true)}
            >
              OK
            </Button>
          </View>
          <View style={s.column}>
            <Button
              secondary
              selected={value === false}
              result="NOK"
              disabled={disabled}
              onPress={() => onChange(false)}
            >
              NOK
            </Button>
          </View>
        </View>
      ) : null}
      {q.type === "SELECT" ? (
        <View style={{ gap: 12 }}>
          {q.options?.map((option) => (
            <Button
              key={option}
              secondary
              selected={value === option}
              disabled={disabled}
              onPress={() => onChange(option)}
            >
              {option}
            </Button>
          ))}
        </View>
      ) : null}
      {q.type === "TEXT" ? (
        <Field
          label="Odpowiedź"
          value={typeof value === "string" ? value : ""}
          onChangeText={onChange}
          editable={!disabled}
          multiline
        />
      ) : null}
      {q.type === "NUMBER_RANGE" ? (
        <>
          {q.range ? (
            <Text style={s.body}>
              Zakres OK: {q.range.min} – {q.range.max}
            </Text>
          ) : null}
          <Field
            key={q.id}
            label="Wynik pomiaru"
            value={measurement}
            keyboardType="numbers-and-punctuation"
            editable={!disabled}
            onChangeText={(text) => {
              setMeasurement(text);
              const input = text.trim().replace(",", ".");
              const n = Number(input);
              onChange(input !== "" && Number.isFinite(n) ? n : null);
            }}
          />
        </>
      ) : null}
      {q.type === "PHOTO_UPLOAD" ? (
        <PhotoCapture
          key={typeof value === "string" ? value : "empty"}
          savedUri={typeof value === "string" && value ? value : undefined}
          disabled={disabled}
          onAccept={async (uri) => {
            let accepted = false;
            await onUpload(async () => {
              onChange(await uploadPhoto(uri));
              accepted = true;
            });
            if (!accepted) throw new Error("Nie udało się wysłać zdjęcia.");
          }}
        />
      ) : null}
      {!q.isRequired && value !== undefined && value !== null ? (
        <Button
          secondary
          disabled={disabled}
          onPress={() => {
            setMeasurement("");
            onChange(null);
          }}
        >
          Wyczyść odpowiedź
        </Button>
      ) : null}
    </View>
  );
}
