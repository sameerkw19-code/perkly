import { AdminHeader } from "../admin-header";
import { requireAdminPage } from "../../../lib/server/admin";
import NewBusinessForm from "./new-business-form";

export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false }, title: "Perkly · בניית עסק חדש" };

// Perkly builds a business for a client: the details and the starting card here, then the design screen.
// The business starts under the admin's account, with a free setup period; the client takes it over with an owner link.
export default async function NewBusinessPage() {
  await requireAdminPage();
  return (
    <div className="admin" dir="rtl">
      <AdminHeader active="/admin" />
      <main id="main" tabIndex={-1}>
        <h1>בניית עסק חדש</h1>
        <p className="muted">ממלאים את פרטי העסק, ומשם עוברים ישר לעיצוב הכרטיס. כשהכרטיס מוכן, שולחים לבעל העסק קישור אישי מדף העסק, והוא פותח חשבון ומקבל את העסק.</p>
        <NewBusinessForm />
      </main>
    </div>
  );
}
