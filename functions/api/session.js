// Lightweight session check endpoint. Returns JSON { authenticated: true, username }
async function verifyJWT(token, secret) {
  const [header, body, signature] = token.split('.');
  const encoder = new TextEncoder();
  const data = `${header}.${body}`;

  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify']
  );

  const sigBytes = Uint8Array.from(atob(signature.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
  const valid = await crypto.subtle.verify('HMAC', key, sigBytes, encoder.encode(data));

  if (!valid) throw new Error('Invalid signature');

  const payload = JSON.parse(atob(body));
  if (Date.now() > payload.exp) throw new Error('Expired token');

  return payload;
}

export async function onRequestGet({ request, env }) {
  const cookie = request.headers.get('Cookie') || '';
  const token = cookie.split('; ').find(c => c.startsWith('auth='))?.split('=')[1];

  if (!token) {
    return new Response(JSON.stringify({ authenticated: false }), { status: 401, headers: { 'Content-Type': 'application/json' } });
  }

  try {
    const payload = await verifyJWT(token, env.JWT_SECRET);
    return new Response(JSON.stringify({ authenticated: true, username: payload.username }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (err) {
    return new Response(JSON.stringify({ authenticated: false }), { status: 403, headers: { 'Content-Type': 'application/json' } });
  }
}
