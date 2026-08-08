async function postJson<T>(path: string, body: unknown, accessToken: string): Promise<T> {
  const res = await fetch(`${process.env.NEXT_PUBLIC_FASTAPI_URL}/api${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<T>;
}

export function registerDeviceToken(userId: string, token: string, platform: "ios" | "android", accessToken: string) {
  return postJson<{ registered: boolean }>("/device-tokens/register", { user_id: userId, token, platform }, accessToken);
}
