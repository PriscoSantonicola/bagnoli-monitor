import { NextRequest, NextResponse } from "next/server";
import { signToken, SESSION_COOKIE } from "@/lib/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const REMEMBER_MS = 30 * 24 * 3600 * 1000; // 30 giorni
const SESSION_MS = 8 * 3600 * 1000;        // 8 ore

function safeNext(n: string | null | undefined): string {
  if (!n) return "/admin";
  if (!n.startsWith("/") || n.startsWith("//")) return "/admin";
  return n;
}

export async function POST(req: NextRequest) {
  const form = await req.formData();
  const user = String(form.get("user") ?? "").trim();
  const pass = String(form.get("pass") ?? "");
  const remember = form.get("remember") === "on";
  const next = safeNext(String(form.get("next") ?? ""));

  const expectedUser = process.env.ADMIN_USER || "admin";
  const expectedPass = process.env.ADMIN_PASS || "";
  const secret = process.env.SESSION_SECRET || "";

  if (!expectedPass || !secret) {
    return new NextResponse("Admin non configurato", { status: 503 });
  }

  if (user !== expectedUser || pass !== expectedPass) {
    const fh = req.headers.get("x-forwarded-host") || req.headers.get("host") || req.nextUrl.host;
    const fp = req.headers.get("x-forwarded-proto") || req.nextUrl.protocol.replace(":", "");
    const url = new URL(`${fp}://${fh}/login`);
    url.searchParams.set("err", "1");
    url.searchParams.set("next", next);
    return NextResponse.redirect(url, { status: 303 });
  }

  const maxAgeMs = remember ? REMEMBER_MS : SESSION_MS;
  const token = await signToken({ u: user }, secret, maxAgeMs);

  // Usa host forwarded da nginx reverse proxy
  const forwardedHost = req.headers.get("x-forwarded-host") || req.headers.get("host") || req.nextUrl.host;
  const forwardedProto = req.headers.get("x-forwarded-proto") || req.nextUrl.protocol.replace(":", "");
  const url = new URL(`${forwardedProto}://${forwardedHost}${next}`);
  const res = NextResponse.redirect(url, { status: 303 });
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: remember ? REMEMBER_MS / 1000 : undefined, // session cookie se non remember
  });
  return res;
}
