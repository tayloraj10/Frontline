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
