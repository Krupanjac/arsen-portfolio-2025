// Small auth utilities: token extraction and standard JSON error responses
export function getTokenFromRequest(request) {
  const cookie = request.headers.get('Cookie') || '';
  return cookie.split('; ').find(c => c.startsWith('auth='))?.split('=')[1];
}

export function unauthorizedJSON() {
  return new Response(JSON.stringify({ error: 'Unauthorized' }), {
    status: 401,
    headers: { 'Content-Type': 'application/json' },
  });
}

export function forbiddenJSON() {
  return new Response(JSON.stringify({ error: 'Forbidden' }), {
    status: 403,
    headers: { 'Content-Type': 'application/json' },
  });
}

export function jsonOK(body) {
  return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
}
