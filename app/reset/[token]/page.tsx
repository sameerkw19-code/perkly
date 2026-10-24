import ResetForm from "./reset-form";

export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false }, referrer: "no-referrer" };

export default async function ResetPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <ResetForm token={token.slice(0, 100)} />;
}
