import type { Metadata } from "next";
import SignupFlow from "./signup-flow";

export const metadata: Metadata = {
  title: "Perkly | הצטרפות לפיילוט",
  description: "השאירו פרטים להצטרפות לפיילוט של Perkly, כרטיס נאמנות דיגיטלי לעסקים.",
  alternates: { canonical: "/signup" },
};

// Pilot request form. Online payment is not connected yet, so nothing is charged here.
export default function SignupPage() {
  return <SignupFlow />;
}
