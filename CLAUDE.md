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

## 🔴 Integration Safety Rules (ZERO BYPASS — Enforced 2026-02-22, Updated 2026-02-27)

16 rules from real production bugs. **When you hit a trigger condition, STOP and read the full rule before writing code:**

| # | When you are... | Rule | Full details → READ before coding |
|---|---|---|---|
| 1 | Writing any `navigate()`, link, or redirect URL | Route Registry Validation | [`integration-safety-rules.md#rule-1`](./documentation/integration-safety-rules.md#rule-1) |
| 2 | Navigating to `/student-test/*` or `/student-wait/*` | Session Entry Handshake | [`integration-safety-rules.md#rule-2`](./documentation/integration-safety-rules.md#rule-2) |
| 3 | Writing a new nav/notif handler or session entry point | Pattern-First Research | [`integration-safety-rules.md#rule-3`](./documentation/integration-safety-rules.md#rule-3) |
| 4 | Causing layout shift during a dnd-kit drag | Force Re-measurement | [`integration-safety-rules.md#rule-4`](./documentation/integration-safety-rules.md#rule-4) |
| 5 | Adding custom pointer handlers on dnd-kit draggables | No setPointerCapture | [`integration-safety-rules.md#rule-5`](./documentation/integration-safety-rules.md#rule-5) |
| 6 | Writing `useEffect` with `setInterval` + state in deps | Hot Values → Refs | [`integration-safety-rules.md#rule-6`](./documentation/integration-safety-rules.md#rule-6) |
| 7 | Creating state initialized as `'pending'` or `'loading'` | Guaranteed Resolution | [`integration-safety-rules.md#rule-7`](./documentation/integration-safety-rules.md#rule-7) |
| 8 | Creating a new component for use in another page | Verify Integration E2E | [`integration-safety-rules.md#rule-8`](./documentation/integration-safety-rules.md#rule-8) |
| 9 | PRD/task says "replace ALL" or "every" | Grep Audit | [`integration-safety-rules.md#rule-9`](./documentation/integration-safety-rules.md#rule-9) |
| 10 | Before any `git pull`, `git fetch`, or sync operation | Git Sync Safety Protocol | [`integration-safety-rules.md#rule-10`](./documentation/integration-safety-rules.md#rule-10) |
| 11 | Creating a service that writes to RTDB/Firestore as a side effect | Restore Guard Middleware | [`integration-safety-rules.md#rule-11`](./documentation/integration-safety-rules.md#rule-11) |
| 12 | Adding a new RTDB node or Firestore collection | Backup Coverage Check | [`integration-safety-rules.md#rule-12`](./documentation/integration-safety-rules.md#rule-12) |
| 13 | Building serverless function (CF Workers, Lambda) with heavy workloads | Client-Driven Multi-Step | [`integration-safety-rules.md#rule-13`](./documentation/integration-safety-rules.md#rule-13) |
| 14 | Using an ID shared between creator and consumer (client, DB, webhook) | Never Regenerate Shared IDs | [`integration-safety-rules.md#rule-14`](./documentation/integration-safety-rules.md#rule-14) |
| 15 | Writing ANY `import` statement or `npm install` | No Mantine — Absolute Import Ban | [`integration-safety-rules.md#rule-15`](./documentation/integration-safety-rules.md#rule-15) |
| 16 | Creating ANY new user-facing feature (page, modal, form, action) | WebMCP Tool Registration | [`integration-safety-rules.md#rule-16`](./documentation/integration-safety-rules.md#rule-16) |

<!-- KNOWNS GUIDELINES START -->
# Knowns Guidelines

> These rules are NON-NEGOTIABLE. Violating them causes data corruption.

## Session Init (Required)

```json
mcp__knowns__detect_projects({})
mcp__knowns__set_project({ "projectRoot": "/path/to/project" })
```

**Skip this = tools fail or work on wrong project.**

---

## Critical Rules

| Rule | Description |
|------|-------------|
| **Never edit .md** | Use MCP tools (preferred) or CLI. NEVER edit task/doc files directly |
| **Docs first** | Read project docs BEFORE planning or coding |
| **Plan → Approve → Code** | Share plan, WAIT for approval, then implement |
| **AC after work** | Only check acceptance criteria AFTER completing work |
| **Time tracking** | `start_time` when taking task, `stop_time` when done |
| **Validate** | Run `validate` before marking task done |
| **appendNotes** | Use `appendNotes` for progress. `notes` REPLACES all (destroys history) |

---

## CLI Pitfalls

### The `-a` flag trap

| Command | `-a` means | NOT this |
|---------|------------|----------|
| `task create/edit` | `--assignee` | ~~acceptance criteria~~ |
| `doc edit` | `--append` | ~~assignee~~ |

```bash
# WRONG - sets assignee to garbage!
knowns task edit 35 -a "Criterion text"

# CORRECT
knowns task edit 35 --ac "Criterion text"
```

### --plain flag

**Only for view/list/search commands:**
```bash
knowns task <id> --plain      # ✓
knowns task list --plain      # ✓
knowns task create --plain    # ✗ ERROR
knowns task edit --plain      # ✗ ERROR
```

### Subtasks

```bash
knowns task create "Sub" --parent 48    # ✓ raw ID
knowns task create "Sub" --parent task-48  # ✗ WRONG
```

---

## References

Tasks and docs can reference each other:

| Type | Format |
|------|--------|
| Task | `@task-<id>` |
| Doc | `@doc/<path>` |
| Template | `@template/<name>` |

**Always follow refs recursively** before planning.

---

> **Full reference:** Run `knowns guidelines --plain` for complete documentation
<!-- KNOWNS GUIDELINES END -->
