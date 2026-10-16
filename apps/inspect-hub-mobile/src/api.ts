import type { Session } from "./inspection";

export const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? "").replace(
  /\/+$/,
  "",
);
let token: string | null = null;
export function setApiSession(session: Session | null) {
  token = session?.accessToken ?? null;
}
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
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
    throw new Error("Ustaw EXPO_PUBLIC_API_URL w pliku .env aplikacji.");
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
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...options.headers,
      },
    });
    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as {
        message?: string | string[];
      } | null;
      throw new ApiError(
        Array.isArray(body?.message)
          ? body.message.join(", ")
          : (body?.message ?? `Błąd HTTP ${response.status}`),
        response.status,
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
  if (value.startsWith("/api/media/object?"))
    return `${API_URL}${value.slice(4)}`;
  try {
    const url = new URL(value);
    if (url.pathname === "/api/media/object")
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
export async function uploadPhoto(
  uri: string,
  mimeType: string,
): Promise<string> {
  const data = new FormData();
  // React Native's FormData accepts a native file descriptor instead of a DOM Blob.
  data.append("file", {
    uri,
    type: mimeType,
    name: `inspection.${mimeType === "image/png" ? "png" : "jpg"}`,
  } as unknown as Blob);
  const result = await api<{ objectName: string }>("/media/upload", {
    method: "POST",
    body: data,
  });
  return `${API_URL}/media/object?name=${encodeURIComponent(result.objectName)}`;
}
