"use client";
import { useState } from "react";
import { post } from "../../../../lib/api";
import { normalizePhone } from "../../../../lib/phone";

export type BuildData = {
  id: string;
  name: string;
  /** Details line: reward and target. */
  details: string;
  designVersion: number | null;
  designDone: boolean;
  branches: { id: string; name: string }[];
  /** Branches with a place on the map (the wallet's nearby alert). */
  placed: number;
  /** The business is still under Perkly's account (not handed to its owner yet). */
  withPerkly: boolean;
  ownerEmail: string | null;
  ownerInvite: { email: string | null; expires: string } | null;
  staff: { user: string; name: string; email: string; branch: string | null }[];
  staffInvites: { id: string; name: string | null; email: string | null; expires: string }[];
  mail: boolean;
};

const day = (iso: string) => new Date(iso).toLocaleDateString("he-IL", { timeZone: "Asia/Jerusalem" });
const ERR: Record<string, string> = {
  bad_details: "בדקו את השם והמייל.",
  branch_required: "בחרו סניף.",
  rate_limited: "יותר מדי הזמנות היום. נסו שוב מחר.",
};

/** Copy and WhatsApp for a link that was just made (also when the email went out, as a backup). */
function SendLink({ url, message, emailed, to }: { url: string; message: string; emailed: boolean; to: string }) {
  const [phone, setPhone] = useState("");
  const [copied, setCopied] = useState(false);
  const intl = normalizePhone(phone)?.slice(1) ?? "";
  const bad = phone.trim() !== "" && !intl;
  return (
    <div className="build-sent" role="status">
      <p>{emailed ? <>✓ נשלח מייל אל <bdi dir="ltr">{to}</bdi>.</> : <>המייל לא נשלח אוטומטית (שליחת מיילים לא מחוברת). שלחו את הקישור בוואטסאפ או העתיקו אותו.</>}</p>
      <div className="admin-row">
        <input type="tel" dir="ltr" placeholder="טלפון לוואטסאפ (לא חובה)" value={phone} onChange={(e) => setPhone(e.target.value)} aria-label="טלפון לשליחה בוואטסאפ" aria-invalid={bad} />
        <a className={`btn soft small${bad ? " is-disabled" : ""}`} aria-disabled={bad} target="_blank" rel="noopener noreferrer"
          href={bad ? undefined : `https://wa.me/${intl}?text=${encodeURIComponent(message)}`}>וואטסאפ</a>
        <button type="button" className="btn soft small" onClick={async () => {
          try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch {}
        }}>{copied ? "הועתק ✓" : "העתקת הקישור"}</button>
      </div>
      {bad && <small className="form-error" role="alert">מספר הטלפון לא תקין.</small>}
    </div>
  );
}

function Step({ n, title, done, status, children }: { n: number; title: string; done: boolean; status: React.ReactNode; children?: React.ReactNode }) {
  return (
    <li className={"build-step" + (done ? " is-done" : "")}>
      <span className="build-num" aria-hidden="true">{done ? "✓" : n}</span>
      <div className="build-body">
        <h3>{title} <span className="sr-only">{done ? "(הושלם)" : "(לא הושלם)"}</span></h3>
        <p className="build-status">{status}</p>
        {children && <div className="build-actions">{children}</div>}
      </div>
    </li>
  );
}

/**
 * Building a business for a client, step by step: details, card design, branches, the QR sign, handing it to the owner
 * (their email; they choose a password) and the staff. Every screen opens in the business's dashboard with Perkly's rights.
 */
