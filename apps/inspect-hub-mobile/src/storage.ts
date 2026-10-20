import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import type { Station } from "@inspect-hub/types";
import type { Draft, Session } from "./inspection";
import { API_URL } from "./api";

// Bind drafts, station and credentials to the API environment.
const namespace = `inspect-hub-mobile.v1.${encodeURIComponent(API_URL)}`;
const sessionKey = `inspect-hub-session-${API_URL.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
const activityKey = `${namespace}.lastActivity`;
export const storage = {
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
