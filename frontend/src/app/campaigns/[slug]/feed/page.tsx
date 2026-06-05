import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import CampaignTabNav from "../CampaignTabNav";
import type { Database } from "@/types/database";

type Contribution = Database["public"]["Tables"]["contributions"]["Row"];
type Profile = Pick<Database["public"]["Tables"]["profiles"]["Row"], "id" | "username" | "display_name">;
type Group = Pick<Database["public"]["Tables"]["groups"]["Row"], "id" | "name" | "slug">;

const PAGE_SIZE = 25;

interface Props {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ page?: string }>;
}

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default async function ActivityFeedPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const { page: pageStr } = await searchParams;
  const page = Math.max(1, parseInt(pageStr ?? "1", 10));
  const offset = (page - 1) * PAGE_SIZE;

  const supabase = await createClient();

  const { data: campaignData } = await supabase
    .from("campaigns")
    .select("id, title, description, campaign_type")
    .eq("slug", slug)
    .single();

  if (!campaignData) notFound();

  const { data: contribsData, count } = await supabase
    .from("contributions")
    .select("id, user_id, group_id, value, contribution_type, notes, submitted_at", { count: "exact" })
    .eq("campaign_id", campaignData.id)
    .order("submitted_at", { ascending: false })
    .range(offset, offset + PAGE_SIZE - 1);

  const contribs = (contribsData ?? []) as Contribution[];
  const total = count ?? 0;
  const totalPages = Math.ceil(total / PAGE_SIZE);

  const userIds = [...new Set(contribs.filter((c) => c.user_id).map((c) => c.user_id!))];
  const groupIds = [...new Set(contribs.filter((c) => c.group_id).map((c) => c.group_id!))];

  const [{ data: profilesData }, { data: groupsData }] = await Promise.all([
    userIds.length > 0
      ? supabase.from("profiles").select("id, username, display_name").in("id", userIds)
      : Promise.resolve({ data: [] as Profile[] }),
    groupIds.length > 0
      ? supabase.from("groups").select("id, name, slug").in("id", groupIds)
      : Promise.resolve({ data: [] as Group[] }),
  ]);

  const profilesById = new Map((profilesData ?? []).map((p) => [p.id, p]));
  const groupsById = new Map((groupsData ?? []).map((g) => [g.id, g]));

  const unit = campaignData.campaign_type === "territory" ? "bags" : "pts";

  return (
    <div className="flex flex-col flex-1">
      <div className="px-6 py-3 border-b border-zinc-800 bg-zinc-900/40 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <div className="min-w-0">
            <h1 className="text-base font-bold text-zinc-100 truncate leading-tight">
              {campaignData.title}
            </h1>
            {campaignData.description && (
              <p className="text-zinc-500 text-xs truncate">{campaignData.description}</p>
            )}
          </div>
        </div>
        <CampaignTabNav slug={slug} active="feed" />
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto px-4 py-6">
          <div className="border border-zinc-800 rounded-xl overflow-hidden">
            <div className="px-5 py-3 border-b border-zinc-800 bg-zinc-900/40 flex items-center justify-between">
              <span className="text-sm font-semibold text-zinc-300">
                Activity{" "}
                <span className="text-zinc-500 font-normal">({total.toLocaleString()} contributions)</span>
              </span>
            </div>

            {contribs.length === 0 ? (
              <div className="px-5 py-10 text-center text-zinc-600 text-sm">No activity yet.</div>
            ) : (
              <ul className="divide-y divide-zinc-800/50">
                {contribs.map((c) => {
                  const profile = c.user_id ? profilesById.get(c.user_id) : null;
                  const group = c.group_id ? groupsById.get(c.group_id) : null;
                  const actorName = profile?.display_name ?? profile?.username ?? "Unknown";
                  return (
                    <li key={c.id} className="px-5 py-3 flex items-start gap-3">
                      <div className="w-7 h-7 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center text-xs font-bold text-zinc-400 shrink-0 mt-0.5">
                        {actorName[0].toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-baseline gap-1.5 flex-wrap">
                          <Link
                            href={`/users/${profile?.username ?? ""}`}
                            className="text-sm font-semibold text-zinc-200 hover:text-zinc-100 transition-colors"
                          >
                            {actorName}
                          </Link>
                          {group && (
                            <>
                              <span className="text-xs text-zinc-600">via</span>
                              <Link
                                href={`/groups/${group.slug}`}
                                className="text-xs font-medium text-emerald-400 hover:text-emerald-300 transition-colors"
                              >
                                {group.name}
                              </Link>
                            </>
                          )}
                          <span className="text-xs text-zinc-500">logged</span>
                          <span className="text-xs font-semibold text-zinc-300 tabular-nums">
                            {c.value ?? 1} {unit}
                          </span>
                        </div>
                        {c.notes && (
                          <p className="mt-0.5 text-xs text-zinc-500 line-clamp-2">{c.notes}</p>
                        )}
                      </div>
                      <span className="text-xs text-zinc-600 shrink-0 mt-0.5">
                        {timeAgo(c.submitted_at)}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {totalPages > 1 && (
            <div className="mt-4 flex items-center justify-between">
              <Link
                href={page > 1 ? `?page=${page - 1}` : "#"}
                className={`px-4 py-2 text-sm rounded-lg border transition-colors ${
                  page > 1
                    ? "border-zinc-700 text-zinc-300 hover:bg-zinc-800"
                    : "border-zinc-800 text-zinc-700 cursor-not-allowed"
                }`}
              >
                ← Previous
              </Link>
              <span className="text-xs text-zinc-500">
                Page {page} of {totalPages}
              </span>
              <Link
                href={page < totalPages ? `?page=${page + 1}` : "#"}
                className={`px-4 py-2 text-sm rounded-lg border transition-colors ${
                  page < totalPages
                    ? "border-zinc-700 text-zinc-300 hover:bg-zinc-800"
                    : "border-zinc-800 text-zinc-700 cursor-not-allowed"
                }`}
              >
                Next →
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
