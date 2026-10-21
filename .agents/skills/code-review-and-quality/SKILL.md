---
name: code-review-and-quality
description: >-
  Use this skill as a final quality gate before completing any task, opening a PR,
  or finalizing code changes in Stream Aggregator.
---

# Code Review & Quality Gates (Stream Aggregator)

This skill provides the final inspection checklist before any task is marked as complete.

## Mandatory Quality Gates Checklist

- [ ] **1. Automated Tests:**
  - Run `npm test`.
  - All 168+ tests pass with 0 failures (`fail: 0`).
  - Total test duration remains under 3 seconds.
- [ ] **2. ES Modules & Import Hygiene:**
  - All local imports include explicit `.js` extensions (e.g., `import ... from './engine.js'`).
  - No legacy CommonJS `require()` or `module.exports` inside ES modules.
- [ ] **3. Security & Boundary Checks:**
  - No secrets, tokens, or private paths hardcoded or committed.
  - New mutative routes implement `requireLocalEdit`.
  - Sensitive files in `data/` retain `0600` permissions.
- [ ] **4. Protocol & Performance Checks:**
  - Stremio v2 manifest and catalog/stream responses adhere to specification.
  - No blocking `await` inside parallel loops (use `Promise.allSettled` or timeouts).
- [ ] **5. Git Cleanliness:**
  - Run `git status` to verify only intended files were modified.
  - No untracked backup files or secrets staged.
