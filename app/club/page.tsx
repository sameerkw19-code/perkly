import { env } from "cloudflare:workers";
import type { Metadata } from "next";
import { currentUser } from "../../lib/server/page-session";
import { mailReady } from "../../lib/server/mailer";
import AuthForm from "../login/auth-form";
import ClubDashboard from "./club-dashboard";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Perkly for Clubs", robots: { index: false } };

// Perkly for Clubs: the owner's dashboard. Signed-out visitors open an account and come back here.
export default async function ClubPage() {
  if (!(await currentUser())) {
    return <AuthForm needsCode={!!env.SIGNUP_CODE} mailReady={mailReady(env)} next="/club" initialMode="signup" />;
  }
  return <ClubDashboard />;
}
