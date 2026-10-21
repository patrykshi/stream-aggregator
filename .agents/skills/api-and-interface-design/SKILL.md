---
name: api-and-interface-design
description: >-
  Use this skill when designing or modifying HTTP routes, Stremio v2 Addon protocol endpoints,
  codec configurations, or local management APIs in Stream Aggregator.
---

# API & Interface Design (Stream Aggregator)

This skill governs API contracts and protocol compliance across public playback routes and protected management APIs.

## Stremio v2 Protocol Requirements

1. **Manifest Route (`/:token/manifest.json`):**
   - Returns valid Stremio Addon manifest JSON with: `id`, `version`, `name`, `description`, `resources`, `types`, `catalogs`, `idPrefixes`.
   - Badges and addon names must remain cleanly formatted.
2. **Catalog Route (`/:token/catalog/:type/:id.json` & extra filters):**
   - Must return `{ metas: [...] }`. Each meta item must contain at least `id`, `type`, `name`, `poster`.
3. **Stream Route (`/:token/stream/:type/:id.json`):**
   - Must return `{ streams: [...] }`.
   - Streams contain `title` or `name`, and either `url` or `infoHash` (plus `fileIdx` if applicable).
4. **Subtitles Route (`/:token/subtitles/:type/:id.json`):**
   - Must return `{ subtitles: [...] }` with ISO language codes (`lang`), `id`, and `url`.

## Management & Local API Rules

1. **Localhost Edit Gate:**
   - Any mutative route (`POST`, `PUT`, `DELETE`) MUST use the `requireLocalEdit` middleware.
2. **Error Handling & Status Codes:**
   - `400 Bad Request`: Malformed parameters or invalid JSON.
   - `403 Forbidden`: Attempted remote modification via Cloudflare or external IP.
   - `429 Too Many Requests`: Rate-limited operations (e.g., manual monitor check cooldown).
   - `503 Service Unavailable`: Temporary upstream provider failure with clean error message.
3. **Response Headers:**
   - Management endpoints must include `Cache-Control: no-store`.
