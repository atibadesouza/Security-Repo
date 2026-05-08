// =============================================================================
// NEXT.JS MIDDLEWARE — refresh Supabase session cookie per request
// =============================================================================
// Drop into your project's middleware.ts (project root or src/middleware.ts).
// Refreshes the session cookie on every request so server-side reads stay in
// sync with browser state. Without this, signed-in users will appear signed
// out to Server Components after their access token rotates.
//
// IMPORTANT: getUser() must run between createServerClient and the response
// return — that's what triggers Supabase to issue a fresh cookie when needed.
//
// Required deps:
//   npm i @supabase/ssr @supabase/supabase-js
//
// Example consumer (your project's `middleware.ts`):
//
//   import { type NextRequest } from "next/server";
//   import { updateSession } from "@/lib/supabase/middleware";
//
//   export async function middleware(request: NextRequest) {
//     return updateSession(request);
//   }
//
//   export const config = {
//     matcher: [
//       // Run on every request except static assets + signout (which clears
//       // cookies itself and must NOT be redirected back to login).
//       "/((?!_next/static|_next/image|favicon.ico|auth/signout).*)",
//     ],
//   };
// =============================================================================

import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Triggers cookie refresh when the access token is near expiry. Do not
  // remove this line — without it the cookie never rotates and signed-in
  // users will appear signed out after the token TTL elapses.
  await supabase.auth.getUser();

  return supabaseResponse;
}
