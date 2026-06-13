// =============================================================================
// NEXT.JS MIDDLEWARE — Supabase session refresh (@supabase/ssr)
// =============================================================================
// Runs on every matched request BEFORE the page/route. Its one job: refresh the
// user's Supabase session and write the refreshed auth cookies onto the
// response, so Server Components downstream see a valid, current session. Without
// this, access tokens silently expire mid-session and authed pages start 401ing.
//
// Requires: npm i @supabase/ssr
// Copy target (per claude.md): src/lib/supabase/middleware.ts, then re-export it
// from a root `middleware.ts` (see the snippet at the bottom).
//
// SECURITY: anon key only. This file never reads service_role. It also does NOT
// make authorization decisions — RLS does that. It only keeps the session fresh
// and (optionally) redirects unauthenticated users away from protected routes.
// =============================================================================

import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/** Public route prefixes that do NOT require a session. ADAPT for your app. */
const PUBLIC_PREFIXES = [
  "/login",
  "/signup",
  "/forgot-password",
  "/reset-password",
  "/auth",
  "/_next",
  "/favicon",
];

export async function updateSession(request: NextRequest): Promise<NextResponse> {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          // Write to BOTH the request (so this pass sees them) and the response
          // (so the browser stores the refreshed tokens).
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    }
  );

  // IMPORTANT: getUser() (not getSession()) — it revalidates the JWT with the
  // auth server, which is what actually triggers the refresh + cookie write.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Optional gate: bounce unauthenticated users off protected routes.
  const path = request.nextUrl.pathname;
  const isPublic = PUBLIC_PREFIXES.some((p) => path === p || path.startsWith(p + "/") || path.startsWith(p));
  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", path);
    return NextResponse.redirect(url);
  }

  return response;
}

// -----------------------------------------------------------------------------
// Root middleware.ts (create at the repo root or src/):
//
//   import { type NextRequest } from "next/server";
//   import { updateSession } from "@/lib/supabase/middleware";
//
//   export async function middleware(request: NextRequest) {
//     return updateSession(request);
//   }
//
//   export const config = {
//     // Run on everything except static assets + images.
//     matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
//   };
// -----------------------------------------------------------------------------
