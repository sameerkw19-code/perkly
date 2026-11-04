import type { Metadata } from "next";
import ClubsLanding, { clubsMeta } from "../clubs-landing";

export const metadata: Metadata = clubsMeta("ar");

export default function ClubsArabicPage() {
  return <ClubsLanding lang="ar" />;
}
