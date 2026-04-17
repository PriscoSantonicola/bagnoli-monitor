/**
 * Sessione firmata HMAC SHA-256 (compatibile Edge runtime + Node).
 * Formato token: base64url(json_payload) + "." + base64url(hmac_signature)
 * Payload: { u: string (username), exp: number (ms dal Unix epoch) }
 */

const enc = new TextEncoder();
const dec = new TextDecoder();

export type SessionPayload = { u: string; exp: number };

function b64urlEncode(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlDecode(s: string): Uint8Array {
  const pad = s.length % 4 === 0 ? 0 : 4 - (s.length % 4);
  const b = atob(s.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat(pad));
  const bytes = new Uint8Array(b.length);
  for (let i = 0; i < b.length; i++) bytes[i] = b.charCodeAt(i);
  return bytes;
}

async function getKey(secret: string) {
  return crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}

export async function signToken(
  payload: { u: string },
  secret: string,
  maxAgeMs: number
): Promise<string> {
  const data: SessionPayload = { u: payload.u, exp: Date.now() + maxAgeMs };
  const body = b64urlEncode(enc.encode(JSON.stringify(data)));
  const key = await getKey(secret);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(body));
  return `${body}.${b64urlEncode(sig)}`;
}

export async function verifyToken(
  token: string | undefined | null,
  secret: string
): Promise<SessionPayload | null> {
  if (!token || typeof token !== "string") return null;
  const parts = token.split(".");
  if (parts.length !== 2) {
    console.log("[verify] wrong parts", parts.length);
    return null;
  }
  const [body, sigB64] = parts;
  try {
    const key = await getKey(secret);
    const sigBuf = b64urlDecode(sigB64);
    // Cast esplicito a BufferSource per placare il TS 5.x
    const ok = await crypto.subtle.verify(
      "HMAC",
      key,
      sigBuf as BufferSource,
      enc.encode(body) as BufferSource
    );
    if (!ok) {
      console.log("[verify] sig mismatch bodyLen=", body.length, " sigLen=", sigB64.length);
      return null;
    }
    const bodyBuf = b64urlDecode(body);
    const data = JSON.parse(
      new TextDecoder().decode(new Uint8Array(bodyBuf))
    ) as SessionPayload;
    if (!data.exp || typeof data.exp !== "number") {
      console.log("[verify] no exp", data);
      return null;
    }
    if (data.exp < Date.now()) {
      console.log("[verify] expired", data.exp, "vs now", Date.now());
      return null;
    }
    return data;
  } catch (e) {
    console.log("[verify] exception", e);
    return null;
  }
}

export const SESSION_COOKIE = "bagnoli_session";
