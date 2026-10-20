import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Crypto from "expo-crypto";
import * as SecureStore from "expo-secure-store";
import type { Station } from "@inspect-hub/types";
import type { Draft, Session } from "./inspection";
import { API_URL } from "./api";

// Bind drafts, station and credentials to the API environment.
const namespace = `inspect-hub-mobile.v1.${encodeURIComponent(API_URL)}`;
const sessionKey = `inspect-hub-session-${API_URL.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
export type DeviceCredentials = { deviceId: string; deviceToken: string };
let devicePromise: Promise<DeviceCredentials> | undefined;

async function loadDevice(): Promise<DeviceCredentials> {
  // Hash the full URL to avoid collisions between API environments.
  const digest = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    API_URL,
  );
  const key = `inspect-hub-device-v1-${digest}`;
  const saved = await SecureStore.getItemAsync(key);
  if (saved) {
    const value = JSON.parse(saved) as Partial<DeviceCredentials>;
    if (
      typeof value?.deviceId !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        value.deviceId,
      ) ||
      typeof value.deviceToken !== "string" ||
      !/^[0-9a-f]{64}$/.test(value.deviceToken)
    ) {
      throw new Error("Nieprawidłowa tożsamość tabletu w pamięci urządzenia.");
    }
    return value as DeviceCredentials;
  }
  const bytes = await Crypto.getRandomBytesAsync(32);
  const credentials = {
    deviceId: Crypto.randomUUID(),
    deviceToken: Array.from(bytes, (byte) =>
      byte.toString(16).padStart(2, "0"),
    ).join(""),
  };
  await SecureStore.setItemAsync(key, JSON.stringify(credentials));
  return credentials;
}

const activityKey = `${namespace}.lastActivity`;
export const storage = {
  device(): Promise<DeviceCredentials> {
    devicePromise ??= loadDevice().catch((error: unknown) => {
      devicePromise = undefined;
      throw error;
    });
    return devicePromise;
  },
  async session(): Promise<(Session & { lastActiveAt: number }) | null> {
    const [saved, activity] = await Promise.all([
      SecureStore.getItemAsync(sessionKey),
      AsyncStorage.getItem(activityKey),
    ]);
    const value = JSON.parse(saved ?? "null") as Session | null;
    if (!value) return null;
    // Sessions saved before inactivity tracking require a fresh login.
    const lastActiveAt = Number(activity);
    return {
      ...value,
      lastActiveAt: Number.isFinite(lastActiveAt) ? lastActiveAt : 0,
    };
  },
  async saveSession(value: Session | null) {
    if (value) {
      await storage.saveLastActivity(Date.now());
      await SecureStore.setItemAsync(sessionKey, JSON.stringify(value));
    } else await SecureStore.deleteItemAsync(sessionKey);
  },
  async saveLastActivity(timestamp: number) {
    await AsyncStorage.setItem(activityKey, String(timestamp));
  },
  async station(): Promise<Station | null> {
    return JSON.parse(
      (await AsyncStorage.getItem(`${namespace}.station`)) ?? "null",
    ) as Station | null;
  },
  async saveStation(value: Station | null) {
    await AsyncStorage.setItem(`${namespace}.station`, JSON.stringify(value));
  },
  async draft(): Promise<Draft | null> {
    return JSON.parse(
      (await AsyncStorage.getItem(`${namespace}.draft`)) ?? "null",
    ) as Draft | null;
  },
  async saveDraft(value: Draft | null) {
    await AsyncStorage.setItem(`${namespace}.draft`, JSON.stringify(value));
  },
};
