---
title: WebMCP Architecture
createdAt: '2026-02-27T17:18:17.937Z'
updatedAt: '2026-02-27T17:18:25.217Z'
description: >-
  Dev-only AI agent tool system: Chrome 146+ navigator.modelContext, tool
  registry, auth/nav/state tools, route-aware activation.
tags:
  - architecture
  - webmcp
  - ai-agent
  - chrome
  - dev-tools
---
# WebMCP Architecture

## Overview

WebMCP is a **dev-only** module that exposes structured tools to AI agents via the Chrome 146+ `navigator.modelContext` API. Instead of DOM scraping, agents call typed functions like `dev_login_teacher()` or `navigate_to_page({ path: '/teacher/homework' })`. Not included in production builds.

## What is WebMCP?

WebMCP is a proposed web standard (Chrome 146+) that provides a protocol for AI agents to interact with web apps through structured tools:
- **Imperative API:** `navigator.modelContext.registerTool()` — register JS functions as tools
- **Declarative API:** HTML form annotations (`toolname`, `tooldescription` attributes)
- **Discovery:** Chrome extension inspects registered tools

Our implementation uses the **Imperative API** to register tools that let AI agents test the app.

## Architecture

```
┌──────────────────────────────────────────────────────────┐
│                    App Startup (Dev)                       │
│  main.jsx → initWebMCP() → registers core tools           │
├──────────────────────────────────────────────────────────┤
│                    Route Changes                          │
│  App.jsx → useWebMCP(userRole) → updateContext()          │
│  → Registry activates/deactivates tools by route & role   │
├──────────────────────────────────────────────────────────┤
│                    Tool Registry                          │
│  registry.ts — Manages tool lifecycle                     │
│  ├── registerAll(tools)                                   │
│  ├── updateContext(pathname, role)                         │
│  └── provideContext → navigator.modelContext API          │
├──────────────────────────────────────────────────────────┤
│                    Registered Tools                       │
│  tools/auth.tools.ts        — Login, logout, user info   │
│  tools/navigation.tools.ts  — Route navigation            │
│  tools/state.tools.ts       — Page state, console errors  │
├──────────────────────────────────────────────────────────┤
│                    Chrome Extension                        │
│  Model Context Tool Inspector                              │
│  → Lists tools, manual execution, Gemini agent chat       │
└──────────────────────────────────────────────────────────┘
```

## File Structure

```
src/webmcp/
├── index.ts              — Bootstrap (initWebMCP, updateWebMCPContext)
├── registry.ts           — Tool lifecycle manager (register, activate, deactivate)
├── types.ts              — TypeScript: WebMCPTool, ToolRegistration, ToolCategory
├── useWebMCP.ts          — React hook (syncs context on route/role change)
├── README.md             — Developer guide
└── tools/
    ├── auth.tools.ts     — dev_login_teacher, dev_login_student, logout, get_user
    ├── navigation.tools.ts — navigate_to_page, get_current_route, list_routes
    └── state.tools.ts    — get_page_state, check_console_errors, get_firebase_data
```

## Registered Tools

### Auth Tools (`auth.tools.ts`)
| Tool | Description |
|------|-------------|
| `dev_login_teacher` | One-click login as dev teacher account |
| `dev_login_student` | One-click login as dev student account |
| `logout` | Sign out current user |
| `get_current_user` | Get current auth state and profile |

### Navigation Tools (`navigation.tools.ts`)
| Tool | Description |
|------|-------------|
| `navigate_to_page` | Navigate to any route by path |
| `get_current_route` | Get current pathname and params |
| `list_available_routes` | List all registered routes |

### State Tools (`state.tools.ts`)
| Tool | Description |
|------|-------------|
| `get_page_state` | Introspect current page (DOM, components) |
| `check_console_errors` | Get captured console.error logs |
| `get_firebase_data` | Read RTDB paths for debugging |

## Key Implementation Details

### Dev-Only Guard
All WebMCP code is behind `import.meta.env.DEV`:
```typescript
if (!import.meta.env.DEV) return; // No-op in production
```
Dynamic imports prevent WebMCP from being bundled in production builds.

### Route-Aware Tools
Tools can be activated/deactivated based on current route:
```typescript
{
  name: 'some_feature_tool',
  activeRoutes: ['/teacher/homework*', '/teacher/classes*'],
  requiredRole: 'teacher',
  execute: (args) => { ... }
}
```

### Console Error Capture
`setupErrorCapture()` monkey-patches `console.error` and captures:
- `console.error()` calls (last 50)
- Unhandled `window.error` events
- Unhandled promise rejections
Available via `check_console_errors` tool.

### Browser Support Check
```typescript
registry.isSupported // true if navigator.modelContext exists
```
Tools are still registered internally even without browser support, for when the flag is enabled.

## Setup for Testing

1. **Chrome 146+** (Dev or Canary channel)
2. Enable: `chrome://flags/#enable-webmcp-testing`
3. Install: [Model Context Tool Inspector Extension](https://chromewebstore.google.com/detail/model-context-tool-inspec/gbpdfapgefenggkahomfgkhfehlcenpd)
4. Open `localhost:5173` — tools appear in extension sidebar

## Adding New Tools

1. Create `src/webmcp/tools/{feature}.tools.ts`
2. Export `ToolRegistration[]` array
3. Import and register in `index.ts` → `initWebMCP()`
4. If route-specific, set `activeRoutes` in registration
5. See skill: `webmcp-enforcement` for full checklist

## WebMCP vs Server-Side MCP

| Aspect | WebMCP | MCP (Model Context Protocol) |
|--------|--------|------------------------------|
| Runs in | Browser (client-side) | Server-side |
| Protocol | `navigator.modelContext` API | JSON-RPC over stdio/SSE |
| Requires | Chrome 146+ with flag | Any MCP-compatible client |
| Use case | In-browser AI agent interaction | AI tool connectivity |
| Status | Proposed web standard (early preview) | Established standard |

## Related Docs
- @doc/architecture/routing-navigation — Route map (tools navigate these)
- @doc/architecture/auth-rbac-architecture — Auth system (tools interact with)
- @doc/conventions — WebMCP enforcement rule
