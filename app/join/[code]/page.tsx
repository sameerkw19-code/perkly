import { getD1 } from "../../../db";
import JoinForm from "./join-form";

export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false } };

export default async function JoinPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const business =
    code.length <= 40
      ? await getD1()
          .prepare("SELECT name, reward, target, color FROM businesses WHERE join_code = ?")
          .bind(code)
          .first<{ name: string; reward: string; target: number; color: string }>()
      : null;
  return <JoinForm code={code} business={business} />;
}
