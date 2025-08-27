import { getTokenFromRequest, unauthorizedJSON, forbiddenJSON, jsonOK } from './_auth.js';
import { verifyJWT } from './login.js';

function corsHeaders(request) {
  const origin = request.headers.get('Origin') || '*';
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Credentials': 'true',
  };
}

export async function onRequestOptions({ request }) {
  return new Response(null, { status: 204, headers: corsHeaders(request) });
}

// Helper to require auth for mutating operations
async function requireAuth(request, env) {
  const token = getTokenFromRequest(request);
  if (!token) return null;
  const payload = await verifyJWT(token, env.JWT_SECRET);
  return payload; // or null
}

// run SQL from file to initialize DB
export async function onRequestPost(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  // support /api/posts/init to run schema
  if (url.pathname.endsWith('/init')) {
    // Only allow when called by an authenticated user
    const payload = await requireAuth(request, env);
    if (!payload) return unauthorizedJSON();

    // read SQL file bundled under functions/db/init_posts.sql
    try {
      const sql = await (await fetch(new URL('../db/init_posts.sql', import.meta.url))).text();
      await env.PORTFOLIO.prepare(sql).run();
      return jsonOK({ success: true });
    } catch (e) {
      return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }
  }

  // create post when POST to /api/posts
  if (url.pathname.endsWith('/posts') || url.pathname.endsWith('/posts/')) {
    const payload = await requireAuth(request, env);
    if (!payload) return unauthorizedJSON();

    const body = await request.json().catch(() => ({}));
    const { title, description, tags, images } = body;
    if (!title) return new Response(JSON.stringify({ error: 'Missing title' }), { status: 400, headers: { 'Content-Type': 'application/json' } });

    try {
      const now = Math.floor(Date.now() / 1000);
      const res = await env.PORTFOLIO.prepare(
        `INSERT INTO posts (title, description, tags, images, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?)`
      ).bind(title, description || null, JSON.stringify(tags || []), JSON.stringify(images || []), payload.username, now).run();

      return jsonOK({ success: true, insertedId: res.lastInsertRowid || null });
    } catch (e) {
      return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }
  }

  return new Response('Not Found', { status: 404 });
}

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  // list or get single
  const id = url.searchParams.get('id');
  try {
    if (id) {
      const res = await env.PORTFOLIO.prepare('SELECT * FROM posts WHERE id = ?').bind(id).first();
      if (!res) return new Response(null, { status: 404 });
      // parse JSON fields
      if (res.tags) res.tags = JSON.parse(res.tags);
      if (res.images) res.images = JSON.parse(res.images);
      return jsonOK(res);
    }

    const rows = await env.PORTFOLIO.prepare('SELECT * FROM posts ORDER BY created_at DESC').all();
    const list = rows.results.map(r => ({ ...r, tags: r.tags ? JSON.parse(r.tags) : [], images: r.images ? JSON.parse(r.images) : [] }));
    return jsonOK(list);
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}

export async function onRequestPut({ request, env }) {
  // update post (body must contain id and fields)
  const payload = await requireAuth(request, env);
  if (!payload) return unauthorizedJSON();

  const body = await request.json().catch(() => ({}));
  const { id, title, description, tags, images } = body;
  if (!id) return new Response(JSON.stringify({ error: 'Missing id' }), { status: 400, headers: { 'Content-Type': 'application/json' } });

  try {
    const now = Math.floor(Date.now() / 1000);
    await env.PORTFOLIO.prepare(
      `UPDATE posts SET title = ?, description = ?, tags = ?, images = ?, updated_by = ?, updated_at = ? WHERE id = ?`
    ).bind(title || null, description || null, JSON.stringify(tags || []), JSON.stringify(images || []), payload.username, now, id).run();

    return jsonOK({ success: true });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}

export async function onRequestDelete({ request, env }) {
  const payload = await requireAuth(request, env);
  if (!payload) return unauthorizedJSON();

  const url = new URL(request.url);
  const id = url.searchParams.get('id');
  if (!id) return new Response(JSON.stringify({ error: 'Missing id' }), { status: 400, headers: { 'Content-Type': 'application/json' } });

  try {
    await env.PORTFOLIO.prepare('DELETE FROM posts WHERE id = ?').bind(id).run();
    return jsonOK({ success: true });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}
