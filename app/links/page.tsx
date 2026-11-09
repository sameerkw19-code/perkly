import { redirect } from "next/navigation";
import LinksView, { linksMetadata } from "./links-view";
import { visitorRegion } from "../../lib/server/region";

export const dynamic = "force-dynamic";
export const metadata = linksMetadata("he");

// Hebrew link-in-bio page. Like /he, visitors outside Israel get the English page.
export default async function LinksPage() {
  const region = await visitorRegion();
  if (!region.israel) redirect("/en/links");
  return <LinksView lang="he" currency="ILS" />;
}
