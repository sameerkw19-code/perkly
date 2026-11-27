"use client";

import { Printer } from "lucide-react";

/** Opens the browser's print dialog (print, or save as PDF). */
export default function PrintButton({ label }: { label: string }) {
  return <button type="button" className="btn primary" onClick={() => window.print()}><Printer size={16} aria-hidden="true" />{label}</button>;
}
