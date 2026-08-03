import Section from "./Section";

export default function TermsContent() {
  return (
    <div className="space-y-8 text-zinc-300">
      <Section title="1. Acceptance">
        <p>
          By accessing or using Frontline ("the App"), you agree to be bound by these Terms. If you
          don't agree, don't use the App. Frontline is currently in beta — features may change,
          break, or be removed without notice.
        </p>
      </Section>

      <Section title="2. What Frontline Is">
        <p>
          Frontline is a gamified collective action platform. Users join campaigns, log real-world
          contributions (e.g., litter cleanups, environmental actions), and compete on a live
          territory map. The App is provided for free during the beta period.
        </p>
      </Section>

      <Section title="3. Your Account">
        <ul className="list-disc list-inside space-y-1">
          <li>You must be at least 13 years old to create an account.</li>
          <li>You are responsible for keeping your credentials secure.</li>
          <li>You may not create accounts to harass, spam, or impersonate others.</li>
          <li>We reserve the right to suspend or delete accounts that violate these terms.</li>
        </ul>
      </Section>

      <Section title="4. User Content">
        <p>
          You own any content you submit (photos, notes, contribution data). By submitting it, you
          grant Frontline a non-exclusive, royalty-free license to display and store it for the
          purpose of operating the App. You must not submit content that is illegal, defamatory,
          or violates others' rights.
        </p>
      </Section>

      <Section title="5. Contributions and Gamification">
        <p>
          Points and territory earned on the leaderboard have no real-world monetary value.
          Separately, some campaigns let you earn spendable points that may be redeemed for
          offers from partner businesses; redemption is subject to the availability and terms of
          each partner offer, is not a cash equivalent, and cannot be cashed out. We may adjust
          scoring rules, redemption availability, or campaign mechanics at any time.
        </p>
      </Section>

      <Section title="6. Prohibited Conduct">
        <ul className="list-disc list-inside space-y-1">
          <li>Submitting false or fabricated contribution data.</li>
          <li>Attempting to exploit, hack, or reverse-engineer the App.</li>
          <li>Using bots, scripts, or automated tools to submit contributions.</li>
          <li>Harassing or threatening other users.</li>
        </ul>
      </Section>

      <Section title="7. Disclaimer of Warranties">
        <p>
          The App is provided "as is" without warranties of any kind. We do not guarantee uptime,
          accuracy of map data, or that your contribution data will be preserved. During beta, data
          may be wiped without notice.
        </p>
      </Section>

      <Section title="8. Limitation of Liability">
        <p>
          To the maximum extent permitted by law, Frontline and its operators are not liable for
          any indirect, incidental, or consequential damages arising from your use of the App.
        </p>
      </Section>

      <Section title="9. Changes to These Terms">
        <p>
          We may update these Terms at any time. Continued use of the App after changes constitutes
          acceptance. We'll do our best to notify users of significant changes.
        </p>
      </Section>

      <Section title="10. Contact">
        <p>
          Questions? Email us at{" "}
          <a href="mailto:collectiveactionsupport@gmail.com" className="text-emerald-400 hover:text-emerald-300">
            collectiveactionsupport@gmail.com
          </a>
          .
        </p>
      </Section>
    </div>
  );
}
