"use client";

// Callers read loosely shaped JSON from our own API, so the types stay open.
/* eslint-disable @typescript-eslint/no-explicit-any */
export type ApiResult<T = any> =
  | { ok: true; data: T }
  | { ok: false; code: string; network: boolean; data?: any };
/* eslint-enable @typescript-eslint/no-explicit-any */

/** POST JSON to our API. `network: true` means we never got an answer, so the outcome is unknown. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- same open default as ApiResult
export async function post<T = any>(url: string, body: unknown): Promise<ApiResult<T>> {
  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      credentials: "same-origin",
    });
  } catch {
    return { ok: false, code: "network", network: true };
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- JSON from our own API, shape set by T
  let data: any = null;
  try {
    data = await response.json();
  } catch {
    return { ok: false, code: response.status >= 500 ? "network" : "generic", network: response.status >= 500 };
  }
  if (!response.ok) return { ok: false, code: data?.code || "generic", network: false, data };
  return { ok: true, data };
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export function whatsappLink(text: string): string {
  return "https://wa.me/?text=" + encodeURIComponent(text);
}
