import { notFound } from "next/navigation";
import { getCleanupRoute } from "@/lib/cleanupRoutes";
import CleanupRouteDetail from "@/components/cleanups/CleanupRouteDetail";

interface Props {
  params: Promise<{ cleanup_id: string }>;
}

export default async function CleanupRoutePage({ params }: Props) {
  const { cleanup_id } = await params;

  const route = await getCleanupRoute(cleanup_id).catch(() => null);
  if (!route) notFound();

  return (
    <main className="max-w-lg mx-auto px-6 py-10 w-full">
      <CleanupRouteDetail route={route} />
    </main>
  );
}
