import LegalPage from "../legal/legal-page";
import { OPERATOR } from "../legal/operator";
import { WHATSAPP_DISPLAY } from "../landing/content";

// English translation of the Hebrew accessibility statement, shown to visitors outside Israel.
export default function AccessibilityEn() {
  return (
    <LegalPage lang="en" title="Accessibility Statement" updated="October 25, 2026">
      <p>We want everyone to be able to use Perkly. This statement describes what has been done so far and what has not been tested yet.</p>
      <h2>What has been done on the home page and the sign-up form</h2>
      <ul>
        <li>A proper heading structure, a label for every field, and error messages shown next to the field and read out by screen readers.</li>
        <li>Keyboard navigation with a clear focus indicator. A skip-to-content link at the top of the page.</li>
        <li>Color contrast targeting 4.5:1 for normal text.</li>
        <li>Animations are turned off when the device is set to reduce motion.</li>
        <li>Support for right-to-left languages (Hebrew and Arabic).</li>
      </ul>
      <h2>What has not been tested yet</h2>
      <p>Testing was done in Chromium on desktop and in a phone view. Testing with screen readers (VoiceOver, TalkBack, NVDA), Safari on iPhone, and a full test of the business owner and staff screens have not been done yet. The target is WCAG 2.1 level AA (Israeli Standard 5568), and a full professional audit has not been done yet.</p>
      <h2>Accessibility contact</h2>
      <p>Ran into a problem? Accessibility coordinator: {OPERATOR.name}, phone and WhatsApp <bdi className="lp-num">{WHATSAPP_DISPLAY}</bdi>, email <a href={`mailto:${OPERATOR.email}`}>{OPERATOR.email}</a>. We will get back to you within 7 business days.</p>
    </LegalPage>
  );
}
