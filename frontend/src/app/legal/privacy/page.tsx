import Link from "next/link";

export const metadata = { title: "Privacy Policy — Frontline" };

export default function PrivacyPage() {
  return (
    <main className="max-w-2xl mx-auto px-6 py-16 space-y-8 text-zinc-300">
      <div className="space-y-2">
        <p className="text-xs text-zinc-500 uppercase tracking-widest">Legal</p>
        <h1 className="text-3xl font-black text-zinc-100">Privacy Policy</h1>
        <p className="text-zinc-500 text-sm">Last updated: June 2025 · Beta</p>
      </div>

      <Section title="1. What We Collect">
        <p>When you use Frontline, we collect:</p>
        <ul className="list-disc list-inside space-y-1">
          <li>
            <strong className="text-zinc-300">Account data</strong> — email address, username, and
            optionally a profile photo.
          </li>
          <li>
            <strong className="text-zinc-300">Contribution data</strong> — the actions you log
            (e.g., cleanup reports, photos, location of contributions).
          </li>
          <li>
            <strong className="text-zinc-300">Usage data</strong> — pages visited, features used,
            approximate IP-derived location.
          </li>
          <li>
            <strong className="text-zinc-300">OAuth data</strong> — if you sign in with Google, we
            receive your name, email, and profile picture from Google.
          </li>
        </ul>
      </Section>

      <Section title="2. How We Use It">
        <ul className="list-disc list-inside space-y-1">
          <li>To operate the App — display your contributions on the map, calculate scores.</li>
          <li>To send you transactional emails (account confirmation, password reset).</li>
          <li>To improve the App during beta (usage analytics).</li>
          <li>We do not sell your data to third parties.</li>
          <li>We do not send marketing emails without your explicit consent.</li>
        </ul>
      </Section>

      <Section title="3. Data Storage">
        <p>
          Your data is stored in Supabase (PostgreSQL) hosted in the United States. Profile photos
          and contribution images are stored in Cloudflare R2. By using the App, you consent to
          this data being stored in the US.
        </p>
      </Section>

      <Section title="4. Location Data">
        <p>
          Contribution locations are stored as geographic coordinates and displayed publicly on the
          campaign map. Do not submit a contribution location if you don't want that location to be
          visible to other users. We do not continuously track your device location.
        </p>
      </Section>

      <Section title="5. Cookies and Sessions">
        <p>
          We use cookies to maintain your login session. These are strictly necessary for the App
          to function. We do not use advertising or tracking cookies.
        </p>
      </Section>

      <Section title="6. Third-Party Services">
        <ul className="list-disc list-inside space-y-1">
          <li>
            <strong className="text-zinc-300">Supabase</strong> — authentication and database
            hosting.
          </li>
          <li>
            <strong className="text-zinc-300">Google OAuth</strong> — optional sign-in (governed
            by Google's Privacy Policy).
          </li>
          <li>
            <strong className="text-zinc-300">Cloudflare R2</strong> — image storage.
          </li>
          <li>
            <strong className="text-zinc-300">MapLibre / map tiles</strong> — map rendering (no
            personal data sent).
          </li>
        </ul>
      </Section>

      <Section title="7. Your Rights">
        <p>You may at any time:</p>
        <ul className="list-disc list-inside space-y-1">
          <li>Request a copy of your personal data.</li>
          <li>Request deletion of your account and associated data.</li>
          <li>Update your profile information from your account settings.</li>
        </ul>
        <p>
          To exercise these rights, email{" "}
          <a href="mailto:support@frontline.app" className="text-emerald-400 hover:text-emerald-300">
            support@frontline.app
          </a>
          .
        </p>
      </Section>

      <Section title="8. Children">
        <p>
          Frontline is not directed at children under 13. We do not knowingly collect personal
          information from children under 13. If you believe a child has provided us data, contact
          us and we will delete it.
        </p>
      </Section>

      <Section title="9. Beta Disclaimer">
        <p>
          During the beta period, data may be reset or deleted as we iterate on the product. We
          will make reasonable efforts to notify users before any significant data deletion.
        </p>
      </Section>

      <Section title="10. Changes">
        <p>
          We may update this policy as the product evolves. We'll update the date at the top and
          notify users of material changes.
        </p>
      </Section>

      <div className="pt-4 border-t border-zinc-800 text-sm text-zinc-500">
        <Link href="/legal/terms" className="text-emerald-400 hover:text-emerald-300">
          Terms of Service
        </Link>
        {" · "}
        <Link href="/" className="hover:text-zinc-300">
          Back to Frontline
        </Link>
      </div>
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="text-zinc-100 font-semibold">{title}</h2>
      <div className="text-zinc-400 text-sm leading-relaxed space-y-2">{children}</div>
    </section>
  );
}
