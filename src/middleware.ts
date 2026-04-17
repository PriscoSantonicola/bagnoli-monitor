import { NextRequest, NextResponse } from "next/server";
import { verifyToken, SESSION_COOKIE } from "@/lib/session";

/**
 * Protezione /admin/* tramite cookie di sessione firmato.
 * No Basic Auth modale — redirect alla pagina /login.
 *
 * Env richieste:
 *   ADMIN_USER     (default "admin")
 *   ADMIN_PASS     (richiesto)
 *   SESSION_SECRET (richiesto, min 32 char)
 */
export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (!pathname.startsWith("/admin")) {
    return NextResponse.next();
  }

  const secret = process.env.SESSION_SECRET;
  const expectedPass = process.env.ADMIN_PASS;
  if (!secret || !expectedPass) {
    return new NextResponse(
      "Admin non configurato (manca SESSION_SECRET o ADMIN_PASS)",
      { status: 503 }
    );
  }

  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const session = await verifyToken(token, secret);
  const expectedUser = process.env.ADMIN_USER || "admin";
  if (session && session.u === expectedUser) {
    return NextResponse.next();
  }

  // Ricostruisci URL /login usando l'host forwarded da nginx (se presente)
  const forwardedHost = req.headers.get("x-forwarded-host") || req.headers.get("host") || req.nextUrl.host;
  const forwardedProto = req.headers.get("x-forwarded-proto") || req.nextUrl.protocol.replace(":", "");
  const loginUrl = new URL(`${forwardedProto}://${forwardedHost}/login`);
  if (pathname !== "/admin") loginUrl.searchParams.set("next", pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/admin/:path*"],
};
