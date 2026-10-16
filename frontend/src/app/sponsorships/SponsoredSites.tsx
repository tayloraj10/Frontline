"use client";

import { claimRangeNote } from "@/components/map/useSponsoredMapLayer";
import { useCallback, useEffect, useMemo, useState } from "react";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Note, TextInput } from "@/components/ui/fields";
import { EmptyState, Section } from "@/components/ui/PageShell";
import { SPONSORED_CHANGED_EVENT, SPONSORED_FOCUS_EVENT } from "@/components/map/useSponsoredMapLayer";
import { cn } from "@/lib/cn";
import { getPosition } from "@/lib/getPosition";
import DailyLimitNote from "@/components/billing/DailyLimitNote";
import { uploadToR2 } from "@/lib/uploadToR2";

const PAGE_SIZE = 6;
type Filter = "open" | "all";

export type PayoutRule =
  | { type: "flat_per_cleanup"; amount_cents: number }
  | { type: "per_bag"; cents_per_bag: number; max_bags: number }
  | { type: "equal_split"; amount_cents: number };

interface SiteClaim {
  id: string;
  status: "claimed" | "in_progress";
  before_deadline_at: string | null;
  after_deadline_at: string | null;
}

interface Site {
  id: string;
  label: string;
  message: string | null;
  payout_rule: PayoutRule;
  remaining_cents: number;
  radius_meters: number | null;
  latitude: number;
  longitude: number;
  available: boolean;
  claimed_by_me: boolean;
  my_claim: SiteClaim | null;
  early_access?: boolean;
  early_access_until?: string | null;
  early_access_locked?: boolean;
}

interface Area {
  id: string;
  area_name: string | null;
  message: string | null;
  payout_rule: PayoutRule;
  remaining_cents: number;
  early_access?: boolean;
  early_access_until?: string | null;
}

type Entry = { kind: "site"; site: Site } | { kind: "area"; area: Area };

const untilText = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "";

const usd = (cents: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);

export function describeRule(rule: PayoutRule): string {
  if (rule.type === "per_bag") return `${usd(rule.cents_per_bag)} per bag, up to ${rule.max_bags}`;
  if (rule.type === "equal_split") return `${usd(rule.amount_cents)} per attendee`;
  return `${usd(rule.amount_cents)} per verified cleanup`;
}

function errorText(err: unknown, fallback: string): string {
  if (!(err instanceof Error)) return fallback;
  try {
    const parsed = JSON.parse(err.message);
    if (parsed && typeof parsed.detail === "string") return parsed.detail;
  } catch {
    // not JSON
  }
  return err.message || fallback;
}

function minutesLeft(iso: string | null): string | null {
  if (!iso) return null;
  const mins = Math.round((new Date(iso).getTime() - Date.now()) / 60000);
  return mins <= 0 ? "expired" : `${mins} min left`;
}

