import LegalPage from "../legal/legal-page";
import { OPERATOR, OPERATOR_LINE_EN } from "../legal/operator";

// English translation of the Hebrew privacy policy, shown to visitors outside Israel. Keep it in sync with page.tsx
// and with what the code actually does.
export default function PrivacyEn() {
  return (
    <LegalPage lang="en" title="Privacy Policy" updated="October 26, 2026">
      <p>This policy explains what information Perkly ({OPERATOR_LINE_EN}) collects, why, where it is kept and what your rights are.</p>

      <h2>Who is responsible for the information</h2>
      <ul>
        <li><strong>Information about a business&apos;s customers</strong> (name, phone, birthday, stamps): the business you joined owns that database and decides how the information is used. Perkly processes it only on the business&apos;s behalf.</li>
        <li><strong>Information about business owners, staff and people who contacted us</strong>: Perkly is responsible for it.</li>
      </ul>

      <h2>What we collect</h2>
      <ul>
        <li><strong>A business&apos;s customers:</strong> the name and phone the customer enters when joining, birthday (day and month only, no year, only if the business turned it on and the customer chose to fill it in), consent to receive updates from the business, the number of stamps and rewards, and the card&apos;s activity history.</li>
        <li><strong>Business owners and staff:</strong> name, email and password (stored with one-way hashing, so we cannot see it), role and branch, and actions taken (for example who added a stamp and when). The business details and card settings.</li>
        <li><strong>Contact form messages:</strong> the details given in the form (business name, contact person, phone, and email if given).</li>
        <li><strong>Payments:</strong> subscription payments are handled by Polar, the official seller (Merchant of Record). Card details go to Polar only and never reach us. We keep only the subscription status.</li>
        <li><strong>Technical information:</strong> the IP address is used to limit repeated attempts (protection against password guessing). Server logs are kept for a short time for operations.</li>
      </ul>

      <h2>What the information is used for</h2>
      <ul>
        <li>To run the card: adding stamps, redeeming rewards and showing the customer their progress.</li>
        <li>So the business owner sees only the customers and activity of their own business, and can give a birthday reward if they turned that on.</li>
        <li>To bill the business for the subscription and to give support.</li>
        <li>Security and preventing misuse.</li>
        <li>To reply to people who contacted us.</li>
      </ul>
      <p>We do not sell information and do not use it for advertising.</p>

      <h2>Marketing messages</h2>
      <p>Marketing messages are sent only to people who ticked a separate consent for them. The consent is not pre-ticked and is not a condition for joining the card or the service. It can be withdrawn at any time. A customer&apos;s consent to receive card updates is given to the business only.</p>

      <h2>Cookies and browser storage</h2>
      <p>The site uses a necessary sign-in cookie for business owners and staff, and stores the language choice in the browser. On the public pages (home page, sign-up, contact, link page and the legal pages) we count visits with Cloudflare Web Analytics, without cookies and without identifying the visitor. There is no such measurement on customer cards or in the dashboard. The site has no advertising tools.</p>

      <h2>Where the information is kept and who receives it</h2>
      <ul>
        <li><strong>Cloudflare:</strong> hosting the site, the database and anonymous visit counts for the public pages. Servers may be outside Israel.</li>
        <li><strong>Polar:</strong> processing business owners&apos; payments.</li>
        <li><strong>Google Wallet:</strong> only if a customer chooses to add the card to their wallet. In that case the number of stamps, the number of rewards and the scan code are sent to Google, without the name or phone.</li>
      </ul>
      <p>Each business sees only its own customers. Staff see limited information (for example the last four digits of the phone). Perkly&apos;s system administrators see business data for operations and support, but not customers&apos; names and phone numbers.</p>

      <h2>How long the information is kept</h2>
      <p>Information is kept for as long as the business is active in the service. A customer removed by the business is hidden from the business, and their history is kept as a record of actions. When a business asks to close its account, we delete its information within a reasonable time, unless a legal duty requires keeping it.</p>

      <h2>Your rights</h2>
      <p>You can ask to see, correct or delete your information. A business&apos;s customer can contact the business itself or us, and we will pass the request to the business or handle it directly. Requests: <a href={`mailto:${OPERATOR.email}`}>{OPERATOR.email}</a>. We will reply within 30 days.</p>

      <h2>Security</h2>
      <p>The connection to the site is encrypted (HTTPS), passwords are stored with one-way hashing, and card links are secret and hard to guess. No system is completely secure. If a security incident affects your information, we will notify you and the authorities as the law requires.</p>

      <h2>Minors</h2>
      <p>The service for business owners is for people 18 and older. A customer under 18 needs a parent&apos;s consent before joining a card.</p>

      <h2>Changes to this policy</h2>
      <p>If we change this policy, we will update the date at the top of the page. We will notify business owners of a material change in advance.</p>
      <p className="lp-muted">This is a translation of the Hebrew policy. If the two differ, the Hebrew version applies.</p>
    </LegalPage>
  );
}
