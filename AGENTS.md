## Integration Safety Rules (23 rules - ZERO BYPASS)

When your action matches a trigger below, STOP and READ the linked file before writing code. Do NOT load all files - only the one that matches.

## Design Gate (MANDATORY)

Before any UI or UX work, read [`documentation/architecture/ui-design-standards.md`](documentation/architecture/ui-design-standards.md) plus the matching rule-linked architecture doc for the surface being edited. If root [`DESIGN.md`](DESIGN.md) exists, read it first; if it is absent, do not block on it.

## Teacher Header Shell Boundary (MANDATORY)

For teacher pages, `TeacherHeader` owns shared header design and must stay attached to the top page/shell edge. Put page padding, max-width, and content spacing inside `main` or a content wrapper, never around `TeacherHeader`.

## Dev Login Shortcuts (MANDATORY)

When testing authenticated teacher or student flows in this repo:
- Prefer the built-in dev quick-login buttons on the login page before asking for credentials.
- First click the subtle settings icon in the bottom-right corner of the login page to reveal the hidden dev quick-login buttons.
- Use the `Teacher` quick-login button for the teacher dev account (`teacher@test.com`).
- Use the `Student` quick-login button for the student dev account (`student@test.com`).
- Treat these buttons as the default path for browser verification unless the task explicitly requires manual credential entry or a different account.
- If the quick-login buttons fail, check app/runtime configuration first (for example Firebase API key referrer restrictions) before assuming the accounts are broken.

## Live Browser Testing URLs (MANDATORY)

When opening, probing, or reporting live browser QA URLs in this repo:
- Use `http://localhost:<port>`, never `http://127.0.0.1:<port>`.
- Use port `5173` for teacher flows.
- Use port `5174` for student flows.
- Keep browser sessions, dev-server commands, logs, and final reported URLs aligned with those role ports.

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
| Adding or modifying Reading V2 audit events, audit service, audit path, or audit rules | [`architecture/reading-v2-audit-trail.md`](documentation/architecture/reading-v2-audit-trail.md) |
| Changing Reading V2 runtime host integration with anti-cheat, trusted submit, AI feedback payloads, or admin monitoring | [`architecture/reading-v2-runtime-integrations.md`](documentation/architecture/reading-v2-runtime-integrations.md) |
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
