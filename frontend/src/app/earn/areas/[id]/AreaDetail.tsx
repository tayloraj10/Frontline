"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { ArrowLeft } from "lucide-react";
import Badge from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { Section } from "@/components/ui/PageShell";
import AddToSiteButton from "@/components/sponsorships/AddToSiteButton";
import { minBagsSentence, minBagsShort } from "@/lib/sponsoredBags";
import { describeRule, type PayoutRule } from "../../SponsoredSites";

interface Area {
  id: string;
  area_name: string | null;
  message: string | null;
  payout_rule: PayoutRule;
  remaining_cents: number;
  open_to_additions?: boolean;
  is_mine?: boolean;
  early_access?: boolean;
  early_access_until?: string | null;
  scheduled?: boolean;
  opens_at?: string | null;
  plus_opens_at?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  geojson?: GeoJSON.Polygon | null;
}

const MiniMapPreview = dynamic(() => import("@/components/map/MiniMapPreview"), {
  ssr: false,
  loading: () => <div className="h-56 w-full animate-pulse rounded-2xl bg-zinc-900" />,
});

const when = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "";
const usd = (c: number) => `$${(c / 100).toFixed(2)}`;

export default function AreaDetail({ id, loggedIn }: { id: string; loggedIn: boolean }) {
  const [area, setArea] = useState<Area | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "missing">("loading");
  const [wantsAdd, setWantsAdd] = useState(false);

  useEffect(() => {
    setWantsAdd(window.location.hash === "#add-money");
    fetch("/api/sponsored/group-areas", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        const found = (d?.areas ?? []).find((a: Area) => a.id === id) ?? null;
        setArea(found);
        setState(found ? "ready" : "missing");
      })
      .catch(() => setState("missing"));
  }, [id]);

  const back = (
    <Link href="/earn" className="inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-emerald-300">
      <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Back to Earn
    </Link>
  );

  if (state === "loading") return <div className="h-40 animate-pulse rounded-2xl bg-zinc-900" />;
  if (!area)
    return (
      <>
        {back}
        <p className="text-sm text-zinc-400">This area is not available right now.</p>
      </>
    );

  return (
    <>
      {back}
      {area.latitude != null && area.longitude != null && (
        <div className="mb-4 overflow-hidden rounded-2xl ring-1 ring-inset ring-zinc-800">
          <MiniMapPreview lat={area.latitude} lng={area.longitude} interactive locate heightClassName="h-56" area={area.geojson ?? null} />
        </div>
      )}
      <Card className={`space-y-3 ${area.is_mine ? "!ring-2 !ring-amber-300/70" : ""}`}>
        {area.is_mine && (
          <p className="rounded-xl bg-amber-300/15 px-3 py-2 text-sm font-bold text-amber-200 ring-1 ring-inset ring-amber-300/40">
            This is your sponsored area.
          </p>
        )}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-lg font-bold text-zinc-100">{area.area_name ?? "Sponsored area"}</h1>
            <p className="text-sm text-zinc-400">{describeRule(area.payout_rule)}</p>
            <p className="mt-0.5 text-sm font-medium text-emerald-300">{minBagsShort(area.payout_rule)} per event</p>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1">
            <Badge variant="info">Group area</Badge>
            <span className="text-xs text-zinc-500">{usd(area.remaining_cents)} left</span>
          </div>
        </div>
        {area.message && <p className="text-sm text-zinc-500">&quot;{area.message}&quot;</p>}
        {area.scheduled ? (
          <p className="text-xs text-violet-300">Scheduled. Plus members see it {when(area.plus_opens_at)}, everyone {when(area.opens_at)}.</p>
        ) : (
          area.early_access && <p className="text-xs text-violet-300">✦ Plus members only until {when(area.early_access_until)}.</p>
        )}
        <Link
          href="/earn#sponsored-map"
          className="inline-flex min-h-11 w-full items-center justify-center rounded-2xl bg-emerald-400/15 px-5 text-sm font-bold text-emerald-300 hover:bg-emerald-400/25"
        >
          Show on map
        </Link>
      </Card>

      <div className="pt-2">
      <Section title="How groups earn">
        <p className="text-sm text-zinc-400">
          Groups earn this by hosting a cleanup event inside the area. {minBagsSentence(area.payout_rule).replace("you need", "the event needs")}
        </p>
      </Section>
      </div>

      {area.open_to_additions && loggedIn && (
        <div id="add-money" className="scroll-mt-24">
          <Section title="Add money">
            <AddToSiteButton id={area.id} label={area.area_name ?? "this area"} autoOpen={wantsAdd} successPath={`/earn/areas/${area.id}`} />
          </Section>
        </div>
      )}
    </>
  );
}
