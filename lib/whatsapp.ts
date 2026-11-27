// WhatsApp reminders: the message templates (approved in Meta's WhatsApp Manager under these names, in Hebrew, Arabic
// and English), their parameters, and the words a client replies to stop or restart them. Imports with .ts, so tests
// can load it.

export const WA_TEMPLATES = {
  /** {{1}} the business, {{2}} when (day, date and time). (The card's own link isn't kept, so no link here.) */
  appt: "perkly_appt_reminder",
  /** {{1}} the business, {{2}} what (vaccine or treatment), {{3}} the animal, {{4}} the date, {{5}} the pet booklet link. */
  vet: "perkly_vet_reminder",
} as const;
export type WaTemplate = keyof typeof WA_TEMPLATES;

/** Meta language codes for the card's language. */
export function waLang(lang: string): "he" | "ar" | "en" {
  return lang === "he" || lang === "ar" ? lang : "en";
}

/** The template texts to submit to Meta (category: Utility). Body variables can't start or end the text. */
export const WA_TEMPLATE_TEXT: Record<WaTemplate, Record<"he" | "ar" | "en", { body: string; footer: string }>> = {
  appt: {
    he: { body: "תזכורת לתור שלך ב{{1}}: {{2}}.\nנשמח לראותך!", footer: "להפסקת התזכורות השיבו: הסר" },
    ar: { body: "تذكير بموعدك في {{1}}: {{2}}.\nبانتظارك!", footer: "لإيقاف التذكيرات أرسل: إيقاف" },
    en: { body: "A reminder of your appointment at {{1}}: {{2}}.\nSee you soon!", footer: "Reply STOP to stop reminders" },
  },
  vet: {
    he: { body: "תזכורת מ{{1}}: {{2}} ל{{3}} בתאריך {{4}}.\nפנקס החיות: {{5}}\nנשמח לראותכם!", footer: "להפסקת התזכורות השיבו: הסר" },
    ar: { body: "تذكير من {{1}}: {{2}} لـ{{3}} بتاريخ {{4}}.\nدفتر الحيوانات: {{5}}\nبانتظاركم!", footer: "لإيقاف التذكيرات أرسل: إيقاف" },
    en: { body: "A reminder from {{1}}: {{2}} for {{3}} on {{4}}.\nPet booklet: {{5}}\nSee you soon!", footer: "Reply STOP to stop reminders" },
  },
};

/** The number in the form WhatsApp wants (country code, no +): "+972501234567" -> "972501234567". Null if not a phone. */
export function waTo(phone: string | null | undefined): string | null {
  const m = /^\+([1-9]\d{7,14})$/.exec(phone ?? "");
  return m ? m[1] : null;
}

/** WhatsApp's "from" ("972501234567") as the stored phone ("+972501234567"). */
export function waFrom(from: string): string | null {
  return /^[1-9]\d{7,14}$/.test(from) ? "+" + from : null;
}

const STOP = ["stop", "unsubscribe", "הסר", "הסרה", "עצור", "הפסק", "إيقاف", "ايقاف", "الغاء", "إلغاء"];
const START = ["start", "חזרה", "הפעל", "تشغيل"];

/** A reply that stops ("STOP", "הסר", "إيقاف") or restarts ("START", "הפעל") the client's reminders, or null. */
export function waCommand(text: string | null | undefined): "stop" | "start" | null {
  const w = (text ?? "").trim().replace(/[.!\s]+$/u, "").toLowerCase();
  if (STOP.includes(w)) return "stop";
  if (START.includes(w)) return "start";
  return null;
}

/** Whether a failed send is worth trying again (rate limits and Meta's own errors), and when. */
export function waRetryAfter(status: number, tries: number): number | null {
  if (status !== 429 && status < 500) return null;
  return tries >= 3 ? null : tries * 5 * 60_000;
}
