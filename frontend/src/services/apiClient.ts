import axios, { AxiosError } from "axios";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:4000/api";

const TOKEN_STORAGE_KEY = "bhoomisetu.token";

export function getStoredToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function setStoredToken(token: string | null) {
  try {
    if (token) localStorage.setItem(TOKEN_STORAGE_KEY, token);
    else localStorage.removeItem(TOKEN_STORAGE_KEY);
  } catch {
    // Storage may be unavailable (private browsing, etc.) — session just won't persist.
  }
}

export const apiClient = axios.create({
  baseURL: API_URL,
  headers: { "Content-Type": "application/json" },
});

// Every authenticated request gets the JWT automatically; no component ever
// touches a token directly.
apiClient.interceptors.request.use((config) => {
  const token = getStoredToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

/** A normalized error shape every caller can rely on, whatever the backend actually said. */
export class ApiRequestError extends Error {
  code: string;
  status?: number;

  constructor(code: string, message: string, status?: number) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

interface BackendErrorBody {
  success: false;
  error: { code: string; message: string };
}

/** Called by AuthContext so a 401 anywhere (expired/invalid token) clears the session automatically. */
let unauthorizedHandler: (() => void) | null = null;
export function setUnauthorizedHandler(handler: (() => void) | null) {
  unauthorizedHandler = handler;
}

apiClient.interceptors.response.use(
  (response) => response,
  (error: AxiosError<BackendErrorBody>) => {
    if (error.response) {
      const body = error.response.data;
      const code = body?.error?.code ?? "UNKNOWN_ERROR";
      const message = body?.error?.message ?? "Something went wrong. Please try again.";
      if (error.response.status === 401) {
        unauthorizedHandler?.();
      }
      return Promise.reject(new ApiRequestError(code, message, error.response.status));
    }
    return Promise.reject(
      new ApiRequestError(
        "NETWORK_ERROR",
        "Could not reach the BhoomiSetu API. Check your connection and that the backend is running.",
      ),
    );
  },
);

interface ApiSuccess<T> {
  success: true;
  data: T;
}

export async function apiGet<T>(url: string, params?: Record<string, unknown>): Promise<T> {
  const res = await apiClient.get<ApiSuccess<T>>(url, { params });
  return res.data.data;
}

export async function apiPost<T>(url: string, body?: unknown): Promise<T> {
  const res = await apiClient.post<ApiSuccess<T>>(url, body);
  return res.data.data;
}

export async function apiPut<T>(url: string, body?: unknown): Promise<T> {
  const res = await apiClient.put<ApiSuccess<T>>(url, body);
  return res.data.data;
}

/** Partial update. Used where only some fields of a resource change. */
export async function apiPatch<T>(url: string, body?: unknown): Promise<T> {
  const res = await apiClient.patch<ApiSuccess<T>>(url, body);
  return res.data.data;
}

/** Triggers a real browser download for CSV report exports (never parsed back into JSON). */
export async function downloadCsv(url: string, params: Record<string, unknown>, filename: string) {
  const res = await apiClient.get<string>(url, { params: { ...params, format: "csv" }, responseType: "blob" });
  const blob = new Blob([res.data], { type: "text/csv" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(link.href);
}
