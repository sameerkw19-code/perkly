import { redirect } from "next/navigation";

// The Arabic site is off for now. Old links go to the Hebrew page.
export default function ArabicPage() {
  redirect("/");
}
