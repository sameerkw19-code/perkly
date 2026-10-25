"use client";
// Anonymous visit counts (Cloudflare Web Analytics: no cookies, no personal data).
// Added only to public pages: landing, /start, /contact, /links and the legal pages.
// Never add it to /c/*, /join/*, /invite/*, /reset/*, the dashboard or admin: those addresses hold private codes.
// The token is public (it ships in the page). Loads only on the live site, not on staging or locally.
import { useEffect } from "react";

const TOKEN = "fa1e633d545749698606d91d87dad3e2";
const HOSTS = ["perkly.shop", "www.perkly.shop"];

export default function SiteAnalytics() {
  useEffect(() => {
    if (!HOSTS.includes(window.location.hostname)) return;
    if (document.querySelector("script[data-cf-beacon]")) return;
    const s = document.createElement("script");
    s.defer = true;
    s.src = "https://static.cloudflareinsights.com/beacon.min.js";
    s.setAttribute("data-cf-beacon", JSON.stringify({ token: TOKEN, spa: false }));
    document.body.appendChild(s);
  }, []);
  return null;
}
