import LinksView, { linksMetadata } from "../../links/links-view";
import { visitorRegion } from "../../../lib/server/region";

export const dynamic = "force-dynamic";
export const metadata = linksMetadata("ar");

// Arabic link-in-bio page.
export default async function ArabicLinksPage() {
  return <LinksView lang="ar" currency={(await visitorRegion()).currency} />;
}
