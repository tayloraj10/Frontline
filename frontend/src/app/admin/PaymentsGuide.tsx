"use client";

import { useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";

type Section = { id: string; title: string; body: ReactNode };

const P = ({ children }: { children: ReactNode }) => <p className="text-xs text-zinc-400 leading-relaxed">{children}</p>;
const UL = ({ children }: { children: ReactNode }) => (
  <ul className="text-xs text-zinc-400 leading-relaxed list-disc pl-4 space-y-1">{children}</ul>
);
const H = ({ children }: { children: ReactNode }) => (
  <h4 className="text-[11px] font-semibold uppercase tracking-wider text-emerald-400/90 pt-1">{children}</h4>
);
const B = ({ children }: { children: ReactNode }) => <strong className="text-zinc-200 font-semibold">{children}</strong>;

const SECTIONS: Section[] = [
  {
    id: "map",
    title: "The big picture",
    body: (
      <>
        <P>
          There are four money flows, all on Stripe. Stripe is the only place money moves, and our database mirrors it through
          webhooks.
        </P>
        <UL>
          <li><B>Frontline Plus:</B> a $5 a month subscription, for a person or a group. Checkout and the billing portal are Stripe pages.</li>
          <li><B>Sponsorships:</B> a sponsor funds a cleanup site or area (a pool), or gives to Frontline or a group. One time Stripe Checkout payment.</li>
          <li><B>Earn payouts:</B> cleaners and groups are paid from a sponsor pool after an admin approves the work.</li>
          <li><B>Hire:</B> a customer posts a paid cleaning job, a cleaner takes it, the customer pays, the cleaner is paid.</li>
        </UL>
        <P>
          Cleaners and groups receive money through <B>Stripe Connect Express</B> accounts. They set up a bank account or debit card on
          Stripe&apos;s own pages, so we never see or store bank details. Our side only keeps the account id and a payouts_enabled flag.
        </P>
      </>
    ),
  },
  {
    id: "switches",
    title: "Who sees what (the three switches)",
    body: (
      <>
        <UL>
          <li><B>payments_enabled:</B> the full go-live switch. Off means normal users see no money features anywhere.</li>
          <li><B>payments_admin_preview:</B> shows the money features to site admins only. Use it to test in prod with sandbox keys.</li>
          <li><B>marketplace_enabled:</B> shows the Hire tab. It needs payments_enabled (everyone) or payments_admin_preview (admins only) as well. Marketplace on with both payments switches off shows nothing.</li>
        </UL>
        <P>
          Per user, the <B>rewards beta</B> flag (Admin, Admins tab) lets a chosen non admin see Earn and Impact before launch. The
          Settings tab shows a &quot;Right now&quot; line that says who can see the features at the current switch positions.
        </P>
        <P>Test keys (sk_test) and live keys (sk_live) are an environment variable on the backend, not an admin setting. </P>
      </>
    ),
  },
  {
    id: "plus",
    title: "Frontline Plus",
    body: (
      <>
        <UL>
          <li>Subscribe through Stripe Checkout. The webhook writes a row in subscriptions, and the app reads only its status (active or trialing means Plus).</li>
          <li>Manage and cancel happen in the Stripe billing portal. Cancelling keeps Plus until the period ends.</li>
          <li>Perks: early access to newly funded sites, a higher earning cap, the monthly recap, a supporter badge and insights.</li>
          <li>The cap boost is a multiplier on the base cap (Settings, Payments, Frontline Plus). The preview box there shows the base and Plus caps side by side.</li>
          <li>Group Plus is bought by a group admin for the whole group and has its own Stripe price.</li>
        </UL>
      </>
    ),
  },
  {
    id: "earn",
    title: "Sponsorships and Earn",
    body: (
      <>
        <H>Funding</H>
        <UL>
          <li>A sponsor picks a site or area, sets the total and a payout rule, and pays by Checkout. The row starts as pending_funding and flips to funded when the webhook arrives.</li>
          <li>Payout rules: one payout (first approved cleaner takes it all), fixed amount per cleanup, per bag, or per attendee (areas only). The last payout gets any remainder.</li>
          <li>A funded pool closes when it runs out. Plus members get early access before it opens to everyone.</li>
        </UL>
        <H>Earning</H>
        <UL>
          <li>Sites: any signed in cleaner claims a pin, has 30 minutes for the before photo and 2 hours for the after photo. Time running out reopens the site.</li>
          <li>Areas: a group schedules a cleanup event inside the area and marks it sponsored. Once verified the group earns from the pool.</li>
          <li>You approve photos or events in Admin. Approval creates the allocation and pays out. Anything held back (cap reached, no payout account yet) is paid when it is fixed.</li>
          <li>Caps (Settings, Payments, Earn) limit what one person can earn per cleanup, per day and per period. Plus raises them.</li>
        </UL>
        <H>Getting paid</H>
        <UL>
          <li>Individuals set up payouts on the Earn page (&quot;Earnings and payment info&quot;). Groups set up a separate account on the group edit page, and the group page shows an amber banner to group admins until it is done.</li>
          <li>&quot;See earnings&quot; opens the Stripe Express dashboard. &quot;Update payment info&quot; reopens Stripe&apos;s onboarding page to change details.</li>
          <li>A group with no payout account cannot host a sponsored event or take direct gifts.</li>
        </UL>
      </>
    ),
  },
  {
    id: "hire",
    title: "Hire (paid cleaning jobs)",
    body: (
      <>
        <H>Money path</H>
        <UL>
          <li>The customer saves a card, then posts a job at a price. The first cleaner to take it gets it, and only then is the card charged.</li>
          <li>The charge is price plus the Frontline fee (marketplace_platform_fee_percent, default 5.5). The fee is paid <B>on top</B> by the customer, so the cleaner nets the full posted price.</li>
          <li>The charge sits in the platform Stripe balance. That is the hold. Nothing goes to the cleaner yet.</li>
          <li>The customer confirms and rates, which transfers the price to the cleaner&apos;s Express account. If they do nothing it auto releases 3 days after the cleaner finishes.</li>
          <li>A dispute opened before release freezes the money until an admin resolves it.</li>
          <li>Cancel before work starts, or a no show, refunds the customer. Every Stripe call carries an idempotency key so a retry never double charges or double pays.</li>
        </UL>
        <H>Fee and break even</H>
        <P>
          Stripe charges 2.9% plus 30 cents on the card. At the $15 minimum job, about 5.05% covers it, so 5.5% breaks even and earns a
          little more on larger jobs. The Hire fee check in Settings shows the result for any fee, price and Stripe rate.
        </P>
        <H>Rules that protect the platform</H>
        <UL>
          <li>One active job per cleaner. A start by time applies, and missing it returns the job to the board with a strike.</li>
          <li>Backing out after the start time is a strike. 3 strikes in 90 days suspends the cleaner until an admin reinstates them.</li>
          <li>Chat blocks phone numbers, emails and links to keep payment on the platform. Abusive messages appear under Flagged messages for review.</li>
          <li>The address is hidden until a cleaner takes the job.</li>
        </UL>
      </>
    ),
  },
  {
    id: "webhooks",
    title: "Webhooks and the sweep",
    body: (
      <>
        <P>One endpoint, POST /api/payments/webhooks/stripe, handles everything. Duplicate deliveries are ignored by event id. Events:</P>
        <UL>
          <li>checkout.session.completed: activates Plus or marks a sponsorship funded.</li>
          <li>customer.subscription.updated and .deleted: keeps Plus status in sync.</li>
          <li>invoice.payment_failed: logged for follow up.</li>
          <li>charge.refunded: marks a sponsorship refunded.</li>
          <li>account.updated: keeps a cleaner or group payouts_enabled flag in step with Stripe.</li>
          <li>charge.dispute.created and transfer.reversed: money may have left, so every admin gets an alert. Review in Stripe before any related payout moves.</li>
        </UL>
        <P>
          A scheduled <B>sweep</B> (POST /api/marketplace/sweep, secret protected, run every 15 minutes by a cron) expires stale jobs,
          returns no shows to the board, applies strikes and auto releases confirmed jobs. If it stops running, jobs stop moving, and
          admins are alerted when it has been silent too long.
        </P>
      </>
    ),
  },
  {
    id: "ops",
    title: "Day to day for an admin",
    body: (
      <>
        <UL>
          <li><B>Approve work:</B> Admin shows sponsored cleanups and events waiting on review. Approving pays out.</li>
          <li><B>Disputes:</B> read the chat and photos, then refund the customer or release to the cleaner.</li>
          <li><B>Strikes:</B> reinstate a suspended cleaner from the cleaner list after a conversation.</li>
          <li><B>Alerts:</B> chargebacks, reversed payouts and a stalled sweep arrive as admin notifications.</li>
          <li><B>A cleaner says they were not paid:</B> check payouts_enabled for them first. If their Stripe account is not finished, nothing can transfer. Then check the Stripe dashboard transfers list.</li>
          <li><B>Refunds:</B> issue them in the Stripe dashboard. The webhook updates our rows.</li>
          <li>Incident steps are in dev-docs/payments-incident-runbook.md.</li>
        </UL>
      </>
    ),
  },
];

export default function PaymentsGuide() {
  const [open, setOpen] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);

  return (
    <div id="payments-guide" className="rounded-2xl bg-zinc-900 border border-zinc-800 overflow-hidden scroll-mt-20">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left"
      >
        <span>
          <span className="block text-sm font-semibold text-zinc-200">How payments work: admin guide</span>
          <span className="block text-xs text-zinc-500">A quick summary, with the full detail underneath.</span>
        </span>
        <ChevronDown className={`w-4 h-4 text-zinc-500 shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="border-t border-zinc-800 divide-y divide-zinc-800">
        <div className="px-4 py-3 space-y-2 bg-zinc-950/40">
          <H>TL;DR</H>
          <UL>
            <li>Stripe moves all money. Our database mirrors it through webhooks.</li>
            <li><B>Plus:</B> $5 a month subscription through Stripe Checkout and the billing portal.</li>
            <li><B>Earn:</B> a sponsor funds a pool, a cleaner submits photos, an admin approves, and the payout is automatic.</li>
            <li><B>Hire:</B> the customer pays price plus a 5.5% fee when a job is taken. The money is held, then released to the cleaner on confirmation or 3 days after the job is finished.</li>
            <li><B>Switches:</B> payments_enabled is public, payments_admin_preview is admins only, marketplace_enabled shows Hire.</li>
            <li><B>Alerts:</B> chargebacks, reversed payouts and a stalled sweep notify every admin.</li>
            <li>Open a section below for the detail.</li>
          </UL>
        </div>
          {SECTIONS.map((s, i) => {
            const isOpen = openId === s.id;
            return (
              <div key={s.id}>
                <button
                  type="button"
                  onClick={() => setOpenId(isOpen ? null : s.id)}
                  aria-expanded={isOpen}
                  className="w-full flex items-center justify-between gap-3 px-4 py-2.5 text-left hover:bg-zinc-800/40"
                >
                  <span className="text-xs font-semibold text-zinc-300">
                    <span className="text-zinc-600 mr-2">{i + 1}</span>
                    {s.title}
                  </span>
                  <ChevronDown className={`w-3.5 h-3.5 text-zinc-500 shrink-0 transition-transform ${isOpen ? "rotate-180" : ""}`} />
                </button>
                {isOpen && <div className="px-4 pb-4 space-y-2">{s.body}</div>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