export default function SponsoredSites() {
  const [sites, setSites] = useState<Site[]>([]);
  const [areas, setAreas] = useState<Area[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [photo, setPhoto] = useState<File | null>(null);
  const [bags, setBags] = useState("");
  const [filter, setFilter] = useState<Filter>("open");
  const [shown, setShown] = useState(PAGE_SIZE);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/sponsored/sites", { cache: "no-store" });
      if (!res.ok) throw new Error(await res.text());
      setSites((await res.json()).sites);
      setError(null);
      // Areas are a second source on the same list; a failure here should not hide the sites.
      const areaRes = await fetch("/api/sponsored/group-areas", { cache: "no-store" }).catch(() => null);
      if (areaRes?.ok) setAreas((await areaRes.json()).areas ?? []);
    } catch (err) {
      setError(errorText(err, "Failed to load sponsored sites"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // A claim made from a map popup changes this list too.
  useEffect(() => {
    window.addEventListener(SPONSORED_CHANGED_EVENT, load);
    return () => window.removeEventListener(SPONSORED_CHANGED_EVENT, load);
  }, [load]);

  const showOnMap = (id: string) => {
    document.getElementById("sponsored-map")?.scrollIntoView({ behavior: "smooth", block: "center" });
    // Let the scroll start before the popup opens so the card is visible when it appears.
    window.setTimeout(() => window.dispatchEvent(new CustomEvent(SPONSORED_FOCUS_EVENT, { detail: { id } })), 350);
  };

  const mine = useMemo(() => sites.filter((x) => x.my_claim), [sites]);
  const openCount = useMemo(() => sites.filter((x) => x.available && !x.my_claim).length + areas.length, [sites, areas]);
  // Sites you are working always lead the list, whatever the filter, so a claim is never buried.
  const rest = useMemo<Entry[]>(
    () => [
      ...sites
        .filter((x) => !x.my_claim && (filter === "all" || x.available))
        .map((site): Entry => ({ kind: "site", site })),
      ...areas.map((area): Entry => ({ kind: "area", area })),
    ],
    [sites, areas, filter],
  );
  const visible: Entry[] = [...mine.map((site): Entry => ({ kind: "site", site })), ...rest.slice(0, shown)];

  const act = async (site: Site, step: "claim" | "before-photo" | "after-photo" | "release") => {
    setBusyId(site.id);
    setError(null);
    setNotice(null);
    try {
      const body: Record<string, unknown> = {};
      if (step !== "release") {
        const pos = await getPosition();
        body.latitude = pos.coords.latitude;
        body.longitude = pos.coords.longitude;
      }
      if (step === "before-photo" || step === "after-photo") {
        if (!photo) throw new Error("Take or choose a photo first.");
        if (step === "after-photo" && site.payout_rule.type === "per_bag" && !(parseInt(bags, 10) > 0)) {
          throw new Error("Enter how many bags you collected. This site pays per bag.");
        }
        body.photo_url = await uploadToR2(photo);
        if (step === "after-photo" && bags) body.bags = parseInt(bags, 10);
      }
      const path = step === "claim" ? "claim" : `claim/${step}`;
      const res = await fetch(`/api/sponsored/${site.id}/${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      if (step === "after-photo") {
        const rule = site.payout_rule;
        const trimmed =
          rule.type === "per_bag" && parseInt(bags, 10) > rule.max_bags
            ? ` Only the first ${rule.max_bags} bags are paid at this site.`
            : "";
        setNotice(
          data.amount_cents > 0
            ? `Submitted. ${usd(data.amount_cents)} is waiting for admin review.${trimmed}`
            : "Submitted, but you have hit a payout cap, so nothing was queued.",
        );
      }
      setPhoto(null);
      setBags("");
      window.dispatchEvent(new Event(SPONSORED_CHANGED_EVENT));
    } catch (err) {
      setError(errorText(err, "Something went wrong"));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div id="sponsored-sites" className="scroll-mt-20">
    <Section
      title="Available sponsorships"
      description="Everything with money set aside. Claim a cleanup site on the map, then add your before and after photos here. Group areas pay hosts of cleanups inside them."
    >
      <DailyLimitNote className="mb-4" />
      {error && <Note tone="warn">{error}</Note>}
      {notice && <Note tone="good">{notice}</Note>}
      {loading && <p className="text-sm text-zinc-500">Loading...</p>}
      {!loading && sites.length === 0 && areas.length === 0 && (
        <EmptyState title="Nothing funded right now" body="When a sponsor funds a site or an area, it shows up here." />
      )}

      {sites.length + areas.length > PAGE_SIZE && (
        <div className="flex flex-wrap gap-1.5">
          {(
            [
              ["open", `Open to claim (${openCount})`],
              ["all", `All (${sites.length + areas.length})`],
            ] as [Filter, string][]
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              aria-pressed={filter === value}
              onClick={() => {
                setFilter(value);
                setShown(PAGE_SIZE);
              }}
              className={cn(
                "inline-flex min-h-9 items-center rounded-full px-3.5 text-[13px] font-semibold touch-manipulation transition-[background-color,color,transform] duration-150 active:scale-[0.96]",
                filter === value ? "bg-emerald-400 text-emerald-950" : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700 hover:text-zinc-100",
              )}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {visible.map((entry) => {
          if (entry.kind === "area") {
            const area = entry.area;
            return (
              <Card key={area.id} className="flex flex-col justify-between gap-3 sm:last:odd:col-span-2">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-zinc-100">{area.area_name ?? "Sponsored area"}</p>
                    <p className="text-xs text-zinc-400">{describeRule(area.payout_rule)}</p>
                    {area.message && <p className="mt-0.5 text-xs text-zinc-500">&quot;{area.message}&quot;</p>}
                    {area.early_access && (
                      <p className="mt-1 text-xs text-amber-300">✦ Plus groups get first pick until {untilText(area.early_access_until)}.</p>
                    )}
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <Badge variant="neutral">Group area</Badge>
                    <span className="text-[11px] text-zinc-500">{usd(area.remaining_cents)} left</span>
                  </div>
                </div>
                <p className="text-xs text-zinc-500">Groups earn this by hosting a cleanup inside the area.</p>
                <Button variant="secondary" onClick={() => showOnMap(area.id)}>
                  Show on map
                </Button>
              </Card>
            );
          }
          const site = entry.site;
          const claim = site.my_claim;
          const busy = busyId === site.id;
          return (
            <Card key={site.id} className="flex flex-col justify-between gap-3 sm:last:odd:col-span-2">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-zinc-100">{site.label}</p>
                  <p className="text-xs text-zinc-400">{describeRule(site.payout_rule)}</p>
                  {site.message && <p className="mt-0.5 text-xs text-zinc-500">&quot;{site.message}&quot;</p>}
                  {site.early_access && (
                    <p className="mt-1 text-xs text-amber-300">
                      {site.early_access_locked
                        ? `✦ Plus early access. Opens to everyone ${untilText(site.early_access_until)}.`
                        : `✦ Plus early access until ${untilText(site.early_access_until)}.`}
                    </p>
                  )}
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <Badge variant={site.available || site.claimed_by_me ? "success" : "neutral"}>
                    {site.claimed_by_me ? "Yours" : site.available ? "Open" : "Claimed"}
                  </Badge>
                  <span className="text-[11px] text-zinc-500">{usd(site.remaining_cents)} left</span>
                </div>
              </div>

              {claim && (
                <p className="text-xs text-zinc-400">
                  {claim.status === "claimed"
                    ? `Be at the site and take a starting photo (${minutesLeft(claim.before_deadline_at)}).`
                    : `Clean it up, then take an after photo (${minutesLeft(claim.after_deadline_at)}).`}
                </p>
              )}

              {claim && (
                <div className="space-y-2">
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    onChange={(e) => setPhoto(e.target.files?.[0] ?? null)}
                    className="block min-h-11 w-full text-sm text-zinc-400 file:mr-3 file:min-h-11 file:rounded-2xl file:border-0 file:bg-zinc-800 file:px-4 file:text-sm file:font-bold file:text-zinc-100"
                  />
                  {claim.status === "in_progress" && site.payout_rule.type === "per_bag" && (
                    <>
                      <TextInput
                        type="number"
                        inputMode="numeric"
                        min="1"
                        step="1"
                        placeholder="Bags collected"
                        aria-label="Bags collected"
                        value={bags}
                        onChange={(e) => setBags(e.target.value)}
                      />
                      {site.payout_rule.type === "per_bag" && (
                        <p className="text-xs text-zinc-500">
                          {parseInt(bags, 10) > 0
                            ? `${Math.min(parseInt(bags, 10), site.payout_rule.max_bags)} paid bag${Math.min(parseInt(bags, 10), site.payout_rule.max_bags) === 1 ? "" : "s"} = ${usd(Math.min(parseInt(bags, 10), site.payout_rule.max_bags) * site.payout_rule.cents_per_bag)}, before any payout limits and admin review.`
                            : `${usd(site.payout_rule.cents_per_bag)} per bag, up to ${site.payout_rule.max_bags} bags.`}
                        </p>
                      )}
                    </>
                  )}
                </div>
              )}

              {!claim && site.available && !site.early_access_locked && (
                <p className="text-xs text-zinc-500">{claimRangeNote(site.radius_meters)}</p>
              )}

              <div className="flex gap-2">
                {!claim && (
                  <Button className="flex-1" variant={site.available && !site.early_access_locked ? "primary" : "secondary"} onClick={() => showOnMap(site.id)}>
                    {site.available && !site.early_access_locked ? "Show on map to claim" : "Show on map"}
                  </Button>
                )}
                {claim?.status === "claimed" && (
                  <Button className="flex-1" loading={busy} onClick={() => act(site, "before-photo")}>
                    Submit starting photo
                  </Button>
                )}
                {claim?.status === "in_progress" && (
                  <Button className="flex-1" loading={busy} onClick={() => act(site, "after-photo")}>
                    Submit after photo
                  </Button>
                )}
                {claim && (
                  <Button variant="ghost" loading={busy} onClick={() => act(site, "release")}>
                    Back out
                  </Button>
                )}
              </div>
            </Card>
          );
        })}
      </div>

      {rest.length > shown && (
        <Button variant="secondary" className="w-full" onClick={() => setShown((n) => n + PAGE_SIZE)}>
          Show more ({rest.length - shown} left)
        </Button>
      )}
      {!loading && sites.length > 0 && rest.length === 0 && mine.length === 0 && (
        <p className="text-sm text-zinc-500">Nothing open to claim right now. Switch to All to see sites being worked.</p>
      )}
    </Section>
    </div>
  );
}
