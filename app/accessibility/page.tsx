import type { Metadata } from "next";
import LegalPage from "../legal/legal-page";
import { OPERATOR } from "../legal/operator";
import { WHATSAPP_DISPLAY } from "../landing/content";

export const metadata: Metadata = { title: "Perkly | הצהרת נגישות", alternates: { canonical: "/accessibility" } };

export default function AccessibilityPage() {
  return (
    <LegalPage title="הצהרת נגישות" updated="25 באוקטובר 2026">
      <p>אנחנו רוצים שכל אחד יוכל להשתמש ב־Perkly. ההצהרה מתארת מה נעשה עד עכשיו ומה עוד לא נבדק.</p>
      <h2>מה נעשה בדף הבית ובטופס ההצטרפות</h2>
      <ul>
        <li>מבנה כותרות תקין, תוויות לכל שדה, והודעות שגיאה שמוצגות ליד השדה ומוקראות לקורא מסך.</li>
        <li>אפשר לנווט במקלדת, ומסמן הפוקוס בולט. בראש הדף יש קישור לדילוג לתוכן.</li>
        <li>ניגודיות צבעים לפי יעד של 4.5:1 לטקסט רגיל.</li>
        <li>כשבמכשיר מוגדרת הפחתת תנועה, האנימציות כבויות.</li>
        <li>תמיכה בעברית ובערבית מימין לשמאל.</li>
      </ul>
      <h2>מה עוד לא נבדק</h2>
      <p>הבדיקות נעשו בדפדפן Chromium במחשב ובתצוגת טלפון. עוד לא נעשתה בדיקה עם קוראי מסך (VoiceOver, TalkBack, NVDA), ב־Safari באייפון, ובדיקה מלאה של מסכי בעלי העסק והעובדים. היעד הוא תקן ישראלי 5568 ברמה AA, ובדיקה מקצועית מלאה עוד לא נעשתה.</p>
      <h2>פנייה בנושא נגישות</h2>
      <p>נתקלתם בבעיה? רכז הנגישות: {OPERATOR.name}, טלפון ווואטסאפ <bdi className="lp-num">{WHATSAPP_DISPLAY}</bdi>, אימייל <a href={`mailto:${OPERATOR.email}`} dir="ltr">{OPERATOR.email}</a>. נחזור אליכם תוך 7 ימי עסקים.</p>
    </LegalPage>
  );
}
