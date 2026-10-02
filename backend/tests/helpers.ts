import { app } from "../src/app.js";
import type { AddressInfo } from "node:net";

let baseUrl: string | undefined;
let server: ReturnType<typeof app.listen> | undefined;

/** Starts the real Express app once per test process, on a random free port. */
export async function getBaseUrl(): Promise<string> {
  if (baseUrl) return baseUrl;
  server = app.listen(0);
  await new Promise<void>((resolve) => server!.once("listening", () => resolve()));
  const { port } = server!.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${port}`;
  return baseUrl;
}

interface JsonResponse<T> {
  status: number;
  body: { success: boolean; data?: T; error?: { code: string; message: string } };
}

export async function apiFetch<T = unknown>(
  path: string,
  options: { method?: string; token?: string; body?: unknown } = {},
): Promise<JsonResponse<T>> {
  const url = `${await getBaseUrl()}/api${path}`;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (options.token) headers.Authorization = `Bearer ${options.token}`;

  const res = await fetch(url, {
    method: options.method ?? "GET",
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });
  const body = await res.json();
  return { status: res.status, body };
}

const tokenCache = new Map<string, string>();

/** Logs in a seeded demo account once and caches the token for the rest of the test run. */
export async function loginAs(email: string, password = "demo1234"): Promise<string> {
  const cached = tokenCache.get(email);
  if (cached) return cached;

  const res = await apiFetch<{ token: string }>("/auth/login", { method: "POST", body: { email, password } });
  if (res.status !== 200 || !res.body.data) {
    throw new Error(`Login failed for ${email}: ${JSON.stringify(res.body)}`);
  }
  tokenCache.set(email, res.body.data.token);
  return res.body.data.token;
}

export const DEMO_EMAILS = {
  superAdmin: "admin@bhoomisetu.demo",
  dolrOfficer: "dolr.officer@bhoomisetu.demo",
  stateOfficer: "state.officer@bhoomisetu.demo",
  districtOfficer: "district.officer@bhoomisetu.demo",
  landowner: "landowner@bhoomisetu.demo",
  landAgency: "agency@bhoomisetu.demo",
} as const;
