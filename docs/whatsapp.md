# WhatsApp reminders: setup

Perkly sends appointment and vet reminders on WhatsApp through Meta's WhatsApp Cloud API. Until the steps below are done, nothing is sent; the admin page shows "WhatsApp is not connected yet".

## 1. Meta account and number

1. In Meta Business Manager (business.facebook.com), create (or pick) the business account and verify it.
2. In developers.facebook.com, create an app of type **Business** and add the **WhatsApp** product.
3. Under WhatsApp → API Setup, add the phone number that sends the reminders (a number not already used in the WhatsApp app) and verify it.
4. Note the **Phone number ID** (not the phone number itself).
5. In Business Settings → System users, create a system user, give it the app and the WhatsApp account, and generate a **permanent token** with `whatsapp_business_messaging` and `whatsapp_business_management`.

## 2. Message templates (WhatsApp Manager → Message templates)

Create both templates, category **Utility**, each in Hebrew (`he`), Arabic (`ar`) and English (`en`). The names must match exactly. The texts are also in `lib/whatsapp.ts` (`WA_TEMPLATE_TEXT`).

**`perkly_appt_reminder`**: {{1}} business, {{2}} day, date and time

| | Body | Footer |
|---|---|---|
| he | תזכורת לתור שלך ב{{1}}: {{2}}.<br>נשמח לראותך! | להפסקת התזכורות השיבו: הסר |
| ar | تذكير بموعدك في {{1}}: {{2}}.<br>بانتظارك! | لإيقاف التذكيرات أرسل: إيقاف |
| en | A reminder of your appointment at {{1}}: {{2}}.<br>See you soon! | Reply STOP to stop reminders |

Sample values for Meta's review: `PRIME VET`, `יום ה׳, 4.12 · 10:00`.

**`perkly_vet_reminder`**: {{1}} clinic, {{2}} vaccine or treatment, {{3}} animal, {{4}} date, {{5}} pet booklet link

| | Body | Footer |
|---|---|---|
| he | תזכורת מ{{1}}: {{2}} ל{{3}} בתאריך {{4}}.<br>פנקס החיות: {{5}}<br>נשמח לראותכם! | להפסקת התזכורות השיבו: הסר |
| ar | تذكير من {{1}}: {{2}} لـ{{3}} بتاريخ {{4}}.<br>دفتر الحيوانات: {{5}}<br>بانتظاركم! | لإيقاف التذكيرات أرسل: إيقاف |
| en | A reminder from {{1}}: {{2}} for {{3}} on {{4}}.<br>Pet booklet: {{5}}<br>See you soon! | Reply STOP to stop reminders |

Sample values: `PRIME VET`, `חיסון כלבת`, `רקס`, `4.12.2026`, `https://perkly.shop/p/example`.

## 3. Secrets (Cloudflare, production)

Set each with `npx wrangler secret put <NAME> --env production` (or in the Cloudflare dashboard → the `perkly` worker → Settings → Variables, as **Secret**):

| Name | What |
|---|---|
| `WHATSAPP_TOKEN` | The system user's permanent token |
| `WHATSAPP_PHONE_ID` | The phone number ID |
| `WHATSAPP_APP_SECRET` | The app's secret (App settings → Basic), to check the webhook's signature |
| `WHATSAPP_VERIFY_TOKEN` | Any long random text you choose, used once when setting up the webhook |

Optional: `WHATSAPP_API_VERSION` (default `v21.0`).

## 4. Webhook (delivery status and "STOP")

In the app → WhatsApp → Configuration → Webhook:
- Callback URL: `https://perkly.shop/api/whatsapp/webhook`
- Verify token: the same text as `WHATSAPP_VERIFY_TOKEN`
- Subscribe to the **messages** field.

A client who replies `הסר` / `STOP` / `إيقاف` stops getting reminders (from every business on Perkly) and gets a confirmation. `הפעל` / `START` / `تشغيل` turns them back on. Clients can also switch reminders off or on from their card page.

## 5. Turning it on

On /admin → the business → "תזכורות וואטסאפ": tick the switch, then use "שליחת בדיקה" with your own number to check the token and templates. The last messages and their status (sent, delivered, read, failed) are listed under it.

What is sent:
- One message per appointment, with its first reminder (the day before, or later if booked late).
- For a business with the vet file: a week and a day before a vaccine or treatment is due.
