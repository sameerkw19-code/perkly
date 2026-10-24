/** Shared layout for the legal pages (Hebrew, right to left). */
export function LegalPage({ title, updated, children }: { title: string; updated: string; children: React.ReactNode }) {
  return (
    <div className="legal-page" dir="rtl" lang="he">
      <header className="legal-top">
        <a className="brand" href="/">perkly<span>.</span></a>
        <nav><a href="/terms">תנאי שימוש</a><a href="/privacy">מדיניות פרטיות</a></nav>
      </header>
      <main className="legal-body">
        <h1>{title}</h1>
        <p className="muted">עודכן לאחרונה: {updated}</p>
        {children}
        <hr />
        <p className="muted">שאלות: <a href="mailto:support@perkly.shop" dir="ltr">support@perkly.shop</a></p>
      </main>
    </div>
  );
}
