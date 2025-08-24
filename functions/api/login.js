import bcrypt from "bcryptjs";

// Helper to sign JWT manually
async function signJWT(payload, secret) {
  const encoder = new TextEncoder();
  const header = btoa(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = btoa(JSON.stringify(payload));
  const data = `${header}.${body}`;

  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(data));
  const sigBase64 = btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

  return `${data}.${sigBase64}`;
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
  const { username, password } = await request.json();

  const storedHash = await env.USERS.get(`user:${username}`);
  if (!storedHash) return new Response("Invalid credentials", { status: 401, headers: corsHeaders(request) });

  const valid = await bcrypt.compare(password, storedHash);
  if (!valid) return new Response("Invalid credentials", { status: 401, headers: corsHeaders(request) });

  const token = await signJWT({ username, exp: Date.now() + 3600_000 }, env.JWT_SECRET);

  const headers = {
    ...corsHeaders(request),
    "Set-Cookie": `auth=${token}; HttpOnly; Secure; Path=/; SameSite=Strict`,
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
