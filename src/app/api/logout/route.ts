import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/lib/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const fh = req.headers.get("x-forwarded-host") || req.headers.get("host") || req.nextUrl.host;
  const fp = req.headers.get("x-forwarded-proto") || req.nextUrl.protocol.replace(":", "");
  const res = NextResponse.redirect(new URL(`${fp}://${fh}/login`), { status: 303 });
  res.cookies.set(SESSION_COOKIE, "", { path: "/", maxAge: 0 });
  return res;
}

export async function GET(req: NextRequest) {
  return POST(req);
}
