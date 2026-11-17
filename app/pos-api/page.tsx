import LegalPage from "../legal/legal-page";
import { OPERATOR } from "../legal/operator";

export const metadata = { title: "Perkly · חיבור לקופה", description: "איך מערכת קופה רושמת קניות בכרטיסי הנאמנות של Perkly." };

const Code = ({ children }: { children: string }) => <pre className="pos-code" dir="ltr"><code>{children}</code></pre>;

// The guide for the cashier system's developer. Keep it in sync with app/api/pos/v1/[op]/route.ts.
export default function PosApiPage() {
  return (
    <LegalPage title="חיבור לקופה" updated="17 בנובמבר 2026">
      <p>המדריך הזה מיועד למתכנת של מערכת הקופה. בכל מכירה, הקופה שולחת ל־Perkly את הטלפון של הלקוח או את הקוד שבכרטיס שלו, יחד עם סכום הקנייה. Perkly רושמת את הקנייה בכרטיס לפי סוג הכרטיס של העסק, והכרטיס בארנק של הלקוח מתעדכן לבד.</p>

      <h2>1. מפתח</h2>
      <p>את המפתח מקבלים מ־Perkly, אחד לכל עסק או לכל סניף. הוא נשלח בכל בקשה בכותרת:</p>
      <Code>{"Authorization: Bearer pk_..."}</Code>
      <p>שומרים אותו בצד השרת של הקופה בלבד, לא באפליקציה או בדפדפן. מפתח שדלף מבטלים ומקבלים חדש.</p>

      <h2>2. הלקוח</h2>
      <p>בכל בקשה שולחים אחד מהשניים:</p>
      <ul>
        <li><code dir="ltr">phone</code>: מספר הטלפון של הלקוח, למשל <code dir="ltr">0541234567</code>.</li>
        <li><code dir="ltr">code</code>: מה שהסורק של הקופה קורא מה־QR בכרטיס (<code dir="ltr">perkly:...</code>).</li>
      </ul>
      <p>לקוח שאין לו כרטיס מקבל תשובה <code dir="ltr">404 customer_not_found</code>. הוא מצטרף בעצמו בסריקת ה־QR של העסק, כי צריך את ההסכמה שלו לתנאים.</p>

      <h2>3. בדיקת כרטיס</h2>
      <Code>{`POST https://perkly.shop/api/pos/v1/customer
{ "phone": "0541234567" }`}</Code>
      <Code>{`{ "ok": true, "customer": { "name": "מיכל", "phone": "+972541234567", "birthday": "03-14",
  "marketing_consent": true, "joined": "2026-11-18T09:12:00.000Z",
  "program": "stamps", "currency": "ILS",
  "stamps": 3, "target": 9, "rewards_ready": 0, "reward_value": null, "balance": 0, "round_total": 0 } }`}</Code>
      <p>פרטי החבר מאפשרים לקופה להוסיף אותו גם למועדון הלקוחות שלה: <code dir="ltr">phone</code> בפורמט בינלאומי, <code dir="ltr">birthday</code> כחודש־יום (<code dir="ltr">MM-DD</code>, בלי שנה) או <code dir="ltr">null</code>, ו־<code dir="ltr">marketing_consent</code> אומר אם הלקוח הסכים לקבל הודעות שיווקיות מהעסק. בלי הסכמה כזו אסור לשלוח לו מבצעים ב־SMS, בווטסאפ או במייל.</p>
      <p><code dir="ltr">program</code> הוא סוג הכרטיס: <code dir="ltr">stamps</code> (חותמות), <code dir="ltr">cashback</code> (יתרה, הסכומים באגורות) או <code dir="ltr">average</code> (קנה X והבאה חינם לפי ממוצע; <code dir="ltr">reward_value</code> באגורות).</p>

      <h2>4. רישום מכירה</h2>
      <Code>{`POST https://perkly.shop/api/pos/v1/purchase
{ "phone": "0541234567", "amount": 45.90, "transaction_id": "INV-102938" }`}</Code>
      <ul>
        <li><code dir="ltr">amount</code>: סכום המכירה בשקלים (מספר או טקסט, עד שתי ספרות אחרי הנקודה). חובה בכרטיס יתרה ובכרטיס ממוצע.</li>
        <li><code dir="ltr">transaction_id</code>: מספר העסקה בקופה. חובה. אותו מספר נרשם פעם אחת בלבד, אז אפשר לשלוח שוב אחרי תקלת רשת בלי לספור פעמיים.</li>
        <li><code dir="ltr">items</code>: בכרטיס חותמות בלבד, כמה חותמות לתת (1 עד 10). ברירת המחדל: 1.</li>
        <li><code dir="ltr">branch</code>: מזהה הסניף, כשלעסק יש כמה סניפים והמפתח לא שייך לסניף אחד.</li>
      </ul>
      <Code>{`{ "ok": true, "replayed": false, "earned": 92, "customer": { ..., "balance": 1240 } }`}</Code>

      <h2>5. מימוש</h2>
      <Code>{`POST https://perkly.shop/api/pos/v1/redeem
{ "phone": "0541234567", "transaction_id": "INV-102939", "amount": 12.40 }`}</Code>
      <ul>
        <li>כרטיס חותמות או ממוצע: מממש את ההטבה הוותיקה ביותר. בכרטיס ממוצע התשובה כוללת <code dir="ltr">reward_value</code>, ההנחה לתת באגורות.</li>
        <li>כרטיס יתרה: <code dir="ltr">amount</code> הוא הסכום שמשתמשים בו מהיתרה, ונותנים אותו כהנחה בקופה.</li>
      </ul>

      <h2>6. שגיאות</h2>
      <ul>
        <li><code dir="ltr">401 unauthorized</code>: מפתח חסר או מבוטל.</li>
        <li><code dir="ltr">404 customer_not_found</code>: אין כרטיס לטלפון או לקוד.</li>
        <li><code dir="ltr">409 not_ready</code>, <code dir="ltr">not_enough_balance</code>, <code dir="ltr">below_minimum</code>: אין הטבה מוכנה, אין מספיק יתרה, או שהיתרה מתחת למינימום שבעל העסק קבע.</li>
        <li><code dir="ltr">400 bad_amount</code>, <code dir="ltr">transaction_id_required</code>, <code dir="ltr">branch_required</code>: חסר או לא תקין שדה בבקשה.</li>
        <li><code dir="ltr">402</code>: לעסק אין מנוי פעיל או שהוא מושהה. מכירות לא נרשמות, מימוש כן.</li>
        <li><code dir="ltr">429 rate_limited</code>: יותר מ־120 בקשות בדקה למפתח.</li>
      </ul>

      <h2>7. שאלות</h2>
      <p>כותבים ל־<a href={`mailto:${OPERATOR.email}`}>{OPERATOR.email}</a>.</p>
    </LegalPage>
  );
}
