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
  const ct = req.headers.get("content-type") || "";
  let user = "", pass = "", remember = false, rawNext = "";

  if (ct.includes("application/x-www-form-urlencoded") || ct.includes("multipart/form-data")) {
    const form = await req.formData();
    user = String(form.get("user") ?? "").trim();
    pass = String(form.get("pass") ?? "");
    remember = form.get("remember") === "on" || form.get("remember") === "true";
    rawNext = String(form.get("next") ?? "");
  } else {
    // Fallback: parse body come url-encoded
    const body = await req.text();
    const params = new URLSearchParams(body);
    user = (params.get("user") ?? "").trim();
    pass = params.get("pass") ?? "";
    remember = params.get("remember") === "on" || params.get("remember") === "true";
    rawNext = params.get("next") ?? "";
  }

  console.log("[login] user=", user, " remember=", remember, " next=", rawNext);
  const next = safeNext(rawNext);

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
