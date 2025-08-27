import { getTokenFromRequest, unauthorizedJSON } from './_auth.js';
import { verifyJWT } from './login.js';

export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    // Verify user is authenticated
    const token = getTokenFromRequest(request);
    if (!token) {
      return unauthorizedJSON('Authentication required');
    }

    const payload = await verifyJWT(token, env.JWT_SECRET);
    if (!payload) {
      return unauthorizedJSON('Invalid token');
    }

    // Generate authentication parameters for ImageKit
    const privateKey = env.IMAGEKIT_PRIVATE_KEY;
    if (!privateKey) {
      return new Response(JSON.stringify({
        error: 'ImageKit private key not configured'
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Generate token and expire
    const array = new Uint8Array(16);
    crypto.getRandomValues(array);
    const imagekitToken = Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
    const expire = Math.floor(Date.now() / 1000) + 3000; // 50 minutes from now (less than 1 hour)

    // Create signature: HMAC-SHA1 of (token + expire) using private key
    const encoder = new TextEncoder();
    const data = encoder.encode(imagekitToken + expire);
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(privateKey),
      { name: 'HMAC', hash: 'SHA-1' },
      false,
      ['sign']
    );
    const signatureArray = await crypto.subtle.sign('HMAC', key, data);
    const signature = Array.from(new Uint8Array(signatureArray), byte => byte.toString(16).padStart(2, '0')).join('');

    return new Response(JSON.stringify({
      token: imagekitToken,
      signature: signature,
      expire: expire
    }), {
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('ImageKit auth error:', error);
    return new Response(JSON.stringify({
      error: 'Failed to generate authentication parameters'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

// Handle CORS preflight requests
export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Allow-Credentials': 'true',
    }
  });
}
