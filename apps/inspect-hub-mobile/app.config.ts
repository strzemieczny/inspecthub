import type { ExpoConfig } from "expo/config";

const config: ExpoConfig = {
  name: "Inspect Hub",
  slug: "inspect-hub-mobile",
  owner: "strzemieczny",
  extra: {
    eas: {
      projectId: "ae0e9aa6-4b48-4902-9106-6805028eb804",
    },
  },
  version: "0.1.0",
  icon: "./assets/icon.png",
  platforms: ["android"],
  userInterfaceStyle: "light",
  androidStatusBar: { hidden: true },
  android: {
    package: "com.inspecthub.mobile",
    adaptiveIcon: {
      foregroundImage: "./assets/adaptive-icon.png",
      backgroundColor: "#002214",
    },
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
