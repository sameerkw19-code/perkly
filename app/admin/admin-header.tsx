const TABS = [
  { href: "/admin", label: "סקירה" },
  { href: "/admin/users", label: "משתמשים" },
  { href: "/admin/billing", label: "מנויים וכסף" },
  { href: "/admin/settings", label: "הגדרות מערכת" },
];

/** Top bar of the platform control center, with section tabs. */
export function AdminHeader({ active }: { active: string }) {
  return (
    <header className="admin-top">
      <span className="brand">perkly<span>.</span></span>
      <span className="pill">מרכז שליטה</span>
      <nav className="admin-nav" aria-label="מרכז שליטה">
        {TABS.map((t) => (
          <a key={t.href} href={t.href} aria-current={active === t.href ? "page" : undefined}>{t.label}</a>
        ))}
      </nav>
      <a className="text-btn" href="/">← לדשבורד</a>
    </header>
  );
}
