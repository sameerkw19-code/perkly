// The business that operates Perkly, shown on the legal pages and in the site footer.
export const OPERATOR = {
  name: "SK DIGITAL",
  kind: "עוסק מורשה",
  number: "036884823",
  address: "רחוב סלאח אלדין 19, מג'ד אל-כרום, מיקוד 2019000",
  email: "support@perkly.shop",
} as const;

/** One line for the legal pages, e.g. "SK DIGITAL, עוסק מורשה 036884823, רחוב ...". */
export const OPERATOR_LINE = `${OPERATOR.name}, ${OPERATOR.kind} ${OPERATOR.number}, ${OPERATOR.address}`;

/** The same line in English, for visitors abroad. */
export const OPERATOR_LINE_EN = `${OPERATOR.name}, licensed dealer (Israel) no. ${OPERATOR.number}, 19 Salah al-Din St., Majd al-Krum 2019000, Israel`;
