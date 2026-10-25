import type { Metadata } from "next";
import ContactForm from "./contact-form";

export const metadata: Metadata = {
  title: "Perkly | דברו איתנו",
  description: "רוצים שנחזור אליכם? השאירו פרטים ונחזור בוואטסאפ או בטלפון.",
  alternates: { canonical: "/contact" },
};

// "Talk to us": for owners who prefer a call before signing up. Requests are shown in /admin/leads.
export default function ContactPage() {
  return <ContactForm />;
}
