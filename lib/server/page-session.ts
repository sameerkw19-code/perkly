import { headers } from "next/headers";
import { getD1 } from "../../db";
import { getUser } from "./auth";

/** Signed-in user for server-rendered pages (reads the session cookie only). */
export async function currentUser() {
  const h = await headers();
  return getUser(getD1(), h.get("cookie"));
}
