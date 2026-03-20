---
title: >-
  Session Extraction: Rules Refactoring, Mobile Portability & WebMCP Removal
  (2026-03-14)
createdAt: '2026-03-16T15:12:22.284Z'
updatedAt: '2026-03-16T15:13:43.844Z'
description: >-
  Events, features, implementations, lessons learned, patterns, and forward
  standards from the 2026-03-14 session covering rules system refactoring,
  mobile portability foundation, integration safety rules audit, and complete
  WebMCP feature removal.
tags:
  - extraction
  - rules
  - mobile-portability
  - webmcp
  - refactoring
  - lessons-learned
---
# Session Extraction: Rules Refactoring, Mobile Portability & WebMCP Removal (2026-03-14)

---

## 1. Events

### E1: Integration Safety Rules Audit
- **What:** Systematic review of all 17 original integration safety rules to assess continued relevance.
- **Method:** 5-criteria assessment for each rule: still relevant? architecturally solved? still triggerable? duplicated? actively used?
- **Result:** 12 rules kept, 2 narrowed, 3 removed from trigger tables (Rules 4, 5 moved to inline code comments; Rule 16 fully retired).

### E2: Rules System Architecture Refactoring
- **What:** Monolithic 776-line `integration-safety-rules.md` split into slim index + 5 category files.
- **Trigger:** Context bloat — AI agents loaded 776 lines on every rule trigger, wasting ~90% of tokens.
- **Result:** ~90% reduction in per-trigger context load. Each trigger now loads only 100-200 lines.

### E3: Mobile Portability Analysis & Foundation
- **What:** Full codebase audit for Android/iOS deployment readiness. 5 portability blockers identified.
- **Trigger:** User asked about making an Android version of the app.
- **Result:** 5 new mobile portability rules (Rules 18-22) and `src/core/platform/` abstraction layer created.

### E4: Complete WebMCP Feature Removal
- **What:** Full removal of the WebMCP browser AI tool registration system from every layer of the codebase.
- **Scope:** 12 code files (~112KB), entry point bootstrap, ESLint config, pre-commit enforcement, vite plugin, rules, skills, knowledge artifacts, task files, knowns docs.
- **Result:** Zero code references remaining in `src/`. Backup preserved at `documentation/archive/webmcp-final-backup-2026-03-14/`.

---

## 2. Features

### F1: Category-Based Rules System
- **Files:** `documentation/rules/{navigation,react-patterns,infrastructure,codebase-hygiene,mobile-portability}.md`
- **Design:** Each file is self-contained with full rule text, code examples, self-checks, and canonical references.
- **Index:** `documentation/integration-safety-rules.md` serves as a slim router (~50 lines) with a trigger table pointing to category files.
- **Trigger tables:** Updated in `AGENTS.md`, `GEMINI.md`, and `CLAUDE.md` to point to category files instead of monolithic index.

### F2: Platform Abstraction Layer
- **Files created:**
  - `src/core/platform/index.ts` — barrel export
  - `src/core/platform/storage.ts` — async storage abstraction (web: localStorage/sessionStorage wrapper)
  - `src/core/platform/hooks/useScreenSize.ts` — responsive breakpoint hook
  - `src/core/platform/hooks/useOnlineStatus.ts` — network status hook
  - `src/core/platform/hooks/useAppLifecycle.ts` — before-unload / background-foreground hook
  - `src/core/components/RichContent.tsx` — HTML rendering abstraction replacing `dangerouslySetInnerHTML`
