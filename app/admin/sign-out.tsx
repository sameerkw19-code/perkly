"use client";
import { post } from "../../lib/api";

export function SignOut() {
  return (
    <button className="text-btn admin-signout" onClick={async () => { await post("/api/auth", { action: "logout" }); window.location.href = "/admin"; }}>
      יציאה
    </button>
  );
}
