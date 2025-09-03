import { getTokenFromRequest, unauthorizedJSON, forbiddenJSON, jsonOK } from './_auth.js';
import { verifyJWT } from './login.js';

// Function to initialize the database if the posts table doesn't exist
async function initializeDatabase(env) {
  try {
    // Check if posts table exists
    const tableCheck = await env.PORTFOLIO.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='posts'").first();
    if (!tableCheck) {
      // Posts table missing — create it
      // Hardcoded SQL to create the table
      const sql = `-- SQL to create posts table for Cloudflare D1
CREATE TABLE IF NOT EXISTS posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  description TEXT,
  tags TEXT, -- JSON array
  images TEXT, -- JSON array of image URLs
  category TEXT, -- 'project' or 'work'
  created_by TEXT,
  updated_by TEXT,
  created_at INTEGER,
  updated_at INTEGER
);`;
  await env.PORTFOLIO.prepare(sql).run();
    } else {
      console.log('Posts table already exists');
    }
  } catch (e) {
    console.error('Error initializing database:', e);
  }
}

function corsHeaders(request) {
  const origin = request.headers.get('Origin') || '*';
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Credentials': 'true',
  };
}

export async function onRequestOptions({ request, env }) {
  await initializeDatabase(env);
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
  await initializeDatabase(env);
  const url = new URL(request.url);

  // support /api/posts/init to run schema
  if (url.pathname === '/api/posts/init' || url.pathname.endsWith('/posts/init')) {
    await initializeDatabase(env);
    return jsonOK({ success: true });
  }

  // create post when POST to /api/posts
  if (url.pathname.endsWith('/posts') || url.pathname.endsWith('/posts/')) {
  // create post
    const payload = await requireAuth(request, env);
    if (!payload) return unauthorizedJSON();

    const body = await request.json().catch(() => ({}));
    const { title, description, tags, images, category, created_at } = body;
    if (!title) return new Response(JSON.stringify({ error: 'Missing title' }), { status: 400, headers: { 'Content-Type': 'application/json' } });

    try {
      // Allow manual created_at override (seconds). If ms provided, convert.
      let createdAt = created_at ? parseInt(created_at, 10) : undefined;
      if (createdAt && createdAt > 1e12) { // looks like ms
        createdAt = Math.floor(createdAt / 1000);
      }
      if (!createdAt || !isFinite(createdAt)) {
        createdAt = Math.floor(Date.now() / 1000);
      }
      const res = await env.PORTFOLIO.prepare(
        `INSERT INTO posts (title, description, tags, images, category, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).bind(title, description || null, JSON.stringify(tags || []), JSON.stringify(images || []), category || null, payload.username, createdAt).run();

      return jsonOK({ success: true, insertedId: res.lastInsertRowid || null });
    } catch (e) {
      console.error('Database error:', e);
      return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }
  }

  return new Response('Not Found', { status: 404 });
}

export async function onRequestGet({ request, env }) {
  await initializeDatabase(env);
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
  await initializeDatabase(env);
  // update post (body must contain id and fields)
  const payload = await requireAuth(request, env);
  if (!payload) return unauthorizedJSON();

  const body = await request.json().catch(() => ({}));
  console.log('PUT request body:', body); // Debug log
  const { id, title, description, tags, images, category, created_at } = body;
  if (!id) return new Response(JSON.stringify({ error: 'Missing id' }), { status: 400, headers: { 'Content-Type': 'application/json' } });

  try {
    const now = Math.floor(Date.now() / 1000);
    let createdAt = created_at ? parseInt(created_at, 10) : undefined;
    if (createdAt && createdAt > 1e12) createdAt = Math.floor(createdAt / 1000);
    if (createdAt && !isFinite(createdAt)) createdAt = undefined;

    await env.PORTFOLIO.prepare(
      `UPDATE posts SET title = ?, description = ?, tags = ?, images = ?, category = ?, created_at = COALESCE(?, created_at), updated_by = ?, updated_at = ? WHERE id = ?`
    ).bind(title || null, description || null, JSON.stringify(tags || []), JSON.stringify(images || []), category || null, createdAt || null, payload.username, now, id).run();

    return jsonOK({ success: true });
  } catch (e) {
    console.error('Database update error:', e);
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}

export async function onRequestDelete({ request, env }) {
  await initializeDatabase(env);
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

// Generic entrypoint: some runtimes invoke `onRequest` instead of method-specific
// handlers. Dispatch to the method-specific exports to ensure POST/OPTIONS are handled.
export async function onRequest(context) {
  const { request, env } = context;

  // Initialize database if needed on every request
  await initializeDatabase(env);

  const method = request.method?.toUpperCase();
  const url = new URL(request.url);

  console.log('Main onRequest called:', method, url.pathname); // Debug log

  if (method === 'OPTIONS') return onRequestOptions(context);
  if (method === 'GET') return onRequestGet(context);
  if (method === 'POST') return onRequestPost(context);
  if (method === 'PUT') return onRequestPut(context);
  if (method === 'DELETE') return onRequestDelete(context);

  console.log('Method not allowed:', method); // Debug log
  return new Response('Method Not Allowed', { status: 405, headers: corsHeaders(request) });
}
