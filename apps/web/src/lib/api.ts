const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000/api'

export interface SessionUser {
  id: string
  email: string
  name: string
  role: 'ADMIN' | 'OPERATOR'
}

export interface Session {
  accessToken: string
  user: SessionUser
}

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = localStorage.getItem('inspect-hub-token')
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    credentials: "include",
    headers: {
      ...(options.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  })

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { message?: string | string[] } | null
    const message = Array.isArray(body?.message) ? body.message.join(', ') : body?.message
    throw new Error(message ?? `Błąd HTTP ${response.status}`)
  }
  if (response.status === 204) return undefined as T
  return response.json() as Promise<T>
}

export async function uploadImage(file: File): Promise<string> {
  const body = new FormData()
  body.append('file', file)
  const result = await api<{ url: string }>('/media/upload', { method: 'POST', body })
  return result.url
}
