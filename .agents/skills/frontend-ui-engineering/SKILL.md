---
name: frontend-ui-engineering
description: >-
  Use this skill when developing, refactoring, or optimizing the frontend dashboard UI,
  Dark Mode CSS, or interactive Vanilla JS components in Stream Aggregator.
---

# Frontend UI Engineering (Stream Aggregator)

This skill provides design patterns and implementation guidelines for the Stream Aggregator web interface.

## Architecture & Principles

1. **Vanilla JavaScript (Zero Build Pipeline):**
   - The frontend uses native ES6+ JavaScript served directly from `public/`.
   - Never add bundlers (Webpack, Vite, Rollup) or heavy frontend frameworks (React, Vue, Svelte) to the project.
2. **Directory Structure:**
   - [`public/index.html`](file:///home/patryk-rocha/Projetos/stream-aggregator/public/index.html): Semantic HTML structure.
   - [`public/styles.css`](file:///home/patryk-rocha/Projetos/stream-aggregator/public/styles.css): Dark Mode theme, CSS variables, responsive grid/flexbox layouts.
   - [`public/app.js`](file:///home/patryk-rocha/Projetos/stream-aggregator/public/app.js): Application lifecycle, state sync, and event handlers.
   - [`public/ui-selects.js`](file:///home/patryk-rocha/Projetos/stream-aggregator/public/ui-selects.js): Custom dropdowns and provider icon selectors.
   - [`public/collection-links.js`](file:///home/patryk-rocha/Projetos/stream-aggregator/public/collection-links.js): Reorderable catalog collections and drag-and-drop.
   - [`public/nuvio-preview.js`](file:///home/patryk-rocha/Projetos/stream-aggregator/public/nuvio-preview.js): Interactive catalog preview modal.
3. **Security & XSS Prevention:**
   - Always sanitize or escape user-provided strings before inserting into the DOM.
   - Prefer `textContent` or `document.createElement()` over unsanitized `innerHTML`.
4. **Responsive & Accessible Design:**
   - Maintain full responsiveness across desktop, tablet, and mobile browsers.
   - Preserve keyboard navigation and visual focus indicators for interactive controls.
