import Link from "next/link";
import { PageHeader, PageShell } from "@/components/ui/PageShell";

export const metadata = { title: "Checkout canceled - Frontline" };

export default function BillingCancelPage() {
  return (
    <PageShell width="narrow" className="text-center">
      <PageHeader eyebrow="Billing" title="Checkout canceled" subtitle="No charge was made." />
      <Link
        href="/"
        className="inline-flex min-h-11 items-center justify-center rounded-2xl bg-emerald-400 px-5 text-sm font-bold text-emerald-950 hover:bg-emerald-300 active:scale-[0.97] transition-[transform,background-color] duration-150 touch-manipulation"
      >
        Back to Frontline
      </Link>
    </PageShell>
  );
}
