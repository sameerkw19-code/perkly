import LinksView, { linksMetadata } from "../../links/links-view";
import { visitorRegion } from "../../../lib/server/region";

export const dynamic = "force-dynamic";
export const metadata = linksMetadata("en");

// English link-in-bio page.
export default async function EnglishLinksPage() {
  return <LinksView lang="en" currency={(await visitorRegion()).currency} />;
}
