import bcrypt from "bcryptjs";

// base64url helpers (UTF-8 safe)
function base64UrlEncode(str) {
  const bytes = new TextEncoder().encode(str);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlFromArrayBuffer(buf) {
  const bytes = new Uint8Array(buf);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlDecodeToString(b64u) {
  // convert base64url to base64
  let base64 = b64u.replace(/-/g, "+").replace(/_/g, "/");
  // add padding
  const pad = base64.length % 4;
  if (pad === 2) base64 += "==";
  else if (pad === 3) base64 += "=";
  else if (pad !== 0) base64 += "";

  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

// Helper to sign JWT manually (produces base64url header.payload.signature)
async function signJWT(payload, secret) {
  const header = { alg: "HS256", typ: "JWT" };
  const headerB64 = base64UrlEncode(JSON.stringify(header));
  const payloadB64 = base64UrlEncode(JSON.stringify(payload));
  const data = `${headerB64}.${payloadB64}`;

  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(data));
  const sigB64u = base64UrlFromArrayBuffer(signature);

  return `${data}.${sigB64u}`;
}

// Verify a JWT produced by signJWT (checks signature and exp); returns payload object or null
export async function verifyJWT(token, secret) {
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [headerB64u, payloadB64u, sigB64u] = parts;

  // decode header/payload
  let header, payload;
  try {
    header = JSON.parse(base64UrlDecodeToString(headerB64u));
    payload = JSON.parse(base64UrlDecodeToString(payloadB64u));
  } catch (e) {
    return null;
  }

  if (!header || header.alg !== 'HS256') return null;

  // verify signature by re-signing
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const data = `${headerB64u}.${payloadB64u}`;
  const expectedSig = await crypto.subtle.sign('HMAC', key, encoder.encode(data));
  const expectedSigB64u = base64UrlFromArrayBuffer(expectedSig);

  if (sigB64u !== expectedSigB64u) return null;

  // Check exp (assumed seconds since epoch)
  const now = Math.floor(Date.now() / 1000);
  if (typeof payload.exp === 'number' && payload.exp < now) return null;

  return payload;
}

// CORS helper — echo Origin when present so credentials (cookies) are allowed
function corsHeaders(request) {
  const origin = request.headers.get("Origin") || "*";
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Credentials": "true",
  };
}

export async function onRequestOptions({ request }) {
  // Respond to preflight requests
  return new Response(null, {
    status: 204,
    headers: corsHeaders(request),
  });
}

export async function onRequestPost({ request, env }) {
  // Read body once (avoid double-reading the request stream)
  const bodyJson = await request.json().catch(() => ({}));
  const { username, password, turnstile: turnstileToken } = bodyJson;
  if (!turnstileToken) return new Response('Missing turnstile token', { status: 400, headers: corsHeaders(request) });

  // Read Turnstile secret from environment binding (from .env / Wrangler)
  // This expects TURNSTILE_SECRET to be provided to the Worker at deploy/run time.
  let secret = env.TURNSTILE_SECRET;
  if (!secret) return new Response('Turnstile secret not configured. Set TURNSTILE_SECRET in environment.', { status: 500, headers: corsHeaders(request) });

  // Defensive check: if the secret looks like a bcrypt hash (unlikely for env), avoid using it
  if (typeof secret === 'string' && secret.startsWith('$2')) {
    return new Response('Turnstile secret appears to be a bcrypt hash; verification requires the plaintext secret in TURNSTILE_SECRET', { status: 500, headers: corsHeaders(request) });
  }

  // Verify with Cloudflare Turnstile
  try {
    const verifyResp = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ secret, response: turnstileToken })
    });

    const verifyJson = await verifyResp.json();
    if (!verifyJson.success) {
      return new Response('Turnstile verification failed', { status: 401, headers: corsHeaders(request) });
    }
  } catch (e) {
    return new Response('Turnstile verification error', { status: 500, headers: corsHeaders(request) });
  }

  const storedHash = await env.USERS.get(`user:${username}`);
  if (!storedHash) return new Response("Invalid credentials", { status: 401, headers: corsHeaders(request) });

  const valid = await bcrypt.compare(password, storedHash);
  if (!valid) return new Response("Invalid credentials", { status: 401, headers: corsHeaders(request) });


  // exp must be seconds since epoch (JWT standard)
  const token = await signJWT({ username, exp: Math.floor(Date.now() / 1000) + 3600 }, env.JWT_SECRET);

  const headers = {
    ...corsHeaders(request),
    // persistent cookie for 1 hour (Max-Age=3600). HttpOnly and Secure remain set.
    "Set-Cookie": `auth=${token}; HttpOnly; Secure; Path=/; SameSite=Strict; Max-Age=3600`,
    "Content-Type": "application/json",
  };

  return new Response(JSON.stringify({ success: true }), { headers });
}

// Generic entrypoint: some runtimes invoke `onRequest` instead of method-specific
// handlers. Dispatch to the method-specific exports to ensure POST/OPTIONS are handled.
export async function onRequest(context) {
  const { request } = context;
  const method = request.method?.toUpperCase();

  if (method === 'OPTIONS') return onRequestOptions(context);
  if (method === 'POST') return onRequestPost(context);

  return new Response('Method Not Allowed', { status: 405, headers: corsHeaders(request) });
}
