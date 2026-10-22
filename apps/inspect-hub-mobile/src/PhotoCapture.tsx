import { useI18n } from "./i18n";
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
  Image,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { File } from "expo-file-system";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import Feather from "@expo/vector-icons/Feather";
import { mediaUrl } from "./api";
import { Button, colors, s } from "./ui";
import { photoFrame } from "./photo";

export function PhotoCapture({
  disabled,
  savedUri,
  onAccept,
}: {
  disabled: boolean;
  savedUri?: string;
  onAccept: (uri: string) => Promise<void>;
}) {
  const { t } = useI18n();
  const [permission, requestPermission, getPermission] = useCameraPermissions();
  const requested = useRef(false);
  const camera = useRef<CameraView>(null);
  const mounted = useRef(true);
  const capturing = useRef(false);
  const sending = useRef(false);
  const temporaryPhoto = useRef<string | null>(null);
  const viewport = useRef({ width: 0, height: 0 });
  const [preview, setPreview] = useState<string | null>(savedUri ?? null);
  const [accepted, setAccepted] = useState(!!savedUri);
  const [foreground, setForeground] = useState(
    AppState.currentState === "active",
  );
  const [ready, setReady] = useState(false);
  const [taking, setTaking] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [cameraVersion, setCameraVersion] = useState(0);
  const attachCamera = useCallback((instance: CameraView | null) => {
    camera.current = instance;
    if (!instance) setReady(false);
  }, []);

  // Ask once on entering an unanswered photo question, then show the live preview.
  useEffect(() => {
    if (
      disabled ||
      preview ||
      !permission ||
      permission.granted ||
      !permission.canAskAgain ||
      requested.current
    )
      return;
    requested.current = true;
    void requestPermission().catch(() => {
      if (mounted.current)
        setError("Nie udało się uzyskać dostępu do aparatu.");
    });
  }, [disabled, preview, permission, requestPermission]);

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

  const refreshPermission = useEffectEvent(() => {
    void getPermission().catch(() => {
      if (mounted.current)
        setError("Nie udało się sprawdzić dostępu do aparatu.");
    });
  });
  useEffect(() => {
    mounted.current = true;
    const appState = AppState.addEventListener("change", (state) => {
      setReady(false);
      setForeground(state === "active");
      if (state === "active") refreshPermission();
    });
    return () => {
      mounted.current = false;
      appState.remove();
      deletePhoto();
    };
  }, []);

  function retake() {
    deletePhoto();
    setError("");
    setReady(false);
    setAccepted(false);
    setPreview(null);
  }

  async function takePhoto() {
    if (!camera.current || !ready || disabled || capturing.current) return;
    const frame = { ...viewport.current };
    if (frame.width <= 0 || frame.height <= 0) return;
    capturing.current = true;
    setTaking(true);
    setError("");
    try {
      // Keep orientation processing enabled so the crop uses upright dimensions.
      const photo = await camera.current.takePictureAsync({ quality: 1 });
      temporaryPhoto.current = photo.uri;
      if (!mounted.current) {
        deletePhoto();
        return;
      }
      setReady(false);
      const { crop, resize } = photoFrame(photo, frame);
      const context = ImageManipulator.manipulate(photo.uri);
      let processed: string;
      try {
        const image = await context.crop(crop).resize(resize).renderAsync();
        try {
          processed = (
            await image.saveAsync({
              format: SaveFormat.JPEG,
              compress: 0.75,
            })
          ).uri;
        } finally {
          image.release();
        }
      } finally {
        context.release();
      }
      deletePhoto();
      temporaryPhoto.current = processed;
      if (!mounted.current) {
        deletePhoto();
        return;
      }
      setPreview(processed);
      await savePhoto(processed);
    } catch {
      deletePhoto();
      if (mounted.current)
        setError("Nie udało się zrobić zdjęcia. Spróbuj ponownie.");
    } finally {
      capturing.current = false;
      if (mounted.current) setTaking(false);
    }
  }

  async function savePhoto(uri: string | null = preview) {
    if (!uri || disabled || sending.current) return;
    sending.current = true;
    setUploading(true);
    setError("");
    try {
      await onAccept(uri);
      if (mounted.current) setAccepted(true);
    } catch {
      if (mounted.current)
        setError("Nie udało się wysłać zdjęcia. Spróbuj ponownie.");
    } finally {
      sending.current = false;
      if (mounted.current) setUploading(false);
    }
  }

  async function allowCamera() {
    setError("");
    try {
      if (permission?.canAskAgain) await requestPermission();
      else await Linking.openSettings();
    } catch {
      if (mounted.current)
        setError("Nie udało się uzyskać dostępu do aparatu.");
    }
  }

  return (
    <View style={styles.container}>
      <View
        style={styles.viewport}
        onLayout={({ nativeEvent: { layout } }) => {
          viewport.current = { width: layout.width, height: layout.height };
        }}
      >
        {preview ? (
          <Image
            source={{ uri: mediaUrl(preview) }}
            accessibilityLabel={t("Zdjęcie z inspekcji")}
            style={styles.camera}
            resizeMode="cover"
          />
        ) : foreground && !disabled && permission?.granted ? (
          <CameraView
            key={cameraVersion}
            ref={attachCamera}
            style={styles.camera}
            facing="back"
            mode="picture"
            mute
            animateShutter={false}
            onCameraReady={() => setReady(true)}
            onMountError={() => {
              setReady(false);
              setError("Nie można uruchomić aparatu. Spróbuj ponownie.");
            }}
          />
        ) : !disabled && permission && !permission.granted ? (
          <View style={styles.permission}>
            <Text style={styles.permissionText}>
              {t("Zezwól na dostęp do aparatu, aby zrobić zdjęcie.")}
            </Text>
            <Button secondary onPress={() => void allowCamera()}>
              {permission.canAskAgain
                ? t("Zezwól na aparat")
                : t("Otwórz ustawienia")}
            </Button>
          </View>
        ) : null}
        {!preview &&
        !ready &&
        !error &&
        foreground &&
        !disabled &&
        (!permission || permission.granted) ? (
          <View style={styles.loading} pointerEvents="none">
            <ActivityIndicator
              color={colors.white}
              accessibilityLabel={t("Uruchamianie aparatu")}
            />
          </View>
        ) : null}
      </View>
      {error ? (
        <Text
          style={[s.body, s.resultFailText]}
          accessibilityLiveRegion="polite"
        >
          {t(error)}
        </Text>
      ) : null}
      <View style={s.row}>
        {error && !ready && !preview ? (
          <Button
            secondary
            disabled={disabled || taking}
            onPress={() => {
              setError("");
              setCameraVersion((version) => version + 1);
            }}
          >
            {t("Ponów uruchomienie")}
          </Button>
        ) : null}
        {preview ? (
          accepted ? (
            <Button secondary disabled={disabled} onPress={retake}>
              {t("Zrób nowe zdjęcie")}
            </Button>
          ) : (
            <>
              <Button secondary disabled={uploading} onPress={retake}>
                {t("Zrób nowe zdjęcie")}
              </Button>
              <Button
                disabled={disabled || uploading}
                onPress={() => void savePhoto()}
              >
                {uploading
                  ? t("Zapisywanie zdjęcia…")
                  : t("Ponów zapis zdjęcia")}
              </Button>
              <Button
                secondary
                disabled={uploading}
                onPress={() => {
                  deletePhoto();
                  setError("");
                  setReady(false);
                  setAccepted(!!savedUri);
                  setPreview(savedUri ?? null);
                }}
              >
                {t("Anuluj")}
              </Button>
            </>
          )
        ) : (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={
              taking ? t("Robienie zdjęcia") : t("Zrób zdjęcie")
            }
            accessibilityState={{
              disabled: disabled || !foreground || !ready || taking,
              busy: taking,
            }}
            disabled={disabled || !foreground || !ready || taking}
            onPress={() => void takePhoto()}
            style={({ pressed }) => [
              styles.shutterButton,
              (disabled || !foreground || !ready || taking) && s.dim,
              pressed && s.pressed,
            ]}
          >
            <View style={styles.shutterRing}>
              <View style={styles.shutterDisc}>
                {taking ? (
                  <ActivityIndicator size="small" color={colors.ink} />
                ) : (
                  <Feather
                    name="camera"
                    size={20}
                    color={colors.ink}
                    accessible={false}
                    importantForAccessibility="no"
                  />
                )}
              </View>
            </View>
            <Text style={styles.shutterText}>
              {taking ? t("Robienie zdjęcia…") : t("Zrób zdjęcie")}
            </Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 3, minHeight: 0, gap: 10 },
  viewport: {
    flex: 1,
    minHeight: 0,
    width: "100%",
    borderRadius: 16,
    overflow: "hidden",
    backgroundColor: colors.ink,
  },
  camera: { flex: 1, width: "100%" },
  shutterButton: {
    width: "100%",
    minHeight: 72,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 14,
    paddingHorizontal: 20,
    paddingVertical: 12,
    backgroundColor: colors.ink,
    borderWidth: 1,
    borderColor: "#354940",
    borderRadius: 16,
  },
  shutterRing: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 2,
    borderColor: "#ffffff99",
    alignItems: "center",
    justifyContent: "center",
  },
  shutterDisc: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.white,
    alignItems: "center",
    justifyContent: "center",
  },
  shutterText: {
    color: colors.white,
    fontSize: 20,
    fontWeight: "700",
    flexShrink: 1,
  },
  permission: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
    gap: 16,
  },
  permissionText: {
    color: colors.white,
    fontSize: 18,
    lineHeight: 27,
    textAlign: "center",
  },
  loading: {
    ...StyleSheet.absoluteFill,
    alignItems: "center",
    justifyContent: "center",
  },
});
