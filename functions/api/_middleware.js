import { verifyJWT } from './login.js';
import { getTokenFromRequest, unauthorizedJSON, forbiddenJSON } from './_auth.js';

export async function onRequest({ request, env, next }) {
  const url = new URL(request.url);
  const pathname = url.pathname || '/';

  // Public routes (login UI + login API) and static assets should be accessible
  // without authentication. Everything else is protected.
  const publicPrefixes = [
  '/login', // frontend route for LoginComponent
  '/api/login', // API route if used
  '/functions/login', // some hosts expose functions under /functions/
  '/assets',
  '/projectImg',
  '/public',
  '/i18n',
  // session endpoint (client calls this to check auth)
  '/api/session',
  
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


  const token = getTokenFromRequest(request);
  if (!token) return unauthorizedJSON();

  try {
    const payload = await verifyJWT(token, env.JWT_SECRET);
    if (!payload) return forbiddenJSON();
    return next();
  } catch (err) {
    return forbiddenJSON();
  }
}
