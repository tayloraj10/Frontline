import Section from "./Section";

export default function ChildSafetyContent() {
  return (
    <div className="space-y-8 text-zinc-300">
      <Section title="1. Our Standard">
        <p>
          Frontline has zero tolerance for child sexual abuse and exploitation (CSAE) and child
          sexual abuse material (CSAM). Any content, account, or behavior on Frontline that
          sexualizes, exploits, or endangers minors is strictly prohibited and will be removed.
        </p>
      </Section>

      <Section title="2. What Is Prohibited">
        <ul className="list-disc list-inside space-y-1">
          <li>Any imagery, text, or other content that depicts or promotes the sexual abuse or exploitation of minors.</li>
          <li>Grooming, solicitation, or any attempt to contact a minor for sexual purposes.</li>
          <li>Sharing, requesting, or linking to CSAM, including in photos, notes, profiles, or usernames.</li>
          <li>Sextortion or any threat or coercion involving a minor.</li>
          <li>Using Frontline to arrange in-person contact with a minor for harmful purposes.</li>
        </ul>
      </Section>

      <Section title="3. Age Requirement">
        <p>
          You must be at least 13 years old to create a Frontline account. Accounts we believe
          belong to someone under 13 are removed.
        </p>
      </Section>

      <Section title="4. Reporting Concerns">
        <p>
          If you see content or behavior on Frontline that may involve the exploitation or
          endangerment of a child, email us right away at{" "}
          <a href="mailto:frontlinemapsapp@gmail.com" className="text-emerald-400 hover:text-emerald-300 active:text-emerald-300 transition-colors duration-150">
            frontlinemapsapp@gmail.com
          </a>
          . Include a link or description of the content and the account involved. Reports are
          reviewed by the Frontline team as a priority.
        </p>
      </Section>

      <Section title="5. How We Respond">
        <ul className="list-disc list-inside space-y-1">
          <li>We remove violating content and permanently ban the accounts responsible.</li>
          <li>We preserve relevant information and report apparent CSAM and child exploitation to the National Center for Missing &amp; Exploited Children (NCMEC) and to law enforcement, as required by law.</li>
          <li>We cooperate with law enforcement investigations.</li>
        </ul>
      </Section>

      <Section title="6. Child Safety Contact">
        <p>
          The Frontline team is the designated contact for child safety matters. Reach us at{" "}
          <a href="mailto:frontlinemapsapp@gmail.com" className="text-emerald-400 hover:text-emerald-300 active:text-emerald-300 transition-colors duration-150">
            frontlinemapsapp@gmail.com
          </a>
          .
        </p>
      </Section>
    </div>
  );
}
