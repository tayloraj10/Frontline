export type AdminRole = "group_approver" | "business_approver" | "event_manager";

export async function getOwnAdminRoles(userId: string): Promise<AdminRole[]> {
  const res = await fetch(
    `${process.env.NEXT_PUBLIC_FASTAPI_URL}/api/admin/roles/${userId}?requesting_user_id=${userId}`,
    { cache: "no-store" }
  );
  if (!res.ok) throw new Error(await res.text());
  const data = await res.json();
  return data.roles as AdminRole[];
}
