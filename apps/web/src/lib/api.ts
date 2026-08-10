const API_URL =
  import.meta.env.VITE_API_URL ??
  `${window.location.protocol}//${window.location.hostname}:3000/api`;

function normalizeMediaUrls<T>(value: T): T {
  if (typeof value === "string") {
    try {
      const url = new URL(value);
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
      Object.entries(value).map(([key, item]) => [key, normalizeMediaUrls(item)]),
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

export async function uploadImage(file: File): Promise<string> {
  const body = new FormData();
  body.append("file", file);
  const result = await api<{ url: string }>("/media/upload", {
    method: "POST",
    body,
  });
  return result.url;
}
