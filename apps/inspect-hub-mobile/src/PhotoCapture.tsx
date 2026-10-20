import {
  useCallback,
  useEffect,
  useEffectEvent,
  useRef,
  useState,
} from "react";
import {
  ActivityIndicator,
  AppState,
  BackHandler,
  Image,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { CameraView } from "expo-camera";
import { File } from "expo-file-system";
import { Button, colors, s } from "./ui";

export function PhotoCapture({
  disabled,
  onCancel,
  onAccept,
}: {
  disabled: boolean;
  onCancel: () => void;
  onAccept: (uri: string) => Promise<void>;
}) {
  const camera = useRef<CameraView>(null);
  const mounted = useRef(true);
  const capturing = useRef(false);
  const sending = useRef(false);
  const temporaryPhoto = useRef<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [foreground, setForeground] = useState(
    AppState.currentState === "active",
  );
  const [ready, setReady] = useState(false);
  const [taking, setTaking] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const attachCamera = useCallback((instance: CameraView | null) => {
    camera.current = instance;
    if (!instance) setReady(false);
  }, []);

  function deletePhoto() {
    const uri = temporaryPhoto.current;
    temporaryPhoto.current = null;
    if (!uri) return;
    try {
      const file = new File(uri);
      if (file.exists) file.delete();
    } catch {
      // Cache cleanup must not prevent taking another photo.
    }
  }

  const back = useEffectEvent(() => {
    if (!capturing.current && !sending.current) onCancel();
    return true;
  });
  useEffect(() => {
    mounted.current = true;
    const appState = AppState.addEventListener("change", (state) => {
      setReady(false);
      setForeground(state === "active");
    });
    const backHandler = BackHandler.addEventListener("hardwareBackPress", back);
    return () => {
      mounted.current = false;
      appState.remove();
      backHandler.remove();
      deletePhoto();
    };
  }, []);

  async function takePhoto() {
    if (!camera.current || !ready || disabled || capturing.current) return;
    capturing.current = true;
    setTaking(true);
    setError("");
    try {
      const photo = await camera.current.takePictureAsync({ quality: 0.75 });
      temporaryPhoto.current = photo.uri;
      if (!mounted.current) {
        deletePhoto();
        return;
      }
      setReady(false);
      setPreview(photo.uri);
    } catch {
      if (mounted.current)
        setError("Nie udało się zrobić zdjęcia. Spróbuj ponownie.");
    } finally {
      capturing.current = false;
      if (mounted.current) setTaking(false);
    }
  }

  async function acceptPhoto() {
    if (!preview || disabled || sending.current) return;
    sending.current = true;
    setUploading(true);
    try {
      await onAccept(preview);
    } catch {
      if (mounted.current)
        setError("Nie udało się wysłać zdjęcia. Spróbuj ponownie.");
    } finally {
      sending.current = false;
      if (mounted.current) setUploading(false);
    }
  }

  return (
    <View style={styles.container}>
      <View style={styles.viewport}>
        {preview ? (
          <Image
            source={{ uri: preview }}
            accessibilityLabel="Podgląd zdjęcia"
            style={styles.camera}
            resizeMode="contain"
          />
        ) : foreground && !disabled ? (
          <CameraView
            ref={attachCamera}
            style={styles.camera}
            facing="back"
            mode="picture"
            mute
            ratio="4:3"
            onCameraReady={() => setReady(true)}
            onMountError={() => {
              setReady(false);
              setError(
                "Nie można uruchomić aparatu. Zamknij go i spróbuj ponownie.",
              );
            }}
          />
        ) : null}
        {!preview && !ready && !error && foreground && !disabled ? (
          <View style={styles.loading} pointerEvents="none">
            <ActivityIndicator
              color={colors.white}
              accessibilityLabel="Uruchamianie aparatu"
            />
          </View>
        ) : null}
      </View>
      {error ? (
        <Text
          style={[s.body, s.resultFailText]}
          accessibilityLiveRegion="polite"
        >
          {error}
        </Text>
      ) : null}
      <View style={s.row}>
        {preview ? (
          <>
            <Button
              secondary
              disabled={taking || uploading}
              onPress={() => {
                deletePhoto();
                setError("");
                setReady(false);
                setPreview(null);
              }}
            >
              Powtórz
            </Button>
            <Button
              disabled={disabled || uploading}
              onPress={() => void acceptPhoto()}
            >
              {uploading ? "Wysyłanie zdjęcia…" : "Użyj zdjęcia"}
            </Button>
          </>
        ) : (
          <Button
            disabled={disabled || !foreground || !ready || taking}
            onPress={() => void takePhoto()}
          >
            {taking ? "Robienie zdjęcia…" : "Zrób zdjęcie"}
          </Button>
        )}
        <Button secondary disabled={taking || uploading} onPress={onCancel}>
          Anuluj
        </Button>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 16 },
  viewport: {
    height: 360,
    width: "100%",
    borderRadius: 16,
    overflow: "hidden",
    backgroundColor: colors.ink,
  },
  camera: { flex: 1, width: "100%" },
  loading: {
    ...StyleSheet.absoluteFill,
    alignItems: "center",
    justifyContent: "center",
  },
});
