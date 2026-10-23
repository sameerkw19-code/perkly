// Shared customer helpers.

/**
 * A removed (archived) customer keeps their row for history, but that row still holds the phone number,
 * and the (business, phone) index would block a new join. This statement frees the number by renaming
 * the archived row's phone. Run it in the same batch as the insert so both succeed or fail together.
 */
export function releaseArchivedPhone(db: D1Database, businessId: string, phone: string): D1PreparedStatement {
  return db
    .prepare(
      "UPDATE customers SET phone = phone || ' (archived ' || id || ')' WHERE business = ? AND phone = ? AND archived IS NOT NULL",
    )
    .bind(businessId, phone);
}
