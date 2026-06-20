# Conversation Log - 2026-02-24

> **Historical notice:** Google Drive references in this log are obsolete and non-authoritative. No supported feature uses Google Drive; all active uploads use Cloudflare R2. Implementation residue cleanup is deferred.

## Session Start
- **Time:** 2026-02-24 21:40 ICT
- **Topic:** Backup System PRD Creation

---

## 1. Backup System PRD - Discovery Phase

### User Request
- Build a PRD for a backup system using `create-prd.md` template
- User wants deep clarifying questions to build a detailed vision with minimal ambiguity
- User wants advice on lacking areas, potential conflicts, edge cases, and preventions

### Actions Taken
1. Read `create-prd.md` template for PRD structure
2. Analyzed project architecture:
   - **Firebase Realtime Database** - primary data storage (tests, users, classes, sessions, homework, results, etc.)
   - **Firestore** - draft storage (test creation drafts)
   - **Cloudflare R2** - file storage (audio, images, avatars)
   - **Google Drive** - legacy image uploads (being replaced by R2)
   - **Google Auth** - authentication
3. Identified existing data entities: tests, users, classes, courses, homework, results, sessions, assignments, badges, streaks, attendance, notifications, drafts, profiles, academic records, enrollments
4. Existing PRDs: up to 0025; next PRD number = **0026**
5. Prepared clarifying questions for user

### Status: ✅ Round 1 complete

---

## 2. Deep Codebase Research for Backup Scope (B1)

### User Answers (Round 1)
- A1: e (a+d) — Full DB backup + Disaster recovery
- A2: e (a+d) — Admin only + automated scheduled
- B1: Requested deep research before recommendation
- B2: a — Full relational graph preservation
- C1: d — AI recommends best format
- C2: d — Local + cloud (new R2 account for backup)
- C3: d (a+b) — Manual + weekly auto
- D1: a — Full restore, admin-only
- D2: c — Per-entity merge UI
- E1: a — Discard partial, retry auto-backup after 15min
- E2: b — Only settled data
- E3: a — No limit
- E4: Admin backup = full site
- F1: d — Dedicated page, via Backup tab in right sidebar
- F2: c — History for admins only

### Deep Codebase Research Findings
Performed exhaustive scan of all services, types, and data paths.

#### Firebase Realtime Database (RTDB) — Root Nodes:
| Node | Service | Content |
|------|---------|---------|
| `users/` | profileService, userService | User profiles, roles, settings |
| `tests/` | testStorage, listeningTestStorage | All test data (reading + listening) |
| `quizzes/` | firebaseQueryOptimizer | Legacy quiz data |
| `classes/` | classManager | Classes, enrollments, assignments |
| `game_sessions/` | sessionManager | Live quiz/test sessions |
| `test_results/` | testResults.service | All student test results |
| `test_results_by_session/` | testResults.service | Index: session → results |
| `test_results_by_student/` | testResults.service | Index: student → results |
| `test_results_by_teacher/` | testResults.service | Index: teacher → results |
| `courses/` | courseManager | Course definitions, modules |
| `course_enrollments/` | enrollmentManager | Student-course enrollments |
| `class_course_links/` | enrollmentManager | Class-course links |
| `course_materials/` | materialLinkManager | Course material links |
| `course_progress/` | courseManager | Student course progress |
| `notifications/` | notificationService | In-app notifications |
| `audit_logs/` | auditService | Security audit trail |
| `deleted_users/` | accountDeletionService | Soft-deleted accounts |
| `guest_results/` | guestResultsService | Guest user results |
| `invitations/` | invitationService | Class invitations |
| `badges/` | badgeService | Student earned badges |
| `course_attendance/` | attendanceService | Module attendance records |

#### Firestore Collections:
| Collection | Service | Content |
|------------|---------|---------|
| `drafts/` | draftCloudService | Test creation drafts |
| `homework_assignments/` | homeworkManager | Homework assignments |
| `homework_submissions/` | homeworkSubmissionService | Student submissions |
| `homework_templates/` | homeworkTemplateService | Reusable templates |
| `student_streaks/` | studentStreakService | Practice streak data |
| `student_groups/` | studentGroupService | Student groupings |
| `settings/api_keys` | api-keys.service | Encrypted AI API keys |
| `parsingCache/` | offline-parser | Parsing checkpoints |

#### Cloudflare R2 (File Storage):
| Folder | Content |
|--------|---------|
| `audio/` | Listening test audio files |
| `images/` | Test passage images |
| `avatars/` | User profile pictures |
| `temp/` | Temporary uploads (auto-cleaned 24h) |

### Status: ✅ Round 2 complete

---

## 3. Round 2 Q&A — Architecture & Technical Design

