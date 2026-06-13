import { LegalPage } from './LegalPage';

/*
 * SCAFFOLD: factually accurate to the app's data flows, but the
 * [bracketed] placeholders must be filled in and the whole document
 * reviewed (ideally by counsel) before public launch.
 */
export function PrivacyPage() {
  return (
    <LegalPage title="Privacy Policy" lastUpdated="10 June 2026">
      <p>
        Pet Portal lets you stream live video from your own devices to monitor
        your pets, and records short clips when motion or sound is detected.
        Because the product points a camera at the inside of your home, we keep
        this policy in plain language and collect as little as we can.
      </p>
      <p>
        Pet Portal is operated by [OPERATOR NAME], [OPERATOR ADDRESS]. For
        anything in this policy, contact us at [CONTACT EMAIL].
      </p>

      <h2>What we collect and why</h2>
      <ul>
        <li>
          <strong>Account data.</strong> Your email address and sign-in
          credentials, managed by our authentication provider Clerk. We use
          this to operate your account.
        </li>
        <li>
          <strong>Payment data.</strong> Subscriptions are processed by Stripe.
          Your card details go directly to Stripe and never touch our servers;
          we store only your subscription status and plan.
        </li>
        <li>
          <strong>Live video and audio.</strong> Live streams are routed
          through LiveKit Cloud between your own devices. Live streams are not
          recorded or stored by us.
        </li>
        <li>
          <strong>Clips.</strong> When motion or sound is detected, your camera
          device records a short clip (typically about 10 seconds) and uploads
          it to your private library, stored encrypted at rest. Clips are
          visible only to your account and are kept until you delete them or
          your account is deleted.
        </li>
        <li>
          <strong>Detection events.</strong> Timestamps, event type (motion or
          sound), and a confidence score — so you have an activity history.
        </li>
        <li>
          <strong>Device and technical data.</strong> Names and online status
          of cameras you pair, push-notification subscriptions you enable, and
          standard server logs needed to run and secure the service.
        </li>
      </ul>

      <h2>What we never do</h2>
      <ul>
        <li>We never sell your data or share it with advertisers.</li>
        <li>We never watch your streams or view your clips, except if you
          explicitly ask us to while we help you with a support issue.</li>
        <li>We never use your video for training, analytics, or any purpose
          other than showing it back to you.</li>
      </ul>

      <h2>Who processes data on our behalf</h2>
      <p>
        We use a small number of service providers to run Pet Portal: Clerk
        (authentication), Stripe (payments), LiveKit Cloud (real-time video
        transport), Cloudflare R2 (clip storage), and [HOSTING PROVIDER /
        LOCATION] (application hosting). Each receives only what it needs to
        perform its function.
      </p>

      <h2>Your rights</h2>
      <p>
        If you are in the European Economic Area, the GDPR gives you the right
        to access, correct, export, and erase your personal data, and to lodge
        a complaint with your supervisory authority. Deleting your account
        removes your rooms, devices, events, and clips from our systems.
        For any data request, email [CONTACT EMAIL] and we will respond within
        30 days.
      </p>

      <h2>Your responsibilities</h2>
      <p>
        You control where your cameras point. You are responsible for ensuring
        that the people in range of your cameras and microphones are informed
        and that your use complies with local recording laws.
      </p>

      <h2>Changes</h2>
      <p>
        If we make material changes to this policy, we will notify you by
        email or in the app before they take effect.
      </p>
    </LegalPage>
  );
}
