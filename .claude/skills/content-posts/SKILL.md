---
name: content-posts
description: Work on the Projects and Experience content system, which spans the D1 posts table, /api/posts, BlogService, the Dashboard editor and how posts render. Use for schema changes, new post fields, rendering changes or seeding local data.
---

# Projects and Experience content

## Moving parts

| Layer | Where |
|---|---|
| Schema | `migrations/000N_*.sql`. Legacy copies also live in `functions/db/init_posts.sql` and inline in `functions/api/posts.js`; keep them in sync until BUG-6 removes them |
| API | `functions/api/posts.js`. `GET` is public; `POST`, `PUT` and `DELETE` need the auth cookie |
| Client model | `BlogPost` in `src/app/blog.service.ts` |
| Editor | `src/app/admin-editor/`, inside the nav's Dashboard modal |
| Rendering | `experience/` (timeline) and `projects/` (cards), with `blog-modal/` as the project viewer |

## Conventions

- `created_at` and `updated_at` are epoch **seconds**. Display them with `(post.created_at * 1000) | date:'…'`.
- `tags` and `images` are JSON arrays stored as TEXT. The API parses them on read and stringifies them on write.
- `category` is `'project'` or `'experience'`, and the client filters on it. Experience posts drop their images on save.
- `description` is markdown. Render it with the `markdown` pipe (marked + DOMPurify), never as raw HTML.
- Images are ImageKit URLs. Use the `ImagekitService` helpers to get sized and responsive variants.

## Adding a field (example: `link`)

1. **Migration.** Create `migrations/0002_add_post_link.sql` containing `ALTER TABLE posts ADD COLUMN link TEXT;`, then run `npx wrangler d1 migrations apply portfolio --local`.
2. **`posts.js`.** Read `link` from the body in POST and PUT, bind it in the INSERT and UPDATE, and validate it (an `https:` URL).
3. **Model.** Add `link?: string` to `BlogPost`.
4. **Editor.** Add an input bound to `editing.link`, with a translated label.
5. **Rendering.** Update the card, modal or timeline as needed.
6. **PR description.** Put the migration at the top. The owner applies it to production with `--remote` **before** merging. Agents never run `--remote`.

## Local data

`ng serve` doesn't serve `/api`, so both sections show their empty states. For the full stack (`wrangler pages dev`, a local D1 and a seed `INSERT`), see `docs/DEVELOPMENT.md`, "Full stack locally".

## Gotchas

- Projects and Experience each call `BlogService.list()` (BUG-3). If you add caching, invalidate it after create, update and delete.
- Posts render only in the browser, never in the prerendered HTML (SEO-1). Anything that changes that needs safe server-side sanitizing first (SEC-6).
- Preview deployments most likely share the production D1. Don't create test posts on a preview URL.
