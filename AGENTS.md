

## Integration Safety Rules (24 rules - ZERO BYPASS)

When your action matches a trigger below, pause editing and read every
applicable linked instruction before continuing. Do NOT load unrelated files;
this pause is an instruction lookup, not a request for user confirmation.

For multi-topic rule files, read the relevant sections and their required
dependencies. Preserve every applicable safeguard without loading unrelated workflows.

## Pre-launch Evolution

This repository has no production users or production data. Revisit this policy before the first production deployment.

- Optimize for the smallest coherent design that represents the product today.
- Remove obsolete code, schemas, APIs, configuration, aliases, and transitional paths directly.
- Do not add backward-compatibility shims, legacy aliases, dual-read or dual-write paths, or data-preserving backfills unless the user explicitly asks for them.
- Internal interfaces are not public compatibility contracts. Update their callers and tests atomically when they change.
- Development and test data are disposable. Prefer recreating those databases over complicating the product to preserve local data.
- Treat migration history as a replaceable development baseline, but keep the checked-in migration chain and setup workflow coherent. Do not rewrite an already-applied migration without also resetting affected development and test databases.
- Preserve database invariants, transactional safety, migration idempotence, and deterministic setup. These are correctness properties, not backward-compatibility requirements.
- Consolidate the migration baseline only as an explicit, coordinated change rather than as incidental work in a feature branch.

## Live State Before Claims (MANDATORY)

Before claiming repo state, task completion, blocker resolution, test proof, browser behavior, staging, commit readiness, or handoff readiness, inspect the current live source of truth: relevant files, current diff/status, task docs, and runtime behavior when the claim depends on product behavior.

Do not rely only on memory, pasted summaries, old handoffs, old findings, prior reviewer PASS, taskboxes, or green unit tests. For user-facing UI, routing, auth, upload, assignment, student/teacher workflow, notifications, results, or browser-only behavior, verify the real browser flow unless explicitly scoped out or blocked by environment.

If source, tests, browser behavior, task docs, findings, traceability, or handoff state disagree, report the disagreement instead of normalizing it away.

## Design Gate (MANDATORY)

Before any UI or UX work, read [`documentation/architecture/ui-design-standards.md`](documentation/architecture/ui-design-standards.md) plus the matching rule-linked architecture doc for the surface being edited. If root [`DESIGN.md`](DESIGN.md) exists, read it first; if it is absent, do not block on it.

## Teacher Header Shell Boundary (MANDATORY)

For teacher pages, `TeacherHeader` owns shared header design and must stay attached to the top page/shell edge. Put page padding, max-width, and content spacing inside `main` or a content wrapper, never around `TeacherHeader`.

## User Action Announcements (MANDATORY)

Before adding or modifying user-facing create, save, update, publish, assign, enroll, restore, archive, remove, or delete announcements, read [`rules/announcements.md`](documentation/rules/announcements.md). These outcomes must use the shared announcement system: bottom-right rectangular notifications that slowly fade/disappear after a readable duration, with `role="status"` for success/info/warning and `role="alert"` for failures. Do not add one-off page banners, `alert()`, or silent success states for these workflows. This applies across tests, homework, Reading V2 masters/passages, students, courses/classes, books, and future material types.

## Temporary PRD / Task-List Process And Closure Gate (MANDATORY)

Read [`rules/temporary-prd0055-authority-sync-closure-lessons.md`](documentation/rules/temporary-prd0055-authority-sync-closure-lessons.md) for packet/taskbox/findings/traceability reconciliation, exact-path staging, remote-state proof, or formal milestone/packet closure (including its commit or handoff).
Ordinary implementation, review, or correction does not trigger this bridge unless it includes one of those operations.

Temporary bridge: remove after Codex memory index contains `prd0055-authority-sync-closure-lessons` / `authority-sync`.

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

When your action matches a trigger below, pause editing and read every
applicable linked instruction before continuing. Do NOT load unrelated files;
this pause is an instruction lookup, not a request for user confirmation.

