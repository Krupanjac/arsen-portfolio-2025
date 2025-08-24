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

export async function onRequestPost({ request, env }) {
  const { username, password } = await request.json();

  const storedHash = await env.USERS.get(`user:${username}`);
  if (!storedHash) return new Response("Invalid credentials", { status: 401 });

  const valid = await bcrypt.compare(password, storedHash);
  if (!valid) return new Response("Invalid credentials", { status: 401 });

  const token = await signJWT({ username, exp: Date.now() + 3600_000 }, env.JWT_SECRET);

  return new Response(JSON.stringify({ success: true }), {
    headers: {
      "Set-Cookie": `auth=${token}; HttpOnly; Secure; Path=/; SameSite=Strict`,
      "Content-Type": "application/json"
    }
  });
}
