---
name: spec-driven-development
description: >-
  Use this skill when defining specifications, requirements, architecture boundaries,
  or designing new features for the Stream Aggregator before implementing code.
---

# Spec-Driven Development (Stream Aggregator)

This skill encodes the specification-first methodology adapted from Addy Osmani's agent skills. In the Stream Aggregator project, writing code without a clear specification risks breaking the Stremio v2 protocol, exposing private provider tokens, or introducing regressions into the 168+ test suite.

## Core Rules

1. **Never write code before clarifying the spec:**
   - Define exact request/response schemas for Stremio endpoints (`/manifest.json`, `/catalog/...`, `/stream/...`, `/meta/...`).
   - Identify whether an endpoint is **public playback/read-only** or **local management** requiring `requireLocalEdit`.
   - Specify if `data/*.json` files are touched and how state persistence is handled.
2. **Identify Invariants & Constraints:**
   - Verify that external scraper timeouts remain non-blocking.
   - Check if any new configuration key requires codec support (`src/config/codec.js`).
   - Confirm that no sensitive keys or tokens are added to public manifest or URL outputs.
3. **Draft the Implementation Plan:**
   - List files to be created or modified.
   - Specify the corresponding test file to be created in `test/*.test.js`.
   - Present the specification summary to the user or team before writing code.
