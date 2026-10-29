import { getD1 } from "../../../db";
import { requireAdminPage, shortDateTime } from "../../../lib/server/admin";
import { getSettings } from "../../../lib/server/settings";
import { AdminHeader } from "../admin-header";
import { SettingsForm } from "./settings-form";

export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false }, title: "Perkly · הגדרות מערכת" };

export default async function AdminSettingsPage() {
  await requireAdminPage();
  const db = getD1();
  const [settings, log] = await Promise.all([
    getSettings(db),
    db.prepare("SELECT admin, detail, created FROM admin_log WHERE action = 'setting' ORDER BY created DESC LIMIT 15")
      .all<{ admin: string; detail: string | null; created: string }>(),
  ]);
  return (
    <div className="admin" dir="rtl">
      <AdminHeader active="/admin/settings" />
      <main>
        <h1>הגדרות מערכת</h1>
        <p className="muted">משפיעות על כל העסקים בפלטפורמה. כל שינוי נרשם ביומן.</p>
        <section className="panel">
          <SettingsForm initial={settings} />
        </section>
        <section className="panel">
          <h2>שינויים אחרונים</h2>
          <ul className="admin-log">
            {log.results.map((l, i) => (
              <li key={i}><span dir="ltr">{l.detail}</span><small className="muted"> · {l.admin} · {shortDateTime(l.created)}</small></li>
            ))}
            {!log.results.length && <li className="muted">עדיין לא שונו הגדרות.</li>}
          </ul>
        </section>
      </main>
    </div>
  );
}
