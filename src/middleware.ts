import { NextRequest, NextResponse } from "next/server";

/**
 * Basic HTTP Auth per /admin/*
 *
 * Credenziali da env:
 *   ADMIN_USER (default "admin")
 *   ADMIN_PASS (richiesto)
 *
 * Tutto il resto (frontend trasparenza, /api/public/*) e' pubblico.
 */
export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Solo l'area admin e' protetta
  if (!pathname.startsWith("/admin")) {
    return NextResponse.next();
  }

  const expectedUser = process.env.ADMIN_USER || "admin";
  const expectedPass = process.env.ADMIN_PASS;

  // Se ADMIN_PASS non e' settata, blocca l'accesso per default
  if (!expectedPass) {
    return new NextResponse("Admin not configured", { status: 503 });
  }

  const auth = req.headers.get("authorization") || "";
  if (auth.startsWith("Basic ")) {
    const b64 = auth.slice(6).trim();
    try {
      const decoded = atob(b64);
      const idx = decoded.indexOf(":");
      if (idx >= 0) {
        const user = decoded.slice(0, idx);
        const pass = decoded.slice(idx + 1);
        if (user === expectedUser && pass === expectedPass) {
          return NextResponse.next();
        }
      }
    } catch {
      /* fallthrough a 401 */
    }
  }

  return new NextResponse("Authentication required", {
    status: 401,
    headers: {
      "WWW-Authenticate": 'Basic realm="Bagnoli Monitor Admin", charset="UTF-8"',
    },
  });
}

export const config = {
  matcher: ["/admin/:path*"],
};
