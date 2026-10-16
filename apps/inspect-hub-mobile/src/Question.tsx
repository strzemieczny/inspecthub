import { useState } from "react";
import { Text, View } from "react-native";
import * as ImagePicker from "expo-image-picker";
import type {
  InspectionAnswerValue,
  InspectionQuestion,
} from "@inspect-hub/types";
import { Button, Field, Photo, s } from "./ui";
import { uploadPhoto } from "./api";

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
  onUpload: (task: () => Promise<void>) => void;
  disabled: boolean;
}) {
  const [measurement, setMeasurement] = useState(
    typeof value === "number" ? String(value) : "",
  );
  async function photo() {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted)
      throw new Error(
        "Zezwól aplikacji na dostęp do aparatu w ustawieniach Androida.",
      );
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ["images"],
      quality: 0.75,
    });
    if (result.canceled) return;
    const asset = result.assets[0];
    onChange(await uploadPhoto(asset.uri, asset.mimeType ?? "image/jpeg"));
  }
  return (
    <View style={s.panel}>
      <Text style={s.muted}>
        {q.isRequired ? "Odpowiedź wymagana" : "Odpowiedź opcjonalna"}
        {q.severity === "CRITICAL" || q.isCritical ? " · Cecha krytyczna" : ""}
      </Text>
      <Text style={s.title}>{q.label}</Text>
      {q.description ? <Text style={s.subtitle}>{q.description}</Text> : null}
      {q.instructionImageUrl ? (
        <Photo uri={q.instructionImageUrl} label="Instrukcja" />
      ) : null}
      <View style={s.row}>
        {q.okImageUrl ? <Photo uri={q.okImageUrl} label="Wzorzec OK" /> : null}
        {q.nokImageUrl ? (
          <Photo uri={q.nokImageUrl} label="Wzorzec NOK" />
        ) : null}
      </View>
      {q.type === "CHECKBOX" ? (
        <View style={s.row}>
          <View style={s.column}>
            <Button
              secondary
              selected={value === true}
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
        <>
          {typeof value === "string" && value ? (
            <Photo uri={value} label="Zdjęcie z inspekcji" />
          ) : null}
          <Button secondary disabled={disabled} onPress={() => onUpload(photo)}>
            {value ? "Zrób nowe zdjęcie" : "Zrób zdjęcie"}
          </Button>
          <Text style={s.muted}>
            Przesłanie zdjęcia wymaga połączenia z serwerem.
          </Text>
        </>
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
