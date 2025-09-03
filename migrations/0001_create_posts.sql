-- Migration: create posts table for Cloudflare D1
-- Run with: wrangler d1 migrations apply --database portfolio

CREATE TABLE IF NOT EXISTS posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  description TEXT,
  tags TEXT, -- JSON array
  images TEXT, -- JSON array of image URLs
  category TEXT, -- 'project' or 'experience'
  created_by TEXT,
  updated_by TEXT,
  created_at INTEGER,
  updated_at INTEGER
);
