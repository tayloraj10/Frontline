"use client";

import { useEffect, useState } from "react";
import Badge from "@/components/ui/Badge";

type OwnerType = "user" | "group";

/**
 * Small flair badge shown next to a profile/group name when its owner has an active
 * premium subscription (dev-docs/payments-scoping-2026-08-20.md). Admin-only-for-now:
 * only rendered for site admins (see callers), since premium isn't visible to regular
 * users yet. Reuses the existing admin entitlement proxy, which only checks that the
 * *viewer* is a site admin -- the owner being looked up can be anyone's profile/group.
 */
export default function SupporterBadge({ ownerType, ownerId }: { ownerType: OwnerType; ownerId: string }) {
  const [hasPremium, setHasPremium] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/admin/payments/entitlement?owner_type=${ownerType}&owner_id=${ownerId}`)
      .then(async (res) => {
        if (cancelled || !res.ok) return;
        const data = await res.json();
        if (!cancelled) setHasPremium(data.has_premium);
      })
      .catch(() => {
        // Silently ignore -- this is a flair badge, not critical UI.
      });
    return () => {
      cancelled = true;
    };
  }, [ownerType, ownerId]);

  if (!hasPremium) return null;

  return (
    <Badge variant="success" className="align-middle text-[10px] font-semibold" title="Supports Frontline with an active Frontline Plus subscription">
      Supporter
    </Badge>
  );
}
