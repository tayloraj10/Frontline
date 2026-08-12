export default function RankBadge({ rank }: { rank: number }) {
  if (rank === 1) return <span className="text-yellow-400 font-black text-sm w-6 text-center">1</span>;
  if (rank === 2) return <span className="text-zinc-300 font-black text-sm w-6 text-center">2</span>;
  if (rank === 3) return <span className="text-amber-600 font-black text-sm w-6 text-center">3</span>;
  return <span className="text-zinc-600 text-sm w-6 text-center tabular-nums">{rank}</span>;
}