| When you are... | READ this file |
|----------------|----------------|
| Writing `navigate()`, `<Link>`, redirect URLs, or notification links | [`rules/navigation.md`](documentation/rules/navigation.md) |
| Writing `useEffect` with `setInterval`/`setTimeout` + state deps | [`rules/react-patterns.md`](documentation/rules/react-patterns.md) |
| Creating state initialized as `'pending'` or `'loading'` | [`rules/react-patterns.md`](documentation/rules/react-patterns.md) |
| Creating a new component for use in another page | [`rules/react-patterns.md`](documentation/rules/react-patterns.md) |
| Before `git pull`, `git fetch + merge`, or sync operations | [`rules/infrastructure.md`](documentation/rules/infrastructure.md) |
| Adding new RTDB node or Firestore collection | [`rules/infrastructure.md`](documentation/rules/infrastructure.md) |
| Adding or modifying Firebase RTDB rules, nested write restrictions, or protected descendants under an allowed ancestor path | [`rules/infrastructure.md`](documentation/rules/infrastructure.md) |
| Adding or modifying Reading V2 audit events, audit service, audit path, or audit rules | [`architecture/reading-v2-audit-trail.md`](documentation/architecture/reading-v2-audit-trail.md) |
| Changing Reading V2 runtime host integration with anti-cheat, trusted submit, AI feedback payloads, or admin monitoring | [`architecture/reading-v2-runtime-integrations.md`](documentation/architecture/reading-v2-runtime-integrations.md) |
| Writing a service that writes to DB on data events | [`rules/infrastructure.md`](documentation/rules/infrastructure.md) |
| Building, testing, deploying, dry-running, or debugging Cloudflare Workers, Wrangler, workerd, R2 uploads, signed URLs, Worker bindings, or backup Workers | [`rules/infrastructure.md`](documentation/rules/infrastructure.md) |
| PRD says "replace ALL", "every", or "replaces existing" | [`rules/codebase-hygiene.md`](documentation/rules/codebase-hygiene.md) |
| Writing an `@mantine/*` import or touching UI code that already imports `@mantine/*` - `@mantine/*` is **banned** and encountered usage must be replaced | [`rules/codebase-hygiene.md`](documentation/rules/codebase-hygiene.md#rule-15--no-mantine-import-ban-and-encountered-use-replacement) |
| Writing data to a path where existing code reads | [`rules/codebase-hygiene.md`](documentation/rules/codebase-hygiene.md) |
| Changing teacher shell, Teacher Lobby, teacher result/history/detail pages, or teacher UI that still uses Mantine | [`architecture/ui-design-standards.md`](documentation/architecture/ui-design-standards.md) |
| Changing `TeacherHeader` placement or teacher page shell spacing | [`architecture/teacher-lobby-authoring-and-navigation.md`](documentation/architecture/teacher-lobby-authoring-and-navigation.md) |
| Creating a new page component or route | [`rules/observability.md`](documentation/rules/observability.md) |
| Adding or modifying user-facing actions (buttons, forms, workflows) | [`rules/observability.md`](documentation/rules/observability.md) |
| Adding or modifying create/save/update/publish/assign/enroll/restore/archive/remove/delete announcements | [`rules/announcements.md`](documentation/rules/announcements.md) |
| Reporting test, build, emulator, Worker, or verification failure as product behavior | [`rules/infrastructure.md`](documentation/rules/infrastructure.md) |
| Making deployed/current-state claims for Firebase, Hosting, Cloudflare Workers, Wrangler, R2, or remote data | [`rules/infrastructure.md`](documentation/rules/infrastructure.md) |
| Packet/taskbox/findings/traceability reconciliation, exact-path staging, remote-state proof, or formal milestone/packet closure (including its commit or handoff) | [`rules/temporary-prd0055-authority-sync-closure-lessons.md`](documentation/rules/temporary-prd0055-authority-sync-closure-lessons.md) |
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

## Repo Skills

- Observability/page-action work: load `.agent/skills/observability-tracking/SKILL.md` so feature registry and tracking stay synchronized.
- Google Cloud, Gemini, Vertex AI, API key, service enablement, or MCP auth troubleshooting: load `.agent/skills/google-cloud-cli-first/SKILL.md` and keep the mirrored `.agents/skills/google-cloud-cli-first/SKILL.md` synchronized.
