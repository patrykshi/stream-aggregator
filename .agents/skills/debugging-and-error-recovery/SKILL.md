---
name: debugging-and-error-recovery
description: >-
  Use this skill when investigating failing tests, slow scrapers, addon timeouts,
  cache inconsistencies, or unexpected runtime errors in Stream Aggregator.
---

# Debugging & Error Recovery (Stream Aggregator)

This skill encodes systematic root-cause analysis (RCA) and error-recovery techniques for the Stream Aggregator architecture.

## Common Failure Modes & Diagnostics

1. **Addon Timeout or Slowness:**
   - Manifest availability does NOT imply stream availability.
   - Inspect timeout settings in [`src/aggregator/engine.js`](file:///home/patryk-rocha/Projetos/stream-aggregator/src/aggregator/engine.js) (default 3s to 30s per provider).
   - Verify that slow providers do not block healthy ones; aggregation must always execute concurrently.
2. **Auto-Suspension Behavior:**
   - If a provider manifest fails, the monitor temporarily suspends it without writing `enabled: false` to the user profile.
   - Check [`src/aggregator/monitor.js`](file:///home/patryk-rocha/Projetos/stream-aggregator/src/aggregator/monitor.js) to confirm auto-recovery when the upstream manifest recovers.
3. **Cache Inconsistencies:**
   - Memory stream cache has a 25s TTL.
   - Catalog bridge cache resides in `data/hub-catalog-cache.json`.
   - Use `invalidatePublication()` or `invalidateBridgeCache()` when configurations update.
4. **Local Edit Blocked (HTTP 403):**
   - Verify if request originates from `127.0.0.1` or `localhost`.
   - If accessed via Cloudflare Tunnel, check whether `cf-connecting-ip` is present. Cloudflare ingress is strictly read-only by design.

## Verification Checklist

- Run individual test files with Node.js:
  ```bash
  node --test test/<failing-test>.test.js
  ```
- Run full suite:
  ```bash
  npm test
  ```
