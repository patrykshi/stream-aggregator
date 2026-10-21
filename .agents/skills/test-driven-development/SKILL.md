---
name: test-driven-development
description: >-
  Use this skill when authoring unit tests, fixing bugs, or implementing new features
  using the native Node.js test runner (node:test) in Stream Aggregator.
---

# Test-Driven Development (Stream Aggregator)

This skill provides testing guidelines and strict Red-Green-Refactor workflows for Stream Aggregator, adhering to the project's native `node:test` architecture.

## Testing Standards & Conventions

1. **Native Node.js Test Runner:**
   - Use built-in `node:test` and `node:assert/strict`:
     ```javascript
     import test, { describe, it } from 'node:test';
     import assert from 'node:assert/strict';
     ```
   - Do NOT install or import Jest, Mocha, Chai, or Vitest.
2. **Deterministic & Isolated (Zero Network Calls):**
   - Unit tests MUST NOT make live HTTP requests to external addons or public APIs (TMDB, Trakt, Torrentio, etc.).
   - Use mock responses or local memory stubs to simulate responses, errors, and timeouts.
3. **Execution Command:**
   ```bash
   npm test
   # Runs: node --test test/*.test.js
   ```
4. **Red-Green-Refactor Workflow:**
   - **Red:** Write a failing test in `test/<feature-name>.test.js` that accurately asserts the expected behavior.
   - **Green:** Implement the minimal code in `src/` to make the test pass.
   - **Refactor:** Clean up code, remove duplication, and optimize without breaking existing tests.
   - **Verify:** Run the full test suite to guarantee all 168+ tests pass with 0 failures.
