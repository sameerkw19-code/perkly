import { permanentRedirect } from "next/navigation";

// English is the home page now; old /en links keep working.
export default function EnglishPage() {
  permanentRedirect("/");
}
