export const CAMPAIGN_SLUG_ORDER = [
  "trash-war",
  "touch-grass",
  "road-to-independence",
  "brainrot",
];

export const CAMPAIGN_TYPE_CONFIG: Record<
  string,
  { icon: string; color: string; bg: string; border: string; bar: string }
> = {
  territory:  { icon: "⚑", color: "text-emerald-400", bg: "bg-emerald-900/20", border: "border-emerald-700/50", bar: "bg-emerald-500" },
  collage:    { icon: "◈", color: "text-purple-400",  bg: "bg-purple-900/20",  border: "border-purple-700/50",  bar: "bg-purple-500" },
  choropleth: { icon: "▦", color: "text-blue-400",    bg: "bg-blue-900/20",    border: "border-blue-700/50",    bar: "bg-blue-500" },
  heatmap:    { icon: "◉", color: "text-orange-400",  bg: "bg-orange-900/20",  border: "border-orange-700/50",  bar: "bg-orange-500" },
};

export const CONTRIBUTION_LABELS: Record<string, string> = {
  cleanup:      "Cleanup",
  photo:        "Photos",
  registration: "Register",
  advocacy:     "Advocate",
  civic_action: "Civic Action",
  unfollow:     "Unfollow",
};
