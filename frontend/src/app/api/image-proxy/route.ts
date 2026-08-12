import type { NextRequest } from "next/server";

const PRIVATE_HOSTNAME_PATTERN =
  /^(localhost|127\.|10\.|172\.(1[6-9]|2\d|3[0-1])\.|192\.168\.|169\.254\.|0\.0\.0\.0|\[?::1\]?)/i;

export async function GET(request: NextRequest) {
  const target = request.nextUrl.searchParams.get("url");
  if (!target) return new Response("Missing url", { status: 400 });

  let parsed: URL;
  try {
    parsed = new URL(target);
  } catch {
    return new Response("Invalid url", { status: 400 });
  }

  if (parsed.protocol !== "https:" || PRIVATE_HOSTNAME_PATTERN.test(parsed.hostname)) {
    return new Response("Disallowed url", { status: 400 });
  }

  let upstream: Response;
  try {
    upstream = await fetch(parsed.toString(), { signal: AbortSignal.timeout(8000) });
  } catch {
    return new Response("Fetch failed", { status: 502 });
  }

  if (!upstream.ok || !upstream.body) {
    return new Response("Fetch failed", { status: 502 });
  }

  const contentType = upstream.headers.get("content-type") ?? "";
  if (!contentType.startsWith("image/")) {
    return new Response("Not an image", { status: 415 });
  }

  return new Response(upstream.body, {
    headers: {
      "content-type": contentType,
      "cache-control": "public, max-age=3600",
    },
  });
}
