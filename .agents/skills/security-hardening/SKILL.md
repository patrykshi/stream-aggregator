---
name: security-hardening
description: >-
  Use this skill when auditing endpoints, verifying authentication/authorization boundaries,
  checking secret masking, or validating file permissions in Stream Aggregator.
---

# Security Hardening (Stream Aggregator)

This skill provides security review protocols and validation rules to protect user configurations, API credentials, and network boundaries.

## Critical Security Invariants

1. **Localhost Edit Enforcement:**
   - The `requireLocalEdit` middleware in [`src/server.js`](file:///home/patryk-rocha/Projetos/stream-aggregator/src/server.js) must be applied to all mutative endpoints (`POST`, `PUT`, `DELETE`).
   - Rejects any request carrying `cf-connecting-ip` (Cloudflare Tunnel) or non-loopback `Host`/`Origin`.
   - Never bypass or disable this check for convenience.
2. **Credential Masking & Zero Secret Leakage:**
   - TMDB API Keys / Session IDs, Trakt OAuth tokens / Client IDs, MDBList API keys, and ERDB tokens must NEVER be returned in public API payloads, manifests, or stream redirect URLs.
   - External provider URLs containing private tokens (e.g., Debrid keys) must have tokens stripped or obfuscated when generating public diagnostic reports.
3. **File System Permissions (`0600`):**
   - Files created in `data/` containing secrets (`hub-artwork-erdb.json`, `hub-source-accounts.json`, etc.) must be written with `mode: 0o600`.
4. **URL & Input Sanitization (SSRF Protection):**
   - All external addon URLs must be parsed through [`parseAddonUrl`](file:///home/patryk-rocha/Projetos/stream-aggregator/src/aggregator/url-helper.js).
   - Reject internal private IP ranges unless explicitly configured for local bridges.
5. **Git Hygiene:**
   - Verify `git status` before committing to ensure no files from `data/` or `cloudflared/credentials.json` are tracked.
