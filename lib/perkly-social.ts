import type { Social } from "./social";

/**
 * Perkly's own accounts. Shown in the landing-page footer and on perkly.shop/links.
 * Fill in a value to make it appear; leave it out to hide it.
 *   instagram / tiktok: the username without @
 *   facebook: the page name from facebook.com/<name>, or "profile.php?id=<number>"
 */
export const PERKLY_SOCIAL: Social = {
  whatsapp: "+972526028291",
  instagram: "perkly.shop",
  // tiktok: "perkly.shop",
  facebook: "profile.php?id=61595994232539",
};

export const PERKLY_WHATSAPP_TEXT = "היי, אשמח לשמוע על Perkly";
