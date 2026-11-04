import type { Metadata } from "next";
import ClubsLanding, { clubsMeta } from "../clubs-landing";

export const metadata: Metadata = clubsMeta("en");

export default function ClubsEnglishPage() {
  return <ClubsLanding lang="en" />;
}
