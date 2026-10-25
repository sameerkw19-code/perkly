import { SignOut } from "./sign-out";
import { Brand } from "../../components/brand";

const TABS = [
  { href: "/admin", label: "סקירה" },
  { href: "/admin/leads", label: "פניות" },
  { href: "/admin/users", label: "משתמשים" },
  { href: "/admin/billing", label: "מנויים וכסף" },
  { href: "/admin/settings", label: "הגדרות מערכת" },
];

/** Top bar of the platform control center, with section tabs. Separate from the site: no link back to it. */
export function AdminHeader({ active }: { active: string }) {
  return (
    <header className="admin-top">
      <Brand />
      <span className="pill">מרכז שליטה</span>
      <nav className="admin-nav" aria-label="מרכז שליטה">
        {TABS.map((t) => (
          <a key={t.href} href={t.href} aria-current={active === t.href ? "page" : undefined}>{t.label}</a>
        ))}
      </nav>
      <SignOut />
    </header>
  );
}
