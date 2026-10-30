/** The text each customer gets: the business name first (the sender is Perkly), then the owner's text with {name} filled. */
export function messageFor(businessName: string, text: string, customerName: string): string {
  return `${businessName}: ${text.replace(/\{name\}/g, customerName)}`;
}
