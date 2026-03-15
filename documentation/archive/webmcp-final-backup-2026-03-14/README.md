# WebMCP — AI Agent Tool Registration

> **Dev-only module.** Not included in production builds.

## What is this?

WebMCP exposes structured tools that AI agents (via Chrome 146+ browser extension) can discover and call to test the app. Instead of fragile DOM scraping, agents call functions like `dev_login_teacher()` or `navigate_to_page({ path: '/teacher/homework' })`.

## Structure

```
src/webmcp/
├── index.ts              ← Bootstrap (initWebMCP)
├── registry.ts           ← Tool lifecycle manager
├── types.ts              ← TypeScript definitions
├── useWebMCP.ts          ← React hook for context sync
├── README.md             ← This file
└── tools/
    ├── auth.tools.ts     ← Login/logout/user inspection
    ├── navigation.tools.ts ← Route navigation
    ├── state.tools.ts    ← Page state introspection
    └── {feature}.tools.ts ← Add new feature tools here
```

## Adding Tools for a New Feature

1. Create `src/webmcp/tools/{feature-name}.tools.ts`
2. Export a `ToolRegistration[]` array
3. Import and register in `src/webmcp/index.ts` → `initWebMCP()`
4. If tools are route-specific, set `activeRoutes` in the registration

See `.gemini/antigravity/skills/webmcp-enforcement/SKILL.md` for the full checklist and naming conventions.

## Setup (for testers)

1. Use **Chrome 146+** (Dev or Canary)
2. Enable: `chrome://flags/#enable-webmcp-testing`
3. Install: [Model Context Tool Inspector Extension](https://chromewebstore.google.com/detail/model-context-tool-inspec/gbpdfapgefenggkahomfgkhfehlcenpd)
4. Open localhost:5173 — tools appear in the extension sidebar

## How It Works

```
App starts (dev) → initWebMCP() → registers core tools
Route changes → useWebMCP hook → updateContext(pathname, role)
                                 ↓
                     Registry activates/deactivates tools
                     based on route patterns & user role
                                 ↓
                     navigator.modelContext.provideContext({ tools })
                                 ↓
                     Chrome extension sees updated tool list
```
