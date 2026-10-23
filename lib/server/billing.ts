// Subscription status rules. The payment provider is not connected yet; only the server writes
// the subscriptions table, from the provider's callbacks.

/** Whether a business may keep using paid features. Trialing and active count; everything else does not. */
export function isEntitled(status: string | null | undefined): boolean {
  return status === "active" || status === "trialing";
}
