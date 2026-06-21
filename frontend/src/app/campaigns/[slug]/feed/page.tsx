import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import CampaignTabNav from "../CampaignTabNav";
import FeedActivityList from "@/components/contributions/FeedActivityList";
import type { Database } from "@/types/database";

type Contribution = Database["public"]["Tables"]["contributions"]["Row"];
type Profile = Pick<Database["public"]["Tables"]["profiles"]["Row"], "id" | "username" | "display_name">;
type Group = Pick<Database["public"]["Tables"]["groups"]["Row"], "id" | "name" | "slug">;

const PAGE_SIZE = 25;

interface Props {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ page?: string }>;
}

export default async function ActivityFeedPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const { page: pageStr } = await searchParams;
  const page = Math.max(1, parseInt(pageStr ?? "1", 10));
  const offset = (page - 1) * PAGE_SIZE;

  const supabase = await createClient();

  const [{ data: campaignData }, { data: { user: currentUser } }] = await Promise.all([
    supabase.schema("public").from("campaigns").select("id, title, description, campaign_type").eq("slug", slug).single(),
    supabase.auth.getUser(),
  ]);

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
      ? supabase.schema("public").from("profiles").select("id, username, display_name").in("id", userIds)
      : Promise.resolve({ data: [] as Profile[] }),
    groupIds.length > 0
      ? supabase.from("groups").select("id, name, slug").in("id", groupIds)
      : Promise.resolve({ data: [] as Group[] }),
  ]);

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

            <FeedActivityList
              initialContribs={contribs as { id: string; user_id: string | null; group_id: string | null; value: number | null; contribution_type: string; notes: string | null; submitted_at: string }[]}
              profiles={profilesData ?? []}
              groups={groupsData ?? []}
              unit={unit}
              currentUserId={currentUser?.id ?? null}
            />
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
