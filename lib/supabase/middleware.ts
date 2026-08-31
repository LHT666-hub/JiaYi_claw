import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { getSupabaseAnonKey, getSupabaseUrl, isSupabaseConfigured } from "@/lib/supabase/env";
import { getLegacyPageTarget, isLegacyApiPath } from "@/lib/routing/legacy";

export async function updateSession(request: NextRequest) {
  const demoEnabled = process.env.NEXT_PUBLIC_DEMO_MODE === "true";
  const pathname = request.nextUrl.pathname;
  const protectedPrefixes = [
    "/",
    "/services",
    "/messages",
    "/me",
    "/ask",
    "/appointments",
    "/health-records",
    "/contacts",
    "/match-leader",
    "/account-security",
    "/notification-settings",
    "/privacy",
    "/service-progress",
    "/doctor",
    "/workbench",
    "/admin",
    "/family",
    "/family-link",
    "/notifications",
    "/onboarding",
  ];
  const requiresAuth = protectedPrefixes.some((prefix) => pathname === prefix || (prefix !== "/" && pathname.startsWith(`${prefix}/`)));

  if (!demoEnabled && (pathname === "/demo-center" || pathname.startsWith("/demo-center/"))) {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  if (!demoEnabled) {
    const legacyTarget = getLegacyPageTarget(pathname);
    if (legacyTarget) return NextResponse.redirect(new URL(legacyTarget, request.url));
    if (isLegacyApiPath(pathname)) {
      return NextResponse.json({ error: { code: "LEGACY_API_DISABLED", message: "该旧接口已停用，请使用 /api/v1。" } }, { status: 410 });
    }
  }

  if (!isSupabaseConfigured()) {
    if (requiresAuth && !demoEnabled) return NextResponse.redirect(new URL("/login", request.url));
    return NextResponse.next();
  }

  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  const supabase = createServerClient(getSupabaseUrl(), getSupabaseAnonKey(), {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => {
          request.cookies.set(name, value);
        });

        response = NextResponse.next({
          request: {
            headers: request.headers,
          },
        });

        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
        });
      },
    },
  });

  const { data: { user } } = await supabase.auth.getUser();

  if (requiresAuth && !user && !demoEnabled) {
    const redirect = NextResponse.redirect(new URL(`/login?next=${encodeURIComponent(pathname)}`, request.url));
    response.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie));
    return redirect;
  }

  return response;
}
