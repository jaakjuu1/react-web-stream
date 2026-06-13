import { LegalPage } from './LegalPage';

/*
 * SCAFFOLD: factually accurate to how the product works, but the
 * [bracketed] placeholders must be filled in and the whole document
 * reviewed (ideally by counsel) before public launch.
 */
export function TermsPage() {
  return (
    <LegalPage title="Terms of Service" lastUpdated="10 June 2026">
      <p>
        These terms govern your use of Pet Portal, a service operated by
        [OPERATOR NAME] ("we", "us"). By creating an account you agree to
        them. Questions: [CONTACT EMAIL].
      </p>

      <h2>The service</h2>
      <p>
        Pet Portal turns your own devices into pet cameras: live streaming,
        motion and sound detection, recorded clips, and notifications. You
        supply the devices and the internet connection; we supply the software
        and infrastructure.
      </p>

      <h2>Your account and subscription</h2>
      <ul>
        <li>You must be at least 18 years old to create an account.</li>
        <li>
          Pet Portal is a paid subscription billed through Stripe, with a free
          trial for new accounts. Pricing is shown at checkout.
        </li>
        <li>
          You can cancel anytime from the billing portal; cancellation takes
          effect at the end of the paid period. When your subscription ends,
          streaming and alerts stop, and your stored data remains available
          for 30 days before deletion.
        </li>
        <li>You are responsible for keeping your account credentials secure
          and for all activity under your account.</li>
      </ul>

      <h2>Acceptable use</h2>
      <ul>
        <li>
          Use Pet Portal only to monitor spaces and subjects you have the
          right to monitor. You are solely responsible for complying with
          recording, surveillance, and privacy laws where your cameras
          operate, including informing household members and visitors.
        </li>
        <li>Do not use the service to monitor people without their knowledge
          and consent where consent is required.</li>
        <li>Do not attempt to access other users' streams, probe, or disrupt
          the service.</li>
      </ul>

      <h2>Important limits — please read</h2>
      <p>
        Pet Portal is a convenience product, not a safety-critical system. It
        is <strong>not</strong> a security, medical, or emergency service, and
        it must not be used as a substitute for one — including as a baby
        monitor or for the care of vulnerable people. Detection alerts depend
        on your devices, browser, and network staying online, and may be
        missed, delayed, or false. Do not rely on Pet Portal where a missed
        alert could cause harm.
      </p>

      <h2>Liability</h2>
      <p>
        To the maximum extent permitted by law, the service is provided "as
        is", and our total liability for any claim is limited to the amount
        you paid us in the 12 months before the claim arose. Nothing in these
        terms limits liability that cannot be limited by law, including under
        mandatory consumer-protection rules that apply where you live.
      </p>

      <h2>Termination</h2>
      <p>
        You can delete your account at any time, which deletes your data as
        described in the Privacy Policy. We may suspend or terminate accounts
        that violate these terms.
      </p>

      <h2>Changes and governing law</h2>
      <p>
        We may update these terms; material changes will be announced by email
        or in the app before they take effect. These terms are governed by the
        laws of [JURISDICTION].
      </p>
    </LegalPage>
  );
}
