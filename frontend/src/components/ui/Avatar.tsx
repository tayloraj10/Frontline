import Link from "next/link";

const sizeCls = {
  xs: "w-6 h-6 text-[11px]",
  sm: "w-7 h-7 text-xs",
  md: "w-9 h-9 text-sm",
  lg: "w-14 h-14 text-lg",
} as const;

export type AvatarSize = keyof typeof sizeCls;

function AvatarCircle({
  avatarUrl,
  name,
  size = "sm",
}: {
  avatarUrl?: string | null;
  name: string;
  size?: AvatarSize;
}) {
  return (
    <div
      className={`${sizeCls[size]} rounded-full bg-zinc-800 border border-zinc-700 overflow-hidden shrink-0 flex items-center justify-center`}
    >
      {avatarUrl ? (
        <img src={avatarUrl} alt={name} className="w-full h-full object-cover" />
      ) : (
        <span className="font-bold text-zinc-400">{name[0]?.toUpperCase() ?? "?"}</span>
      )}
    </div>
  );
}

export default function Avatar({
  avatarUrl,
  name,
  username,
  size = "sm",
  className = "",
}: {
  avatarUrl?: string | null;
  name: string;
  username?: string | null;
  size?: AvatarSize;
  className?: string;
}) {
  if (username) {
    return (
      <Link href={`/users/${username}`} className={`shrink-0 ${className}`}>
        <AvatarCircle avatarUrl={avatarUrl} name={name} size={size} />
      </Link>
    );
  }
  return (
    <div className={`shrink-0 ${className}`}>
      <AvatarCircle avatarUrl={avatarUrl} name={name} size={size} />
    </div>
  );
}
