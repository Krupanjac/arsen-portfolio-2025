-- SQL to create posts table for Cloudflare D1
CREATE TABLE IF NOT EXISTS posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  description TEXT,
  tags TEXT, -- JSON array
  images TEXT, -- JSON array of image URLs
  created_by TEXT,
  updated_by TEXT,
  created_at INTEGER,
  updated_at INTEGER
);
