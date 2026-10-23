import { getD1 } from "../../../db";
import { liveDesign } from "../../../lib/server/designs";
import JoinForm from "./join-form";

export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false } };

export default async function JoinPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const db = getD1();
  const business =
    code.length <= 40
      ? await db
          .prepare("SELECT id, name, reward, target, color FROM businesses WHERE join_code = ?")
          .bind(code)
          .first<{ id: string; name: string; reward: string; target: number; color: string }>()
      : null;
  const design = business ? await liveDesign(db, business) : null;
  return <JoinForm code={code} business={business && design ? { name: business.name, target: business.target, design } : null} />;
}
