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

Read `documentation/design/student-view-design-standard.md` before modifying
ANY student-facing page. It is the canonical v2 standard and supersedes older
dashboard/feed-era wording.

- Use the Academic Record-led editorial academic workspace language and v2
  tokens defined by the canonical document.
- Preserve the real 3-part shell, route semantics, interaction contracts, and
  structurally present right rail; keep mobile as a compressed presentation.
- Preserve the bans on `AppShell`, new `@mantine/*` imports, gradients,
  glassmorphism, decorative hover lift, and emoji navigation icons.
- Use `className="student-view-root"` on student page roots and follow the
  canonical mobile touch-target, overflow, drawer, and alignment contracts.

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
