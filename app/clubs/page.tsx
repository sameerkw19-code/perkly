import type { Metadata } from "next";
import ClubsLanding, { clubsMeta } from "./clubs-landing";

export const metadata: Metadata = clubsMeta("he");

export default function ClubsPage() {
  return <ClubsLanding lang="he" />;
}
