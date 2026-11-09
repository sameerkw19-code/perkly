import LegalPage from "../legal/legal-page";
import { OPERATOR, OPERATOR_LINE_EN } from "../legal/operator";
import { money, PRICES } from "../../lib/pricing";

// English translation of the Hebrew terms, shown to visitors outside Israel. The Hebrew version is the one a lawyer reviewed;
// keep the two in sync. Prices here are the USD plan.
export default function TermsEn() {
  const p = PRICES.USD;
  const m = (n: number) => money(n, "USD", "en");
  return (
    <LegalPage lang="en" title="Terms of Use" updated="October 26, 2026">
      <p>
        These terms apply to the use of perkly.shop and the Perkly service, operated by {OPERATOR_LINE_EN}. Using the service
        means you accept these terms and the <a href="/privacy">Privacy Policy</a>.
      </p>

      <h2>1. The service</h2>
      <p>
        Perkly lets businesses run a digital loyalty card: designing a card, customers joining by QR code, adding stamps and
        redeeming rewards, managing staff, and adding the card to a digital wallet. The service is provided as is, and it may
        change or have faults.
      </p>

      <h2>2. Account</h2>
      <ul>
        <li>A business owner opens an account with an email and password, and is responsible for keeping the password safe and for every action taken in their account and in the staff accounts they invited.</li>
        <li>The business owner must be 18 or older and authorized to act for the business.</li>
        <li>The details given at sign-up must be accurate.</li>
      </ul>

      <h2>3. The business owner&apos;s responsibilities</h2>
      <ul>
        <li>To set the reward terms and honor them with customers.</li>
        <li>To protect customers&apos; information and use it lawfully, including privacy and marketing laws.</li>
        <li>Not to send customers marketing messages without proper consent.</li>
        <li>To give access only to authorized staff.</li>
      </ul>

      <h2>4. Prohibited use</h2>
      <p>The service may not be used for unlawful activity, to mislead customers, to try to bypass its security, or to access another business&apos;s information.</p>

      <h2>5. Price and payment</h2>
      <ul>
        <li>Subscription: {m(p.monthly)} a month, no setup fee.</li>
        <li>Without a subscription the service can be used for up to 10 customers, with the ready-made designs, colors and icons. Adding more customers, or uploading a logo, background image or stamp from an image, needs a subscription.</li>
        <li>A new subscription comes with a 14-day free trial. Card details are given at the start of the trial, and the first charge is made when the 14 days end. Cancelling before the trial ends costs nothing.</li>
        <li>Subscription payments are handled by Polar, the official seller (Merchant of Record), and renew every month until cancelled.</li>
        <li>You can cancel at any time. Cancellation takes effect at the end of the current billing period.</li>
        <li>If the subscription is not active, you can still view your data and redeem rewards already earned, but you cannot add stamps or new customers.</li>
        <li>We will notify business owners of any price change at least 30 days in advance.</li>
      </ul>

      <h2>6. Suspension and closing</h2>
      <p>
        We may suspend or close an account that breaches these terms, harms others or the service, or does not pay. In the
        normal case we will give notice first. A business can ask to close its account at any time and get an export of its
        data first.
      </p>

      <h2>7. Availability</h2>
      <p>We work to keep the service available at all times, but we do not promise there will be no faults or maintenance downtime. We will announce planned maintenance in advance when we can.</p>

      <h2>8. Limitation of liability</h2>
      <p>
        To the fullest extent the law allows, our liability for any damage is limited to the amount paid to us for the service
        in the three months before the event. We are not liable for indirect damage, loss of profit, or the business&apos;s
        obligations to its own customers.
      </p>

      <h2>9. Intellectual property</h2>
      <p>
        The service, code and design belong to Perkly. Content the business uploads (logo, images, text) belongs to the
        business, and the business allows us to use it only to display the card. The business confirms it has the right to
        use the content it uploads.
      </p>

      <h2>10. Changes to the terms</h2>
      <p>We may update these terms. We will notify business owners of a material change at least 14 days in advance. Continuing to use the service after the change date means accepting the new terms.</p>

      <h2>11. Governing law and jurisdiction</h2>
      <p>These terms are governed by the laws of the State of Israel. The competent courts in Israel have exclusive jurisdiction.</p>

      <h2>12. Contact</h2>
      <p>{OPERATOR_LINE_EN}. Email: <a href={`mailto:${OPERATOR.email}`}>{OPERATOR.email}</a>.</p>
      <p className="lp-muted">This is a translation of the Hebrew terms. If the two differ, the Hebrew version applies.</p>
    </LegalPage>
  );
}
