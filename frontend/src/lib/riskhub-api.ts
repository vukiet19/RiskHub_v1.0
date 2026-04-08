export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";

export const DEFAULT_USER_ID =
  process.env.NEXT_PUBLIC_RISKHUB_USER_ID ?? "64f1a2b3c4d5e6f7a8b9c0d1";

export function buildApiUrl(path: string): string {
  return `${API_BASE_URL}${path}`;
}

export function buildWebSocketUrl(path: string): string {
  const wsBaseUrl = API_BASE_URL.replace(/^http/i, "ws");
  return `${wsBaseUrl}${path}`;
}