- **Design principle:** All abstractions are async-first (anticipates React Native's AsyncStorage), with web implementations underneath.

### F3: Mobile Portability Rules (Rules 18-22)
- **Rule 18:** Storage Abstraction — no direct `localStorage`/`sessionStorage`/`IndexedDB`
- **Rule 19:** Platform Hook Abstraction — no direct `window.*`/`document.*`/`navigator.*` in feature hooks
- **Rule 20:** No Raw HTML Injection — use `<RichContent>` instead of `dangerouslySetInnerHTML`
- **Rule 21:** Navigation Service Only — use `useNavigation` hook, not direct `useNavigate()` from react-router-dom
- **Rule 22:** Responsive via Hook — use `useScreenSize` hook, not `window.innerWidth` or `window.matchMedia()`

---

## 3. Implementations

### I1: Pre-commit Script Cleanup
- **File:** `scripts/pre-commit-enforcement.js`
- **Removed:** `isComponentOrPage()` function, `hasWebMCPTools()` function, entire Rule 16 enforcement block (20+ lines of dead code that checked for `src/webmcp/tools/` existence).
- **Kept:** Rule 15 (Mantine import ban) enforcement — still active and enforcing.

### I2: Vite Plugin Cleanup
- **File:** `scripts/vite-rule-enforcement.js`
- **Removed:** Comment referencing WebMCP module initialization.
- **Kept:** Rule 15 console warning injection — still active.

### I3: Knowns Doc Cleanup
- **File:** `.knowns/docs/integration-safety-rules.md`
- **Removed:** Full 65-line Rule 16 section (trigger, code examples, checklist).
- **Removed:** Rules 4 and 5 from Quick Reference Card (retired earlier).
- **Added:** 3-line retirement notice for Rule 16 with backup path.

### I4: Knowledge Artifact Cleanup
- **File:** `ai-workspace-sync/gemini/antigravity/knowledge/project_governance_and_enforcement/artifacts/pre_commit_enforcement.md`
- **Updated:** Rule 16 section → RETIRED notice with date.

### I5: Task File Updates
- **File:** `documentation/tasks/0033-prd-teacher-lobby-refactor.md` — WebMCP section → RETIRED notice.
- **File:** `documentation/tasks/tasks-0030-prd-ielts-writing-test-system.md` — WebMCP task → strikethrough with RETIRED note.

---

## 4. Lessons Learned from Trials and Failures

### L1: Feature Removal Requires Multi-Layer Sweep
- **Lesson:** Removing a feature from code (`src/`) is only ~40% of the work. The feature also lives in:
  - Pre-commit enforcement scripts (dead enforcement code)
  - Vite plugin comments/logic
  - Integration safety rules docs (full rule text with code examples)
  - Knowns docs (orphaned docs not even in MCP registry)
  - Knowledge artifacts in AI workspace sync
  - Task files from PRDs that implemented the feature
  - Agent rules files (AGENTS.md, GEMINI.md, CLAUDE.md trigger tables)
- **Pattern:** Use grep across ALL file types, not just `.ts/.tsx/.jsx/.js`. Include `.md`, `.json`, `.mjs`, `.cjs`.
- **Anti-pattern:** Declaring "removal complete" after deleting the directory. Must verify all layers.

### L2: Orphaned Knowns Docs Can Persist Undetected
- **What happened:** `.knowns/docs/integration-safety-rules.md` existed as a 662-line file with full WebMCP rule content, but was NOT listed by `mcp_knowns_list_docs`. It was invisible to the MCP tooling.
- **Root cause:** The doc wasn't registered through the Knowns MCP system — it was a raw `.md` file placed directly in the docs folder.
- **Impact:** Could have been loaded by future agents as authoritative guidance, telling them to create WebMCP tools for new features.
- **Fix:** Manual edit since MCP tools couldn't find/manage it.

### L3: Rules Audit Must Consider "Ignored in Practice" as a Signal
- **What happened:** Rule 16 (WebMCP registration) was supposed to fire on EVERY new user-facing feature, but during the massive PRD-0034 homework overhaul (173 files, 24.5K+ lines), zero WebMCP tools were added for the homework feature initially. The rule was being routinely ignored.
- **Lesson:** If a rule is consistently not followed during major feature work, it's either: (a) not valuable, (b) not visible enough, or (c) the enforcement mechanism is too weak. In this case, it was (a) — the feature (WebMCP) itself was experimental and not providing value.
- **Pattern:** During rules audits, check "was this rule actually followed in the last 3 PRD implementations?" If not, it's a removal candidate.

### L4: Context Bloat Has Compounding Costs
- **What happened:** Every time any AI agent hit any integration safety rule trigger, it loaded 776 lines of rules. With 17+ trigger conditions, this happened frequently — sometimes multiple times per task.
- **Impact:** Token waste, slower responses, increased risk of context window overflow during long coding sessions.
- **Solution:** Category-based splitting with on-demand loading. Only the relevant ~120 lines are loaded per trigger.
- **Principle:** Rules systems should scale logarithmically with rule count, not linearly. Each new rule should not increase the cost of triggering existing rules.

### L5: Backup Before Delete + Verify After Delete
- **What happened:** WebMCP backup was created at `documentation/archive/webmcp-final-backup-2026-03-14/` before deletion. After deletion, systematic grep confirmed zero remaining code references.
- **Lesson:** Always have both a parachute (backup) and a confirmation (grep sweep). The backup exists for "oops we needed that" scenarios; the grep exists for "we missed a spot" scenarios.

---

## 5. Logic / Decision Rationale

### D1: Why Category Files Instead of Tags/Metadata
- **Considered:** Using frontmatter tags or metadata to filter rules dynamically.
- **Rejected because:** AI agents read files, not databases. Category files are the simplest "load only what's needed" mechanism that works with file-reading tools.

### D2: Why Keep Rule 13 (Serverless) Despite No Current Serverless Code
- **Decision:** Removed from always-loaded trigger tables, but kept in `infrastructure.md` as reference.
- **Rationale:** The project is planning mobile deployment which may introduce serverless backends. The knowledge is valuable as reference, just not as an always-loaded rule.

### D3: Why Async-First Storage Abstraction
- **Decision:** `storage.get()` returns `Promise<T>` even though web's `localStorage` is synchronous.
- **Rationale:** React Native's `AsyncStorage` is async. Making the interface async now means zero signature changes when swapping to mobile. The `await` cost on web is negligible.

### D4: Why Historical References to WebMCP Were Left Untouched
- **Decision:** Conversation logs, AI brain artifacts, and version history files referencing WebMCP were intentionally NOT modified.
- **Rationale:** These are historical records. Modifying them would falsify the project history and could break version tracking in Knowns.

---

## 6. Patterns

### P1: Multi-Layer Feature Removal Checklist
```
When removing a feature completely:
1. □ Delete implementation files (src/)
2. □ Remove imports/bootstrap from entry points (main.jsx, App.jsx)
3. □ Remove from build config (eslint, vite plugins, tsconfig)
4. □ Remove from enforcement scripts (pre-commit, CI)
5. □ Remove from integration safety rules (all docs + index)
6. □ Remove from agent rule files (AGENTS.md, GEMINI.md, CLAUDE.md)
7. □ Remove from AI skills/knowledge artifacts
8. □ Update PRD task files that referenced the feature
9. □ Remove from Knowns docs (check for orphaned files)
10. □ Grep ALL file types for any remaining references
11. □ Verify backup exists before any deletion
12. □ Build/compile to verify clean removal
```

### P2: On-Demand Rules Loading Pattern
```
Problem: Monolithic rules file loaded entirely on every trigger → token waste.
Solution: Slim index + category files, loaded per-trigger.

Structure:
  integration-safety-rules.md  ← Index (trigger table → category links)
  rules/
    navigation.md              ← Rules 1, 2, 3
    react-patterns.md          ← Rules 6, 7, 8
    infrastructure.md          ← Rules 10, 11, 12, 13, 14
    codebase-hygiene.md        ← Rules 9, 15, 17
    mobile-portability.md      ← Rules 18-22

Agent reads trigger table (13 lines) → matches rule → loads ONLY the relevant category file.
```

### P3: Platform Abstraction Layer Pattern
```
Problem: Web-only APIs scattered across 100+ files block mobile deployment.
Solution: Thin abstraction layer with web implementations, swappable for mobile.

Structure:
  src/core/platform/
    storage.ts                 ← localStorage/sessionStorage → async abstraction
    hooks/
      useScreenSize.ts         ← window.innerWidth → hook
      useOnlineStatus.ts       ← navigator.onLine → hook
      useAppLifecycle.ts       ← beforeunload → hook
  src/core/components/
    RichContent.tsx            ← dangerouslySetInnerHTML → component

Key design: All interfaces are async and platform-agnostic.
Web implementation under the hood, React Native swap when needed.
```

---

## 7. Moving Forward Standards

### S1: Rules Must Scale Logarithmically
- New rules go into the appropriate category file, not a monolithic index.
- The trigger table in AGENTS.md/GEMINI.md stays small (category pointers, not full rules).
- Audit rules quarterly: if a rule hasn't triggered in 3 PRD implementations, demote it.

### S2: New Browser API Usage Must Go Through Platform Layer
- All new `localStorage`/`sessionStorage` usage → `src/core/platform/storage.ts`
- All new `window.*`/`document.*` hooks → `src/core/platform/hooks/`
- All new `dangerouslySetInnerHTML` → `src/core/components/RichContent.tsx`
- All new `useNavigate()` → `useNavigation` hook
- All new responsive breakpoints → `useScreenSize` hook
- Enforced by Rules 18-22 in `documentation/rules/mobile-portability.md`.

### S3: Feature Removal Must Follow Full Checklist
- Use the Multi-Layer Feature Removal Checklist (P1) for any feature being removed.
- Always create backup before deletion.
- Always run multi-filetype grep sweep after deletion.
- Update task files with RETIRED notices rather than deleting references (preserves history).

### S4: Orphaned Docs Must Be Caught During Audits
- When removing a feature, explicitly check `.knowns/docs/` for files that may not be in the MCP registry.
- Run `find_by_name` in `.knowns/docs/` for the feature name, not just `mcp_knowns_list_docs`.
- Orphaned docs that agents can read are as dangerous as orphaned code.
