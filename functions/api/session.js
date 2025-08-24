import { verifyJWT } from './login.js';
import { getTokenFromRequest, unauthorizedJSON, forbiddenJSON, jsonOK } from './_auth.js';

export async function onRequestGet({ request, env }) {
  const token = getTokenFromRequest(request);
  if (!token) return jsonOK({ authenticated: false });

  try {
    const payload = await verifyJWT(token, env.JWT_SECRET);
    if (!payload) return jsonOK({ authenticated: false });
    return jsonOK({ authenticated: true, username: payload.username });
  } catch (err) {
    return jsonOK({ authenticated: false });
  }
}