### User Answers
- H1: d (recommend) → Hybrid: Client-triggered, Worker-executed
- H2: d (recommend) → Cloudflare Worker Cron Trigger
- I1: a → New Cloudflare account for backup isolation
- I2: c → Private R2 with signed URLs
- J1: c → Two-tier: Data Backup + Full Backup (later revised)
- K1: c default + b via button → Smart auto + per-entity option
- K2: c → Same project + confirmation preview
- L1: c (Spark Plan concern) → Client pagination + Worker REST (no Admin SDK)
- L2: a → Backup encrypted values as-is
- L3: c → Media manifest with checksums

### Key Research Finding: Spark Plan Constraints
- RTDB: 10 GB/month download, 256 MB/response, 100 connections
- Firestore: 50,000 reads/day
- No Cloud Functions, no Admin SDK export
- Bandwidth estimate at scale: ~114 MB per backup = 4.3% of monthly limit ✅

### Status: ✅ Round 2 complete

---

## 4. Round 3 Q&A — Final Deep Dive

### User Answers
- N1: b → Service Account JSON key for Firestore auth
- N2: a → R2 S3-compatible API tokens for backup bucket
- O1: b → Monday 3:00 AM UTC
- O2: b, N=10 → Keep last 10 backups
- O3: b → Entity counts in manifest
- P1: b → Per-entity diff preview
- P2: c → Keep partial restore, mark remaining
- Q1: f → Full backup dashboard (all sections)
- Q2: a → In-app notifications for all backup events

### Status: ✅ Round 3 complete

---

## 5. Round 4 Q&A — Architecture Revision

### Significant Changes
- R2 Clarification: a → Firestore only in weekly auto-backup; merge from closest weekly on restore
- T1: REVISED → No "full backup" concept. Media backup is cascading/incremental, downloads to admin's local computer
- T2: a → Incremental media sync
- U1: a → Service account JSON as Worker secret

### Architecture Pivot Summary
- **Data Backup** (Auto + Manual) → Backup R2 bucket
- **Media Backup** (Manual only) → Admin's local computer (browser download)
- Media backup uses cascading: Full → Delta → Delta → Delta → Delta → Full (every 5th)
- Chunked downloads (500 MB max per chunk) for large media

### Status: ✅ All rounds complete

---

## 6. PRD Compilation

### Output
- Created: `documentation/tasks/0026-prd-backup-disaster-recovery-system.md`
- 11 sections covering: architecture, data scope, backup types, restore system, admin UI, worker configuration, edge cases, and R2 setup guide
- 24 identified convolutions/irregularities with documented solutions
- Bandwidth analysis confirming Spark Plan feasibility

### Status: ✅ PRD compiled and saved

---

## 7. Post-Review PRD Update (v1.1) — Junior Dev Feedback

### Context
- Two juniors assessed PRD-0026 and provided comprehensive feedback
- ~38 valid points out of ~40 identified

### Critical Architecture Changes Applied
1. **Media Backup Redesign:** Worker no longer zips files (OOM risk). Worker = delta calculator + signed URL generator. Client downloads files directly via signed URLs.
2. **Auth Modernization:** Dropped legacy Firebase Database Secret. Single Google Cloud Service Account OAuth2 token for both RTDB + Firestore.
3. **Restore Side-Effects:** Replaced fragile `window.__RESTORE_IN_PROGRESS` with persistent RTDB `system_flags/restore_in_progress` node.
4. **Worker Async Pattern:** Specified `ctx.waitUntil()` for HTTP-triggered long operations.

### Key Specification Fixes
- Firestore budget: unified canonical algorithm, raised threshold to 25K, defined midnight UTC reset, eliminated live count queries
- Media chain: Fixed numbering (every 6th = checkpoint), added server-side chain state in `backup_state.json`, fallback to full if chain lost
- Pre-restore snapshots: Separate `pre-restore/` prefix, 2-week TTL, explicitly exclude Firestore
- Retry logic: Each retry from scratch (no resume)
- Manifest: Added `workerVersion`, `firestoreCollectionsIncluded` fields
- Token refresh: Check validity before each collection read, refresh if <5 min remaining

### New Sections Added
- §12: Google Cloud Service Account Setup Guide
- §13: Forward-Looking Blaze Plan Migration Strategy
- Edge cases #26-#28 (Worker timeout, R2 capacity, pre-restore Firestore exclusion)

### Other Fixes
- Settings UI: Toggle → read-only display
- Screen Wake Lock API for long operations
- PII encryption decision explicitly stated in Non-Goals
- Health endpoint added to Worker endpoints table
- Custom claim source clarified in auth section
- Success metrics: media adoption now trackable via server-side event, Firestore 14-day worst case acknowledged

### Status: ✅ PRD v1.1 saved
