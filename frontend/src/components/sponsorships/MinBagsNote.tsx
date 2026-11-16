import { ShoppingBag } from "lucide-react";
import { minLargeBags } from "@/lib/sponsoredBags";

/** The "you must collect N large bags to be paid" rule, as a colored callout so cleaners do not miss it. */
export default function MinBagsNote({ rule }: { rule: object | null | undefined }) {
  const n = minLargeBags(rule);
  return (
    <div className="flex items-start gap-3 rounded-2xl bg-emerald-400/10 p-3 ring-1 ring-inset ring-emerald-400/30">
      <ShoppingBag className="mt-0.5 h-5 w-5 shrink-0 text-emerald-300" aria-hidden="true" />
      <div className="space-y-0.5 text-sm">
        <p className="font-bold text-emerald-200">
          To be paid, collect at least {n} large bag{n === 1 ? "" : "s"}.
        </p>
        <p className="text-xs text-emerald-100/80">A large bag is a standard 30 gallon trash bag, filled at least three quarters full.</p>
      </div>
    </div>
  );
}
