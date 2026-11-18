export default function MapPlaceholder({ heightClassName }: { heightClassName: string }) {
  return (
    <div className={`relative w-full ${heightClassName}`} aria-hidden="true">
      <div className="h-full w-full animate-pulse rounded-lg border border-zinc-700/50 bg-zinc-900" />
    </div>
  );
}