export function BuildSteps({ data }: { data: BuildData }) {
  const dash = (hash = "") => `/?business=${encodeURIComponent(data.id)}&from=admin${hash}`;
  const [ownerEmail, setOwnerEmail] = useState("");
  const [ownerSent, setOwnerSent] = useState<{ url: string; emailed: boolean; to: string } | null>(null);
  const [staffName, setStaffName] = useState("");
  const [staffEmail, setStaffEmail] = useState("");
  const [staffBranch, setStaffBranch] = useState(data.branches.length === 1 ? data.branches[0].id : "");
  const [staffSent, setStaffSent] = useState<{ url: string; emailed: boolean; to: string; name: string } | null>(null);
  const [staff, setStaff] = useState(data.staff);
  const [invites, setInvites] = useState(data.staffInvites);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState<{ where: string; text: string } | null>(null);

  async function inviteOwner(e: React.FormEvent) {
    e.preventDefault();
    setBusy("owner"); setError(null);
    const r = await post<{ url: string; emailed: boolean }>("/api/admin", { action: "owner_invite", business: data.id, email: ownerEmail.trim() });
    setBusy("");
    if (r.ok && r.data) setOwnerSent({ url: r.data.url, emailed: r.data.emailed, to: ownerEmail.trim() });
    else setError({ where: "owner", text: (!r.ok && ERR[r.code ?? ""]) || "לא הצלחנו לשלוח. נסו שוב." });
  }
  async function inviteStaff(e: React.FormEvent) {
    e.preventDefault();
    setBusy("staff"); setError(null);
    const r = await post<{ url: string; emailed: boolean; expires: string }>("/api/admin", { action: "staff_invite", business: data.id, name: staffName.trim(), email: staffEmail.trim(), branch: staffBranch || undefined });
    setBusy("");
    if (r.ok && r.data) {
      setStaffSent({ url: r.data.url, emailed: r.data.emailed, to: staffEmail.trim(), name: staffName.trim() });
      setInvites((list) => [...list, { id: "new-" + Date.now(), name: staffName.trim(), email: staffEmail.trim(), expires: r.data!.expires }]);
      setStaffName(""); setStaffEmail("");
    } else setError({ where: "staff", text: (!r.ok && ERR[r.code ?? ""]) || "לא הצלחנו לשלוח. נסו שוב." });
  }
  async function cancelInvite(id: string) {
    setBusy("x" + id);
    const r = await post("/api/loyalty", { action: "revoke_invite", business: data.id, invite: id });
    setBusy("");
    if (r.ok) setInvites((list) => list.filter((i) => i.id !== id));
  }
  async function removeWorker(user: string) {
    setBusy("x" + user);
    const r = await post("/api/loyalty", { action: "revoke_member", business: data.id, user });
    setBusy("");
    if (r.ok) setStaff((list) => list.filter((m) => m.user !== user));
  }

  const ownerDone = !data.withPerkly;
  const ownerMsg = ownerSent ? [`שלום! הכרטיס של ${data.name} ב־Perkly מוכן 🎉`, "בקישור הזה בוחרים סיסמה ונכנסים ללוח של העסק:", ownerSent.url, "הקישור אישי, לשימוש אחד, ותקף 14 יום."].join("\n") : "";
  const staffMsg = staffSent ? [`שלום ${staffSent.name}! הוזמנת לעמדת העובד של ${data.name} ב־Perkly.`, "בקישור הזה בוחרים סיסמה ומתחילים לעבוד:", staffSent.url, "הקישור אישי ותקף 7 ימים."].join("\n") : "";

  return (
    <section className="panel build" aria-labelledby="build-title">
      <div className="build-head">
        <h2 id="build-title">בניית העסק</h2>
        <p className="muted">עוברים לפי הסדר. כל מסך נפתח בלוח של העסק עם ההרשאות שלך, ובראש המסך יש קישור חזרה לכאן.</p>
      </div>
      <ol className="build-list">
        <Step n={1} title="פרטי העסק" done status={data.details}>
          <a className="btn soft" href={dash("#settings")}>עריכת הפרטים</a>
        </Step>

        <Step n={2} title="עיצוב הכרטיס" done={data.designDone}
          status={data.designDone ? `מעוצב (גרסה ${data.designVersion}). אפשר לשנות בכל זמן.` : "עדיין עיצוב התחלתי. מוסיפים לוגו, צבעים וחותמות, ומפרסמים."}>
          <a className={"btn " + (data.designDone ? "soft" : "primary")} href={dash("#design")}>{data.designDone ? "עריכת העיצוב" : "לעיצוב הכרטיס"}</a>
        </Step>

        <Step n={3} title="סניפים ומיקום במפה" done={data.branches.length > 0 && data.placed > 0}
          status={data.branches.length
            ? `${data.branches.length === 1 ? "סניף אחד" : `${data.branches.length} סניפים`}: ${data.branches.map((b) => b.name).join(", ")}. ${data.placed ? `📍 ${data.placed === data.branches.length ? "כולם על המפה" : `${data.placed} על המפה`}: הכרטיס קופץ ללקוחות שעוברים ליד.` : "עוד אין מיקום במפה: מדביקים קישור מ־Google Maps כדי שהכרטיס יקפוץ ללקוחות שעוברים ליד."}`
            : "אין סניף."}>
          <a className={"btn " + (data.placed ? "soft" : "primary")} href={dash("#settings")}>{data.placed ? "ניהול סניפים" : "הוספת מיקום במפה"}</a>
        </Step>

        <Step n={4} title="שלט QR לקופה" done={false} status="לקוחות סורקים את השלט ומצטרפים לבד. שלט A4 או מדבקה 10×10 ס״מ.">
          <a className="btn soft" href={`/poster?b=${encodeURIComponent(data.id)}`}>הדפסת השלט</a>
        </Step>

        <Step n={5} title="מסירה לבעל העסק" done={ownerDone}
          status={ownerDone
            ? <>העסק שייך ל־<bdi dir="ltr">{data.ownerEmail}</bdi>. הוא נכנס עם הסיסמה שלו.</>
            : ownerSent
              ? <>נשלחה הזמנה אל <bdi dir="ltr">{ownerSent.to}</bdi> (בתוקף 14 יום). ממתינים שייכנס ויבחר סיסמה.</>
              : data.ownerInvite
              ? <>נשלחה הזמנה אל <bdi dir="ltr">{data.ownerInvite.email ?? "קישור בלי מייל"}</bdi> (בתוקף עד {day(data.ownerInvite.expires)}). ממתינים שייכנס ויבחר סיסמה.</>
              : "מקלידים את המייל של בעל העסק. הוא מקבל קישור, בוחר סיסמה, והעסק עובר אליו עם כל העיצוב."}>
          {!ownerDone && (
            <form className="build-form" onSubmit={inviteOwner}>
              <label>המייל של בעל העסק
                <input type="email" dir="ltr" required autoComplete="off" value={ownerEmail} onChange={(e) => setOwnerEmail(e.target.value)} placeholder="owner@example.com" />
              </label>
              <button className="btn primary" disabled={busy === "owner"}>{busy === "owner" ? "שולח…" : data.ownerInvite ? "שליחת הזמנה חדשה" : "שליחת הזמנה"}</button>
              {error?.where === "owner" && <p className="form-error" role="alert">{error.text}</p>}
              {data.ownerInvite && !ownerSent && <small className="form-hint">הזמנה חדשה מבטלת את הקודמת.</small>}
            </form>
          )}
          {ownerSent && <SendLink url={ownerSent.url} message={ownerMsg} emailed={ownerSent.emailed} to={ownerSent.to} />}
        </Step>

        <Step n={6} title="עובדים" done={staff.length > 0}
          status={staff.length ? `${staff.length === 1 ? "עובד אחד" : `${staff.length} עובדים`} בצוות.` : "מוסיפים עובד עם שם ומייל. הוא בוחר סיסמה ומקבל את עמדת העובד."}>
          {(staff.length > 0 || invites.length > 0) && (
            <ul className="build-people">
              {staff.map((m) => (
                <li key={m.user}>
                  <span><b>{m.name}</b> · <bdi dir="ltr">{m.email}</bdi>{m.branch ? ` · ${m.branch}` : ""}</span>
                  <button type="button" className="btn soft small" disabled={busy === "x" + m.user} onClick={() => removeWorker(m.user)} aria-label={`הסרת ${m.name} מהצוות`}>הסרה</button>
                </li>
              ))}
              {invites.map((i) => (
                <li key={i.id} className="is-pending">
                  <span><b>{i.name || "עובד"}</b> · <bdi dir="ltr">{i.email ?? "קישור פתוח"}</bdi> · ממתין עד {day(i.expires)}</span>
                  {!i.id.startsWith("new-") && (
                    <button type="button" className="btn soft small" disabled={busy === "x" + i.id} onClick={() => cancelInvite(i.id)} aria-label={`ביטול ההזמנה של ${i.name || i.email}`}>ביטול</button>
                  )}
                </li>
              ))}
            </ul>
          )}
          <form className="build-form" onSubmit={inviteStaff}>
            <label>שם העובד
              <input required maxLength={60} autoComplete="off" value={staffName} onChange={(e) => setStaffName(e.target.value)} />
            </label>
            <label>המייל של העובד
              <input type="email" dir="ltr" required autoComplete="off" value={staffEmail} onChange={(e) => setStaffEmail(e.target.value)} placeholder="worker@example.com" />
            </label>
            {data.branches.length > 1 && (
              <label>סניף
                <select required value={staffBranch} onChange={(e) => setStaffBranch(e.target.value)}>
                  <option value="">בחירה</option>
                  {data.branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </label>
            )}
            <button className="btn primary" disabled={busy === "staff"}>{busy === "staff" ? "שולח…" : "הוספת עובד"}</button>
            {error?.where === "staff" && <p className="form-error" role="alert">{error.text}</p>}
          </form>
          {staffSent && <SendLink url={staffSent.url} message={staffMsg} emailed={staffSent.emailed} to={staffSent.to} />}
        </Step>

        <Step n={7} title="בדיקה בעמדת העובד" done={false} status="פותחים את העמדה, מצרפים לקוח לדוגמה, נותנים חותמת ובודקים שהכרטיס מתעדכן.">
          <a className="btn soft" href={dash("#station")}>פתיחת עמדת העובד</a>
          <a className="btn soft" href={dash("#customers")}>לקוחות</a>
        </Step>
      </ol>
      {!data.mail && <p className="form-hint">שליחת מיילים לא מחוברת כרגע: אחרי כל הזמנה מקבלים קישור לשליחה בוואטסאפ.</p>}
    </section>
  );
}
