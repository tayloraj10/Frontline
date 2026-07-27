export type BlockingEvent = {
  id: string;
  title: string;
  scheduled_start: string;
};

export class GroupHasBlockingEventsError extends Error {
  blockingEvents: BlockingEvent[];

  constructor(message: string, blockingEvents: BlockingEvent[]) {
    super(message);
    this.blockingEvents = blockingEvents;
  }
}

export async function deleteGroup(groupId: string, requestingUserId: string): Promise<void> {
  const res = await fetch(`${process.env.NEXT_PUBLIC_FASTAPI_URL}/api/groups/${groupId}`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ requesting_user_id: requestingUserId }),
  });
  if (res.ok) return;

  const body = await res.json().catch(() => null);
  if (res.status === 409 && body?.detail?.blocking_events) {
    throw new GroupHasBlockingEventsError(
      body.detail.detail ?? "This group has upcoming events.",
      body.detail.blocking_events
    );
  }
  throw new Error(body?.detail ?? `Failed to delete group (${res.status})`);
}
