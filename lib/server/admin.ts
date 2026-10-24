import { notFound, redirect } from "next/navigation";
import { env } from "cloudflare:workers";
import { isPlatformAdmin } from "./auth";
import { currentUser } from "./page-session";

/** For admin pages: the signed-in platform admin, or a 404 for everyone else (the page stays hidden). */
export async function requireAdminPage() {
  const user = await currentUser();
  if (!user) redirect("/login");
  if (!isPlatformAdmin(user, env.PLATFORM_ADMIN_EMAILS)) notFound();
  return user;
}

export type AdminStatus = "suspended" | "comp" | "active" | "trialing" | "past_due" | "canceled" | "none";

/** One label per business: suspension first, then admin free access, then the subscription. */
export function adminStatus(b: { suspended: string | null; comp_until: string | null; status: string | null }, now: string): AdminStatus {
  if (b.suspended) return "suspended";
  if (b.comp_until && b.comp_until > now) return "comp";
  const s = b.status ?? "none";
  if (s === "active" || s === "trialing" || s === "past_due" || s === "canceled") return s;
  return s === "none" ? "none" : "canceled";
}

export const STATUS_LABEL: Record<AdminStatus, string> = {
  suspended: "מושהה",
  comp: "גישה חינם",
  active: "משלם",
  trialing: "בניסיון",
  past_due: "תשלום נכשל",
  canceled: "בוטל",
  none: "ללא מנוי",
};

export function shortDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("he-IL", { timeZone: "Asia/Jerusalem", day: "2-digit", month: "2-digit", year: "2-digit" });
}

export function shortDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("he-IL", { timeZone: "Asia/Jerusalem", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}
