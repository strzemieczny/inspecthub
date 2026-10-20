import { File } from "expo-file-system";
import type { DeviceCredentials } from "./storage";
import type { Session } from "./inspection";

export const API_URL = (
  process.env.EXPO_PUBLIC_API_URL ||
  "http://bw-mind-dev.borgwarner.net/inspect-hub/api"
).replace(/\/+$/, "");
let token: string | null = null;
let device: DeviceCredentials | null = null;
export function setApiDevice(value: DeviceCredentials) {
  device = value;
}
export function setApiSession(session: Session | null) {
  token = session?.accessToken ?? null;
}
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}
export async function api<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  if (!/^https?:\/\//.test(API_URL))
    throw new Error(
      "Nie można połączyć z serwerem. Skontaktuj się z administratorem.",
    );
  if (
    !device &&
    [
      "/stations/mobile/pair",
      "/stations/mobile/current",
      "/scada/route-check",
      "/inspections",
    ].includes(path)
  )
    throw new Error(
      "Nie udało się odczytać tożsamości tabletu. Uruchom aplikację ponownie.",
    );
  const abort = new AbortController();
  const timeout = setTimeout(() => abort.abort(), 20000);
  try {
    const response = await fetch(`${API_URL}${path}`, {
      ...options,
      signal: abort.signal,
      headers: {
        ...(!(options.body instanceof FormData)
          ? { "Content-Type": "application/json" }
          : {}),
        ...(device
          ? {
              "X-Device-Id": device.deviceId,
              "X-Device-Token": device.deviceToken,
            }
          : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...options.headers,
      },
    });
    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as {
        message?: string | string[];
        code?: string;
      } | null;
      throw new ApiError(
        Array.isArray(body?.message)
          ? body.message.join(", ")
          : (body?.message ?? `Błąd HTTP ${response.status}`),
        response.status,
        body?.code,
      );
    }
    return response.status === 204
      ? (undefined as T)
      : ((await response.json()) as T);
  } finally {
    clearTimeout(timeout);
  }
}
export function mediaUrl(value: string): string {
  const mediaPath = value.match(
    /^(?:\/inspect-hub)?\/api\/media\/object(\?.*)$/,
  );
  if (mediaPath) return `${API_URL}/media/object${mediaPath[1]}`;
  try {
    const url = new URL(value);
    if (url.pathname.endsWith("/api/media/object"))
      return `${API_URL}/media/object${url.search}`;
    if (url.hostname === "localhost" && url.port === "9000") {
      const object = decodeURIComponent(url.pathname)
        .split("/")
        .slice(2)
        .join("/");
      return `${API_URL}/media/object?name=${encodeURIComponent(object)}`;
    }
  } catch {
    /* Other strings are not media URLs. */
  }
  return value;
}
export async function uploadPhoto(uri: string): Promise<string> {
  const data = new FormData();
  // Expo 57 fetch reads file bytes; React Native's { uri } parts are unsupported.
  data.append("file", new File(uri));
  const result = await api<{ objectName: string }>("/media/upload", {
    method: "POST",
    body: data,
  });
  return `${API_URL}/media/object?name=${encodeURIComponent(result.objectName)}`;
}
