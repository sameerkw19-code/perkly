"use client";

export type ApiResult<T = any> =
  | { ok: true; data: T }
  | { ok: false; code: string; network: boolean; data?: any };

/** POST JSON to our API. `network: true` means we never got an answer, so the outcome is unknown. */
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
