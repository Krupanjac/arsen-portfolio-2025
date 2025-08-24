import bcrypt from "bcryptjs";
import { SignJWT } from "jose";

export async function onRequestPost({ request, env }) {
  const { username, password } = await request.json();

  // Get stored hash from KV
  const storedHash = await env.USERS.get(`user:${username}`);
  if (!storedHash) {
    return new Response("Invalid credentials", { status: 401 });
  }

  // Verify password
  const valid = await bcrypt.compare(password, storedHash);
  if (!valid) {
    return new Response("Invalid credentials", { status: 401 });
  }

  // Generate JWT
  const token = await new SignJWT({ username })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("1h")
    .sign(new TextEncoder().encode(env.JWT_SECRET));

  // Return response with secure cookie
  return new Response(JSON.stringify({ success: true }), {
    headers: {
      "Set-Cookie": `auth=${token}; HttpOnly; Secure; Path=/; SameSite=Strict`,
      "Content-Type": "application/json"
    }
  });
}
