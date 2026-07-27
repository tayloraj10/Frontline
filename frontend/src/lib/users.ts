export type UserSearchResult = {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
};

export async function searchUsers(query: string): Promise<UserSearchResult[]> {
  const res = await fetch(
    `${process.env.NEXT_PUBLIC_FASTAPI_URL}/api/users/search?q=${encodeURIComponent(query)}`,
    { cache: "no-store" }
  );
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<UserSearchResult[]>;
}
