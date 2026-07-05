- always warn about the context remaining and before starting a new task make sure the left over context is enough for the task or not. if not, aske the user to use compact

## Conversation Log Safety Rules (CRITICAL)

**NEVER use `write_to_file` with `Overwrite: true` on conversation log files.**

Before writing to a conversation log file (`conversation_*.md`):
1. **ALWAYS check if the file exists first** using `view_file` or `list_dir`
2. **If file exists:** Use `replace_file_content` to APPEND new sections at the end
3. **If file does NOT exist:** Only then use `write_to_file` to create a new file
4. **Never assume** the file is new just because it's a new session - previous sessions may have written to the same day's log

**Why:** On 2026-01-27, the agent accidentally deleted 8 sections of work history by overwriting the existing log file, assuming it was a new file. This caused data loss that required user intervention to recover.

---

## Student View Design Standard (MANDATORY)

> **Read `documentation/design/student-view-design-standard.md` before modifying ANY student-facing page.**

### Enforced Rules (No Exceptions)

1. **NO purple gradients** — `#667eea`, `#764ba2`, `linear-gradient` are **BANNED** on student pages
2. **NO glassmorphism** — No `.glass`, `.glass-card`, `backdrop-filter` on cards/panels
3. **NO AppShell** — Student pages use custom 3-column HTML/CSS layout
4. **NO emoji icons** in navigation — Use inline SVG icons (24×24, `currentColor`)
5. **Flat gray background** — `#f3f4f6` page background, `body { background: #f3f4f6 !important; }`
6. **Inter font** — All student pages must load and use Inter from Google Fonts
7. **Pill-shaped buttons** — `border-radius: 999px` on all buttons
8. **Feed-style layout** — Twitter/X social feed paradigm for dashboard and activity views

### Color Tokens (Student Pages Only)
- Page bg: `#f3f4f6` | Surface: `#ffffff` | Hover: `#e5e7eb`
- Text: `#111827` (bold), `#374151` (body), `#6b7280` (muted), `#9ca3af` (dim)
- Accent: `#4f46e5` (primary), `#4338ca` (hover), `#6366f1` (badge)

### Reference Implementation
The canonical example is `src/pages/StudentDashboardPage.jsx`. All student pages must match its design language.

### Code-Level Enforcement (Cannot Be Bypassed)
- **CSS Override Layer:** `src/styles/student-view-override.css` imported globally in `index.css`
- **Root Class:** Every student page wrapper MUST use `className="student-view-root"`
- This class **automatically neutralizes** all `.glass`, `.gradient-bg`, and legacy styles via CSS specificity
- Even if old Mantine components are still used, the CSS override makes them visually flat

### Legacy Student Files
13 existing student files still use old patterns. They ALL have deprecation banners:
```
⚠️ STUDENT VIEW DESIGN STANDARD v1.0 — ACTIVE
🚫 DO NOT copy styles from this file.
✅ Reference: src/pages/StudentDashboardPage.jsx
```
**When editing these files:** Do NOT copy their styling patterns. Use the dashboard as reference.

### Before ANY Student Page Edit
1. Read `documentation/design/student-view-design-standard.md`
2. Check if the file uses banned patterns (purple, glass, AppShell)
3. If it does → migrate to the new standard as part of the edit
4. Ensure `className="student-view-root"` is on the root wrapper

---

## 🔴 Integration Safety Rules (22 rules — ZERO BYPASS)

When your action matches a trigger below, **STOP and READ the linked file** before writing code. Do NOT load all files — only the one that matches.

| When you are... | READ this file |
|----------------|----------------|
| Writing `navigate()`, `<Link>`, redirect URLs, or notification links | [`rules/navigation.md`](documentation/rules/navigation.md) |
| Writing `useEffect` with `setInterval`/`setTimeout` + state deps | [`rules/react-patterns.md`](documentation/rules/react-patterns.md) |
| Creating state initialized as `'pending'` or `'loading'` | [`rules/react-patterns.md`](documentation/rules/react-patterns.md) |
| Creating a new component for use in another page | [`rules/react-patterns.md`](documentation/rules/react-patterns.md) |
| Before `git pull`, `git fetch + merge`, or sync operations | [`rules/infrastructure.md`](documentation/rules/infrastructure.md) |
| Adding new RTDB node or Firestore collection | [`rules/infrastructure.md`](documentation/rules/infrastructure.md) |
| Writing a service that writes to DB on data events | [`rules/infrastructure.md`](documentation/rules/infrastructure.md) |
| Building or modifying Cloudflare Workers (R2, backup, etc.) | [`rules/infrastructure.md`](documentation/rules/infrastructure.md) |
| PRD says "replace ALL", "every", or "replaces existing" | [`rules/codebase-hygiene.md`](documentation/rules/codebase-hygiene.md) |
| Writing ANY `import` — `@mantine/*` is **banned** | [`rules/codebase-hygiene.md`](documentation/rules/codebase-hygiene.md) |
| Writing data to a path where existing code reads | [`rules/codebase-hygiene.md`](documentation/rules/codebase-hygiene.md) |
| Creating a new page component or route | [`rules/observability.md`](documentation/rules/observability.md) |
| Adding or modifying user-facing actions (buttons, forms, workflows) | [`rules/observability.md`](documentation/rules/observability.md) |
| Renaming, moving, or deleting a feature/page | [`rules/observability.md`](documentation/rules/observability.md) |
| Writing `localStorage`, `sessionStorage`, or `IndexedDB` | [`rules/mobile-portability.md`](documentation/rules/mobile-portability.md) |
| Writing hooks using `window.*`, `document.*`, `navigator.*` | [`rules/mobile-portability.md`](documentation/rules/mobile-portability.md) |
| Writing `dangerouslySetInnerHTML` | [`rules/mobile-portability.md`](documentation/rules/mobile-portability.md) |
| Writing `useNavigate()` from `react-router-dom` directly | [`rules/mobile-portability.md`](documentation/rules/mobile-portability.md) |
| Writing `window.innerWidth` or `window.matchMedia()` | [`rules/mobile-portability.md`](documentation/rules/mobile-portability.md) |

<!-- KNOWNS GUIDELINES START -->
# Knowns Guidelines

Knowns MCP and Knowns CLI are unavailable in this repo state.

Current rule:
- Edit relevant `.knowns/docs/**/*.md` and `.knowns/tasks/**/*.md` directly when an approved task requires Knowns updates.
- Do not edit generated `.knowns/.search/**` files.
- Do not edit `.knowns/versions/**` unless a later explicit tooling/registry task approves version-store maintenance.
- Preserve historical task/log text. Append current truth or add obsolescence notes instead of rewriting history.
- Validate with `rg`, scoped UTF-8 checks, and `git diff --check`.
- For observability/page-action work, still load `.agent/skills/observability-tracking/SKILL.md`.
<!-- KNOWNS GUIDELINES END -->
