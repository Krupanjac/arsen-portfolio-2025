// Clears the auth cookie set by login.js
function corsHeaders(request) {
  const origin = request.headers.get('Origin') || '*';
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Credentials': 'true',
  };
}

export async function onRequestOptions({ request }) {
  return new Response(null, { status: 204, headers: corsHeaders(request) });
}

export async function onRequestPost({ request }) {
  const headers = {
    ...corsHeaders(request),
    'Set-Cookie': `auth=; HttpOnly; Secure; Path=/; SameSite=Strict; Max-Age=0`,
    'Content-Type': 'application/json',
  };
  return new Response(JSON.stringify({ success: true }), { status: 200, headers });
}

export async function onRequest(context) {
  const { request } = context;
  const method = request.method?.toUpperCase();
  if (method === 'OPTIONS') return onRequestOptions(context);
  if (method === 'POST') return onRequestPost(context);
  return new Response('Method Not Allowed', { status: 405, headers: corsHeaders(request) });
}
