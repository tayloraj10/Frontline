import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const rawNext = searchParams.get("next") ?? "";
  const hasExplicitNext = rawNext.startsWith("/");

  if (code) {
    let redirectTo = hasExplicitNext ? rawNext : "/campaigns";
    const redirectResponse = NextResponse.redirect(`${origin}${redirectTo}`);

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return request.cookies.getAll();
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) =>
              redirectResponse.cookies.set(name, value, options)
            );
          },
        },
      }
    );

    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      if (rawNext === "/partners/apply") {
        // Only true signups should become business-only, not an existing user
        // logging back in through an apply link. A brand-new account's
        // created_at and last_sign_in_at land within milliseconds of each
        // other (separate statements in the same signup request), never
        // exactly equal, so compare with a tolerance instead of ===.
        const isNewSignup =
          !!data.user.last_sign_in_at &&
          Math.abs(new Date(data.user.last_sign_in_at).getTime() - new Date(data.user.created_at).getTime()) < 10000;
        if (isNewSignup) {
          await supabase
            .schema("public")
            .from("profiles")
            .update({ is_business_only: true })
            .eq("id", data.user.id);
        }
      }
      if (!hasExplicitNext) {
        const { data: profile } = await supabase
          .schema("public")
          .from("profiles")
          .select("is_business_only")
          .eq("id", data.user.id)
          .single();
        if (profile?.is_business_only) {
          redirectTo = "/partners/dashboard";
          redirectResponse.headers.set("location", `${origin}${redirectTo}`);
        }
      }
      return redirectResponse;
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth_failed`);
}
