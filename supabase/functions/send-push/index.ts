import { createClient } from "npm:@supabase/supabase-js@2";

// Invoked by the on_user_notification_insert_push DB trigger (see
// 062_push_notification_webhook.sql) with { notification_id }. Looks up the
// notification and every device_tokens row for its user, then sends one FCM
// v1 message per device. FCM wraps APNs too, so this is the only send path
// needed for both iOS and Android.

const encoder = new TextEncoder();

function base64url(input: Uint8Array | string): string {
  const bytes = typeof input === "string" ? encoder.encode(input) : input;
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function getFcmAccessToken(serviceAccount: { client_email: string; private_key: string }): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const claim = {
    iss: serviceAccount.client_email,
    scope: "https://www.googleapis.com/auth/firebase.messaging",
    aud: "https://oauth2.googleapis.com/token",
    exp: now + 3600,
    iat: now,
  };
  const unsigned = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(claim))}`;

  const pemBody = serviceAccount.private_key
    .replace("-----BEGIN PRIVATE KEY-----", "")
    .replace("-----END PRIVATE KEY-----", "")
    .replace(/\s/g, "");
  const keyData = Uint8Array.from(atob(pemBody), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey(
    "pkcs8",
    keyData,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, encoder.encode(unsigned));
  const jwt = `${unsigned}.${base64url(new Uint8Array(signature))}`;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });
  if (!res.ok) throw new Error(`FCM token exchange failed: ${await res.text()}`);
  const { access_token } = await res.json();
  return access_token;
}

Deno.serve(async (req) => {
  try {
    // Deployed with verifyJWT disabled since the caller is a Postgres trigger,
    // not a Supabase Auth user — the trigger authenticates instead by sending
    // the service_role key (from vault's 'push_service_role_key' secret, see
    // 062_push_notification_webhook.sql) as a bearer token, checked here.
    const expectedAuth = `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!}`;
    if (req.headers.get("Authorization") !== expectedAuth) {
      return new Response("unauthorized", { status: 401 });
    }

    const { notification_id } = await req.json();
    if (!notification_id) return new Response("missing notification_id", { status: 400 });

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const { data: notification, error: notificationError } = await supabase
      .from("user_notifications")
      .select("user_id, title, body, campaign_slug")
      .eq("id", notification_id)
      .single();
    if (notificationError || !notification) return new Response("notification not found", { status: 404 });

    const { data: tokens, error: tokensError } = await supabase
      .from("device_tokens")
      .select("token")
      .eq("user_id", notification.user_id);
    if (tokensError) throw tokensError;
    if (!tokens?.length) return new Response(JSON.stringify({ sent: 0 }), { status: 200 });

    const serviceAccount = JSON.parse(Deno.env.get("FIREBASE_SERVICE_ACCOUNT")!);
    const accessToken = await getFcmAccessToken(serviceAccount);
    const deepLinkUrl = notification.campaign_slug
      ? `https://www.frontlinemaps.com/campaigns/${notification.campaign_slug}`
      : undefined;

    const staleTokens: string[] = [];
    await Promise.all(
      tokens.map(async ({ token }) => {
        const res = await fetch(`https://fcm.googleapis.com/v1/projects/${serviceAccount.project_id}/messages:send`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
          body: JSON.stringify({
            message: {
              token,
              notification: { title: notification.title, body: notification.body ?? "" },
              ...(deepLinkUrl ? { data: { url: deepLinkUrl } } : {}),
            },
          }),
        });
        if (!res.ok) {
          const body = await res.text();
          // FCM returns UNREGISTERED (token uninstalled/expired) or NOT_FOUND
          // for tokens that will never succeed again — prune them so future
          // sends don't keep paying for a doomed request.
          if (body.includes("UNREGISTERED") || body.includes("NOT_FOUND")) staleTokens.push(token);
        }
      })
    );

    if (staleTokens.length) {
      await supabase.from("device_tokens").delete().in("token", staleTokens);
    }

    return new Response(JSON.stringify({ sent: tokens.length - staleTokens.length }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error(err);
    return new Response(String(err), { status: 500 });
  }
});
