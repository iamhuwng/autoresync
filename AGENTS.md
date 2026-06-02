## Integration Safety Rules (23 rules - ZERO BYPASS)

When your action matches a trigger below, STOP and READ the linked file before writing code. Do NOT load all files - only the one that matches.

## Design Gate (MANDATORY)

Before any UI or UX work, read [`documentation/architecture/ui-design-standards.md`](documentation/architecture/ui-design-standards.md) plus the matching rule-linked architecture doc for the surface being edited. If root [`DESIGN.md`](DESIGN.md) exists, read it first; if it is absent, do not block on it.

## Teacher Header Shell Boundary (MANDATORY)

For teacher pages, `TeacherHeader` owns shared header design and must stay attached to the top page/shell edge. Put page padding, max-width, and content spacing inside `main` or a content wrapper, never around `TeacherHeader`.

## Test Command Execution On Windows (MANDATORY)

When the working directory is any Windows checkout/worktree of this `luyentap` repository, including temporary feature folders that will later merge into `origin/main`:
- Treat it as in scope if the repo root has this `AGENTS.md` plus luyentap app files such as `package.json`, `src/`, and `documentation/`.
- Treat sibling folders like `C:\Users\The Lord\Desktop\luyentap-*` as in scope when they are Git worktrees or branch checkouts of the same repo.

For `vitest`, `vite`, or `esbuild`:
- Do not first run these commands inside the sandbox.
- Start those commands with escalated execution on the first attempt.
- Prefer the command form `cmd /c npx vitest run ... --reporter=basic`.
- If using npm script form, prefer `cmd /c npm test -- --run --reporter=basic`.
- Do not retry after a sandbox `spawn EPERM`; start unrestricted instead.

## Text Encoding Guardrail (MANDATORY)

These rules are obligatory for file creation, conversion, and editing:
- All newly created or edited text files must be UTF-8.
- If a text file is legacy ANSI/Windows-1252, convert it to UTF-8 before further routine editing whenever practical.
- Prefer repo guardrails over ad hoc byte-safe editing: `.editorconfig`, `.gitattributes`, and `npm run check:utf8`.
- Use `npm run check:utf8:staged` for staged changes, `npm run check:utf8:all` for a broader repo scan, and `npm run check:utf8 -- <paths...>` for targeted verification.

## Dev Login Shortcuts (MANDATORY)

When testing authenticated teacher or student flows in this repo:
- Prefer the built-in dev quick-login buttons on the login page before asking for credentials.
- First click the subtle settings icon in the bottom-right corner of the login page to reveal the hidden dev quick-login buttons.
- Use the `Teacher` quick-login button for the teacher dev account (`teacher@test.com`).
- Use the `Student` quick-login button for the student dev account (`student@test.com`).
- Treat these buttons as the default path for browser verification unless the task explicitly requires manual credential entry or a different account.
- If the quick-login buttons fail, check app/runtime configuration first (for example Firebase API key referrer restrictions) before assuming the accounts are broken.

## Google Cloud CLI First (MANDATORY)

When the task involves Google Cloud, Gemini, Vertex AI, Google AI Studio, Google developer APIs, API keys, service enablement, project/account mismatch, IAM, or MCP authentication:
- Prefer `gcloud` as the first diagnostic surface before web research, console clicking, or speculative fixes.
- Start by checking active auth and project context with `gcloud auth list` and `gcloud config get-value project`.
- For API-key problems, inspect restrictions and targets with `gcloud services api-keys list`, `describe`, and `get-key-string` before assuming the key value itself is bad.
- For service availability problems, inspect enablement with `gcloud services list --enabled` before changing code or rotating secrets.
- Load `.agent/skills/google-cloud-cli-first/SKILL.md` and keep the mirrored `.agents/skills/google-cloud-cli-first/SKILL.md` in sync when this rule evolves.

### Universal Integration Safety Rules

When your action matches a trigger below, STOP and READ the linked file before writing code. Do NOT load all files - only the one that matches.

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
| Writing ANY `import` or touching UI code that already imports `@mantine/*` - `@mantine/*` is **banned** and encountered usage must be replaced | [`rules/codebase-hygiene.md`](documentation/rules/codebase-hygiene.md) |
| Writing data to a path where existing code reads | [`rules/codebase-hygiene.md`](documentation/rules/codebase-hygiene.md) |
| Changing teacher shell, Teacher Lobby, teacher result/history/detail pages, or teacher UI that still uses Mantine | [`architecture/ui-design-standards.md`](documentation/architecture/ui-design-standards.md) |
| Changing `TeacherHeader` placement or teacher page shell spacing | [`architecture/teacher-lobby-authoring-and-navigation.md`](documentation/architecture/teacher-lobby-authoring-and-navigation.md) |
| Creating a new page component or route | [`rules/observability.md`](documentation/rules/observability.md) |
| Adding or modifying user-facing actions (buttons, forms, workflows) | [`rules/observability.md`](documentation/rules/observability.md) |
| Renaming, moving, or deleting a feature/page | [`rules/observability.md`](documentation/rules/observability.md) |
| Writing `localStorage`, `sessionStorage`, or `IndexedDB` | [`rules/mobile-portability.md`](documentation/rules/mobile-portability.md) |
| Writing hooks using `window.*`, `document.*`, `navigator.*` | [`rules/mobile-portability.md`](documentation/rules/mobile-portability.md) |
| Writing `dangerouslySetInnerHTML` | [`rules/mobile-portability.md`](documentation/rules/mobile-portability.md) |
| Writing `useNavigate()` from `react-router-dom` directly | [`rules/mobile-portability.md`](documentation/rules/mobile-portability.md) |
| Writing `window.innerWidth` or `window.matchMedia()` | [`rules/mobile-portability.md`](documentation/rules/mobile-portability.md) |
| Changing student shell layout, routed shell composition, responsive headers, cards/lists, or right-rail structure | [`rules/student-mobile-design.md`](documentation/rules/student-mobile-design.md) |
| Changing student mobile tabs/filters, overlays, touch targets, overflow, or drawer behavior | [`rules/student-mobile-design.md`](documentation/rules/student-mobile-design.md) |
| Changing student shell pages, Academic Record, Library, Homework, Courses, Class Detail, or any student tab/list data-loading path | [`rules/student-data-loading.md`](documentation/rules/student-data-loading.md) |

---
