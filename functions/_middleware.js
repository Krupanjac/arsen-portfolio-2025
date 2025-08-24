async function verifyJWT(token, secret) {
  const [header, body, signature] = token.split(".");
  const encoder = new TextEncoder();
  const data = `${header}.${body}`;

  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"]
  );

  const sigBytes = Uint8Array.from(atob(signature.replace(/-/g, "+").replace(/_/g, "/")), c => c.charCodeAt(0));
  const valid = await crypto.subtle.verify("HMAC", key, sigBytes, encoder.encode(data));

  if (!valid) throw new Error("Invalid signature");

  const payload = JSON.parse(atob(body));
  if (Date.now() > payload.exp) throw new Error("Expired token");

  return payload;
}

export async function onRequest({ request, env, next }) {
  const url = new URL(request.url);
  const pathname = url.pathname || '/';

  // Public routes (login UI + login API) and static assets should be accessible
  // without authentication. Everything else is protected.
  const publicPrefixes = [
  '/login', // frontend route for LoginComponent
  '/api/login', // API route if used
  '/.netlify/functions/login', // Netlify-style function path
  '/functions/login', // some hosts expose functions under /functions/
  '/assets',
  '/projectImg',
  '/public',
  '/i18n',
  // Make Angular component routes public so users can view the site without auth
  '/',
  '/projects',
  '/work',
  '/about',
  '/contact',
  '/home',
  ];

  // Allow requests for common static file extensions (css/js/images/fonts/json/etc.)
  const staticExtRegex = /\.(css|js|mjs|png|jpg|jpeg|gif|svg|ico|webp|json|woff2?|ttf|map)$/i;

  // If the request targets a public prefix or a static asset, skip auth.
  if (
    publicPrefixes.some(p => pathname === p || pathname.startsWith(p + '/')) ||
    staticExtRegex.test(pathname)
  ) {
    return next();
  }


  const cookie = request.headers.get('Cookie') || '';
  const token = cookie.split('; ').find(c => c.startsWith('auth='))?.split('=')[1];

  if (!token) return new Response('Unauthorized', { status: 401 });

  try {
    await verifyJWT(token, env.JWT_SECRET);
    return next();
  } catch (err) {
    return new Response('Invalid or expired session', { status: 403 });
  }
}
