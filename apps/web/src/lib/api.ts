const API_URL =
  import.meta.env.VITE_API_URL ??
  `${window.location.protocol}//${window.location.hostname}:3000/api`;

export function qualityWebSocketUrl(): string {
  const url = new URL(API_URL, window.location.href);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.pathname = `${url.pathname.replace(/\/$/, "")}/quality-live`;
  url.search = "";
  return url.toString();
}

function normalizeMediaUrls<T>(value: T): T {
  if (typeof value === "string") {
    if (value.startsWith("/api/media/object?")) {
      return `${API_URL}${value.slice("/api".length)}` as T;
    }
    try {
      const url = new URL(value);
      if (url.pathname === "/api/media/object") {
        return `${API_URL}/media/object${url.search}` as T;
      }
      if (url.hostname === "localhost" && url.port === "9000") {
        const [, , ...objectPath] = decodeURIComponent(url.pathname).split("/");
        return `${API_URL}/media/object?name=${encodeURIComponent(objectPath.join("/"))}` as T;
      }
    } catch {
      // Zwykłe wartości tekstowe nie są adresami URL.
    }
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(normalizeMediaUrls) as T;
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        normalizeMediaUrls(item),
      ]),
    ) as T;
  }
  return value;
}

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  role: "ADMIN" | "OPERATOR";
}

export interface Session {
  accessToken: string;
  user: SessionUser;
}

export type CardLoginResult =
  | Session
  | { requiresPairing: true; verification?: true };

export class ApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

export async function api<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const token = localStorage.getItem("inspect-hub-token");
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    credentials: "include",
    headers: {
      ...(options.body instanceof FormData
        ? {}
        : { "Content-Type": "application/json" }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      message?: string | string[];
    } | null;
    const message = Array.isArray(body?.message)
      ? body.message.join(", ")
      : body?.message;
    throw new ApiError(
      message ?? `Błąd HTTP ${response.status}`,
      response.status,
    );
  }
  if (response.status === 204) return undefined as T;
  return normalizeMediaUrls((await response.json()) as T);
}

export function absoluteApiUrl(path: string): string {
  return `${API_URL}${path}`;
}

export async function downloadFile(path: string): Promise<void> {
  const token = localStorage.getItem("inspect-hub-token");
  const response = await fetch(absoluteApiUrl(path), {
    credentials: "include",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!response.ok)
    throw new ApiError(
      `Błąd eksportu HTTP ${response.status}`,
      response.status,
    );
  const blob = await response.blob();
  const disposition = response.headers.get("Content-Disposition") ?? "";
  const filename =
    disposition.match(/filename="([^"]+)"/)?.[1] ?? "inspect-hub-export";
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export async function uploadImage(file: File): Promise<string> {
  const uploadFile = await prepareImageForUpload(file);
  const body = new FormData();
  body.append("file", uploadFile);
  const result = await api<{ objectName: string }>("/media/upload", {
    method: "POST",
    body,
  });
  return `${API_URL}/media/object?name=${encodeURIComponent(result.objectName)}`;
}

const MAX_IMAGE_DIMENSION = 2560;
const JPEG_QUALITY = 0.85;

async function prepareImageForUpload(file: File): Promise<File> {
  if (!file.type.startsWith("image/")) return file;

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    // Starsze przeglądarki lub nieobsługiwany kodek: serwer spróbuje
    // przyjąć oryginał zamiast blokować wykonanie inspekcji.
    return file;
  }

  try {
    const scale = Math.min(
      1,
      MAX_IMAGE_DIMENSION / Math.max(bitmap.width, bitmap.height),
    );
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) return file;
    context.drawImage(bitmap, 0, 0, width, height);

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY),
    );
    if (!blob) return file;

    const baseName = file.name.replace(/\.[^.]+$/, "") || "inspection-photo";
    return new File([blob], `${baseName}.jpg`, {
      type: "image/jpeg",
      lastModified: file.lastModified,
    });
  } finally {
    bitmap.close();
  }
}
