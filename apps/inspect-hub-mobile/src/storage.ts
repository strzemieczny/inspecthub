import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import type { Station } from "@inspect-hub/types";
import type { Draft, Session } from "./inspection";
import { API_URL } from "./api";

// Bind drafts, station and credentials to the API environment.
const namespace = `inspect-hub-mobile.v1.${encodeURIComponent(API_URL)}`;
const sessionKey = `inspect-hub-session-${API_URL.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
export const storage = {
  async session(): Promise<Session | null> {
    return JSON.parse(
      (await SecureStore.getItemAsync(sessionKey)) ?? "null",
    ) as Session | null;
  },
  async saveSession(value: Session | null) {
    if (value)
      await SecureStore.setItemAsync(sessionKey, JSON.stringify(value));
    else await SecureStore.deleteItemAsync(sessionKey);
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
