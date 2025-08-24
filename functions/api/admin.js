import { verifyJWT } from './login.js';
import { getTokenFromRequest, unauthorizedJSON, forbiddenJSON, jsonOK } from './_auth.js';

export async function onRequestGet({ request, env }) {
  const token = getTokenFromRequest(request);
  if (!token) return unauthorizedJSON();

  const payload = await verifyJWT(token, env.JWT_SECRET);
  if (!payload) return forbiddenJSON();

  return jsonOK({ message: 'Welcome to the admin area!', username: payload.username });
}
