import { jwtVerify } from "jose";

export async function onRequest({ request, env, next }) {
  const cookie = request.headers.get("Cookie") || "";
  const auth = cookie.split("; ").find(c => c.startsWith("auth="))?.split("=")[1];

  if (!auth) {
    return new Response("Unauthorized", { status: 401 });
  }

  try {
    await jwtVerify(auth, new TextEncoder().encode(env.JWT_SECRET));
    return next(); // allow request
  } catch {
    return new Response("Invalid or expired session", { status: 403 });
  }
}
