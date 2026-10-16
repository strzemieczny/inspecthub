import type { ExpoConfig } from "expo/config";

const config: ExpoConfig = {
  name: "Inspect Hub",
  slug: "inspect-hub-mobile",
  version: "0.1.0",
  icon: "./assets/icon.png",
  platforms: ["android"],
  userInterfaceStyle: "light",
  android: {
    package: "com.inspecthub.mobile",
    versionCode: 1,
    permissions: ["android.permission.CAMERA"],
    blockedPermissions: ["android.permission.RECORD_AUDIO"],
    allowBackup: false,
  },
  plugins: [
    "expo-secure-store",
    [
      "expo-image-picker",
      {
        cameraPermission: "Zdjęcia z inspekcji jakości.",
        microphonePermission: false,
      },
    ],
    [
      "expo-build-properties",
      {
        android: {
          usesCleartextTraffic: process.env.MOBILE_ALLOW_HTTP === "1",
        },
      },
    ],
  ],
};
export default config;
