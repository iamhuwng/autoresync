# PRD-0015: Academic Record & Enhanced Profile System

**Created:** 2026-01-31
**Status:** Draft
**Author:** AI Assistant (based on user requirements)
**Depends On:** PRD-0014 (Student-Teacher Assignment & Course Management System)

---

## 1. Introduction/Overview

This PRD defines a comprehensive system for managing student academic records and enhanced user profiles. The system addresses two major gaps in the current platform:

### Problem Statement

1. **Academic Data Persistence:** Test results from sessions are saved but not properly organized into a permanent, student-accessible "Academic Record" that tracks progress across courses.

2. **Incomplete User Profiles:** Users currently sign in with Google and have minimal profile data. There's no structured onboarding to collect essential personal information or a profile management system.

### Solution

A two-part system that introduces:

1. **Academic Record System:**
   - Permanent storage of all test results with course/class/module context
   - Student-facing Academic Record page with analytics and progress tracking
   - Teacher feedback and commenting on results
   - Badge/achievement system for gamification

2. **Enhanced Profile System:**
   - Mandatory profile completion flow after first Google login
   - Comprehensive personal information collection
   - Profile page for students to view/edit their information
   - Teacher view access (read-only) with super admin full control

---

## 2. Goals

| Goal | Metric |
|------|--------|
| Permanent academic history | 100% of submitted test results saved with full context |
| Complete user profiles | 100% of active users complete profile within first session |
| Progress visibility | Students can view all courses with accurate progress % |
| Teacher feedback loop | Teachers can add feedback, students notified immediately |
| Gamification engagement | Badge system encourages consistent study |

---

## 3. User Stories

### Student

- As a student, I want to complete my profile after first login so my teachers have my contact information.
- As a student, I want to see all my test results in one place (Academic Record) organized by timeline, course, skill, or test type.
- As a student, I want to see my progress in each course based on my test scores.
- As a student, I want to receive notifications when my teacher adds feedback to my results.
- As a student, I want to earn badges for achievements to feel motivated.
- As a student, I want to update my profile information anytime.

### Teacher

- As a teacher, I want to view my students' Academic Records to understand their performance.
- As a teacher, I want to add feedback (per-question and overall) to student results.
- As a teacher, I want to mark modules as complete for my class with exceptions for specific students.
- As a teacher, I want to see a list of students who haven't submitted tests.
- As a teacher, I want to start sessions directly from a course module with automatic context tagging.

### Guest

- As a guest, I want to view my past test results without registering.
- As a guest, I want to register and claim my guest results to my account.

### Super Admin

- As a super admin, I want to edit any student's profile information.
- As a super admin, I want to manage data deletion requests (soft delete → hard delete after 30 days).

---

## 4. Functional Requirements

### Phase 1: Enhanced Profile System

#### 4.1 Profile Completion Flow (First Login)

| ID | Requirement |
|----|-------------|
| 4.1.1 | After first Google sign-in, redirect user to Profile Completion Page |
| 4.1.2 | Block navigation until profile is fully completed |
| 4.1.3 | Display progress indicator (Step 1 of 1 or multi-step if needed) |

#### 4.2 Profile Fields

| ID | Field | Required | Validation |
|----|-------|----------|------------|
| 4.2.1 | First Name | Yes | 2-50 characters, letters only |
| 4.2.2 | Family Name | Yes | 2-50 characters, letters only |
| 4.2.3 | Date of Birth | Yes | 3 dropdowns (Day/Month/Year), display as DD/MM/YYYY, min age 5, max age 100 |
| 4.2.4 | Phone Number | Yes | Country dropdown with flag + formatted number, international format validation, min/max length per country, real-time format preview |
| 4.2.5 | Address - Street | Yes | Text input, 5-200 characters |
| 4.2.6 | Address - City | Yes | Text input, 2-100 characters |
| 4.2.7 | Address - Province/State | Yes | Text input, 2-100 characters |
| 4.2.8 | Address - Country | Yes | Text input, 2-100 characters |
| 4.2.9 | School | No | Free text, max 200 characters, optional |
| 4.2.10 | Job | No | Free text, max 100 characters, optional |
| 4.2.11 | Avatar | No | Upload to Cloudflare R2, max 5MB, JPEG/PNG/WebP/GIF, auto-resize to 200x200 |

#### 4.3 Avatar Handling

| ID | Requirement |
|----|-------------|
| 4.3.1 | Default avatar: Use Google profile picture if no custom upload |
| 4.3.2 | Upload to Cloudflare R2 storage (existing integration) |
| 4.3.3 | Auto-resize uploaded images to standard dimensions (200x200) |
| 4.3.4 | Show preview before saving |

#### 4.4 Profile Page (Student)

| ID | Requirement |
|----|-------------|
| 4.4.1 | Accessible from avatar dropdown in header |
| 4.4.2 | Tab in Student Dashboard navigation |
| 4.4.3 | Display all profile fields |
| 4.4.4 | Edit button to modify any field |
| 4.4.5 | Show enrolled classes and courses (auto-updated when assigned) |
| 4.4.6 | Show enrollment history with status (Active, Completed, Expired) and dates |

#### 4.5 Profile Editing Permissions

| ID | Field | Student | Teacher | Super Admin |
|----|-------|---------|---------|-------------|
| 4.5.1 | All profile fields | Edit | View Only | Edit |
| 4.5.2 | Role/Status | View Only | View Only | Edit |
| 4.5.3 | Enrollment data | View Only | View Only | Edit |

#### 4.6 Teacher View of Student Profile

| ID | Requirement |
|----|-------------|
| 4.6.1 | Teacher can view profiles of students in their classes ONLY |
| 4.6.2 | Teacher CANNOT view profiles or academic records of students in other teachers' classes |
| 4.6.3 | Access via: Quick view dialog (from class list) or Full page (from student record) |
| 4.6.4 | Read-only display of all profile fields |
| 4.6.5 | No edit capabilities for teachers |
| 4.6.6 | Cross-teacher collaboration requires super admin to grant temporary access |

---

### Phase 2: Academic Record System

#### 4.7 Result Context Enhancement

| ID | Requirement |
|----|-------------|
| 4.7.1 | Add `courseId`, `courseName` to test result records |
| 4.7.2 | Add `classId`, `className` to test result records |
| 4.7.3 | Add `moduleId`, `moduleName` to test result records |
| 4.7.4 | Names are snapshots at submission time (preserved even if source renamed/deleted) |
| 4.7.5 | Session started from module auto-populates context fields |

#### 4.8 Academic Record Page (Student)

| ID | Requirement |
|----|-------------|
| 4.8.1 | New tab in Student Dashboard: "Academic Record" (alongside "My Courses") |
| 4.8.2 | Primary navigation tabs: [All Results - Timeline] [By Course] [By Skill] [By Test Type] |
| 4.8.3 | Timeline view: Chronological list with newest first |
| 4.8.4 | By Course: Group results under course headers with progress % |
| 4.8.5 | By Skill: Group by Reading, Listening, Writing, Speaking |
| 4.8.6 | By Test Type: Group by Quiz, Test, etc. |

#### 4.9 Result Card Display

| ID | Requirement |
|----|-------------|
| 4.9.1 | Show: Test title, Score (%), Course name, Module name, Submitted date |
| 4.9.2 | Show "Has Feedback ✓" indicator if teacher added feedback |
| 4.9.3 | Click card → Navigate to result detail page |
| 4.9.4 | Structure flexible for future UI revisions |

#### 4.10 Statistics Dashboard

| ID | Requirement |
|----|-------------|
| 4.10.1 | Overview section: Total tests, Average score, Best score, Study streak |
| 4.10.2 | Score progression chart (line graph over time) |
| 4.10.3 | Skill breakdown visualization (radar/spider chart) |
| 4.10.4 | Score distribution histogram |
| 4.10.5 | Test attempt frequency chart |
| 4.10.6 | Band score trajectory chart |
| 4.10.7 | Export options: PDF report, CSV data export |

#### 4.11 Course Progress Calculation

| ID | Requirement |
|----|-------------|
| 4.11.1 | Formula: `(Sum of ALL module scores) / (Number of modules × 100) × 100%` |
| 4.11.2 | Test modules: Use actual test score (0-100) |
| 4.11.3 | Lecture modules (no tests): Binary pass/fail - 100 if attended, 0 if not |
| 4.11.4 | Not attended/not submitted = 0 contribution to numerator |
| 4.11.5 | "Pending review" tests (Writing/Speaking): Excluded from progress until teacher marks as "Reviewed" |
| 4.11.6 | Expired courses: Progress frozen/archived (read-only) |
| 4.11.7 | Example: Course has 10 modules (5 test, 5 lecture). Student: 80% on all tests, attended 3/5 lectures. Progress = (80+80+80+80+80+100+100+100+0+0) / 1000 = 70% |

#### 4.12 Attendance Tracking

| ID | Requirement |
|----|-------------|
| 4.12.1 | Per-course attendance percentage |
| 4.12.2 | Attendance = Student joined session created from module AND test was submitted |
| 4.12.3 | Late joins via session code still count as attended |
| 4.12.4 | Self-study activity (accessing materials outside sessions): Tracked but not counted toward attendance % |
| 4.12.5 | Auto-submit ensures all in-session students have results |

---

### Phase 3: Teacher Feedback System

#### 4.13 Feedback Fields

| ID | Requirement |
|----|-------------|
| 4.13.1 | Per-question `teacherFeedback` field (visible to student) |
| 4.13.2 | `overallFeedback` field at result level (visible to student) |
| 4.13.3 | Both support rich text (free text editor) |
| 4.13.4 | Feedback saved permanently to result record |

#### 4.14 Feedback Workflow

| ID | Requirement |
|----|-------------|
| 4.14.1 | Teacher opens result from Session Results or Student Academic Record |
| 4.14.2 | For each question: Add/edit `teacherFeedback` |
| 4.14.3 | At bottom: Add/edit `overallFeedback` |
| 4.14.4 | "Save" button persists all feedback |
| 4.14.5 | Only latest feedback shown (overwrites previous) |
| 4.14.6 | Feedback changes logged with timestamp and author |

#### 4.15 Feedback Notifications

| ID | Requirement |
|----|-------------|
| 4.15.1 | Student receives in-app notification immediately when teacher saves feedback |
| 4.15.2 | Notification text: "Your teacher reviewed your [Test Name] result. View feedback →" |
| 4.15.3 | Clicking notification → Navigate directly to result detail page |
| 4.15.4 | If student viewing result page during save → Live update feedback without notification |
| 4.15.5 | If student offline → Queue notification for delivery on next login |
| 4.15.6 | Notification expires after 7 days if unread |

#### 4.16 Teacher Access Scope

| ID | Requirement |
|----|-------------|
| 4.16.1 | Teacher can view Academic Record of students in their classes |
| 4.16.2 | Teacher can ONLY add feedback to results from courses/classes they teach |
| 4.16.3 | Results from other teachers' courses: View only, no feedback editing |

#### 4.17 Re-Marking Integration

| ID | Requirement |
|----|-------------|
| 4.17.1 | Existing re-marking feature (PRD-0013) remains |
| 4.17.2 | Re-mark history tracks feedback changes: `feedbackBefore`, `feedbackAfter` |
| 4.17.3 | Student notification on re-mark: "feedback updated" (no preview of content) |

---

### Phase 4: Module Session & Attendance

#### 4.18 Session from Module

| ID | Requirement |
|----|-------------|
| 4.18.1 | Add "Start Session" button next to each module in Course Profile |
| 4.18.2 | Clicking opens modal: Select which material(s) from module + Session settings |
| 4.18.3 | Teacher chooses: "Course students only" OR "Open to all" |
| 4.18.4 | Only ONE material can be selected per session (no bundling) |
| 4.18.5 | Session auto-tagged with `courseId`, `classId`, `moduleId` |

#### 4.19 Module Completion

| ID | Requirement |
|----|-------------|
| 4.19.1 | Teacher manually marks module complete for entire class (from Course Profile → Module) |
| 4.19.2 | Completion is class-level (all students in class see module as complete) |
| 4.19.3 | Teacher can add "exceptions" - mark specific students as incomplete |
| 4.19.4 | Exception students see module as "incomplete" in their student account |
| 4.19.5 | Teacher can view list of exception students per module |
| 4.19.6 | Exception can be reversed (teacher marks student complete later) |
| 4.19.7 | Students joining AFTER module marked complete: Inherit complete status by default |
| 4.19.8 | Removing student from class: Removes their exception record |
| 4.19.9 | Re-adding student to class: Restores previous exception status if within 30 days |

#### 4.20 Module Attendance

| ID | Requirement |
|----|-------------|
| 4.20.1 | Students who join session from module are marked as "attended" |
| 4.20.2 | Attendance recorded in `module_attendance/{courseId}/{classId}/{moduleId}` |
| 4.20.3 | Teacher can manually add late attendance |
| 4.20.4 | Late joins via session code count as attended |
| 4.20.5 | All in-session students auto-submit when time's up (already implemented) |

#### 4.21 Auto-Submit Enhancement

| ID | Requirement |
|----|-------------|
| 4.21.1 | ✅ Already implemented: `useTestTimer.ts` calls `onTimeUp()` when timer reaches 0 |
| 4.21.2 | Add: Warning notification at 5 minutes remaining ("5 minutes left!") |
| 4.21.3 | Countdown timer already visible throughout test |

---

### Phase 5: Guest Results System

#### 4.22 Guest Result Handling

| ID | Requirement |
|----|-------------|
| 4.22.1 | Guest results saved to separate index: `guest_results/{guestName}/{resultId}` |
| 4.22.2 | Multiple guests with same name: Add suffix (Guest1, Guest2) |
| 4.22.3 | Guest results NOT added to permanent Academic Record |

#### 4.23 Guest Results Page

| ID | Requirement |
|----|-------------|
| 4.23.1 | Add "View Guest Results" button on login page |
| 4.23.2 | Guest enters their guest name → View list of their past results |
| 4.23.3 | Results display similar to Academic Record but simplified |

#### 4.24 Guest Result Migration

| ID | Requirement |
|----|-------------|
| 4.24.1 | When guest registers with email, prompt: "Claim your guest results?" |
| 4.24.2 | If claimed: Move guest results to new user's Academic Record |
| 4.24.3 | Update `studentId` and `studentName` in result records |
| 4.24.4 | Remove from `guest_results` index, add to `results_by_student` |

---

### Phase 6: Badge System

#### 4.25 Badge Definitions

| Badge | Criteria | Icon Style |
|-------|----------|------------|
| 💎 First Test | Complete first test | Diamond icon, gradient blue-purple, modern/edgy |
| 🎯 Perfect Score | 100% on any test | Neon bullseye, bright pink/magenta |
| 🔥 On Fire | 5-day study streak | Flame with electric orange gradient |
| 📖 Module Master | Complete all tests in a module | Glowing book, teal/cyan accent |
| 🏅 Course Champion | Complete entire course | Metallic gold medal with shine effect |
| 📈 Improvement Star | Score 20%+ higher than previous attempt on same test | Rising arrow, lime green with glow |

#### 4.26 Badge Behavior

| ID | Requirement |
|----|-------------|
| 4.26.1 | Badges earned silently (student discovers in profile) |
| 4.26.2 | Badge appears in Academic Record → Badges section |
| 4.26.3 | Badges visible to teachers viewing student's record |
| 4.26.4 | Static icons (SVG), no animation |

#### 4.26B Badge Display Locations

| ID | Requirement |
|----|-------------|
| 4.26B.1 | Badge showcase on Student Profile page (top section) |
| 4.26B.2 | Badge icons appear next to student name in class lists (teachers see) |
| 4.26B.3 | Clickable badge → Shows description + earning date tooltip |
| 4.26B.4 | Academic Record page has dedicated "Badges" tab showing all earned badges |

---

### Phase 7: Writing/Speaking Review Flow

#### 4.27 Pending Review Status

| ID | Requirement |
|----|-------------|
| 4.27.1 | Writing/Speaking tests submitted with status `pending-review` |
| 4.27.2 | Status changes to `reviewed` when teacher clicks "Mark as Reviewed" button |
| 4.27.3 | Pending tests: Score shows as "Pending" in UI |
| 4.27.4 | Pending tests: Excluded from progress calculation until reviewed |

---

### Phase 8: Student Alerts

#### 4.28 Non-Submission Alerts

| ID | Requirement |
|----|-------------|
| 4.28.1 | When session ends and student hasn't submitted → Auto-submit (existing feature) |
| 4.28.2 | If student was in session but disconnected before time up: In-app notification sent |
| 4.28.3 | Notification: Informational only (no quick actions for now) |

---

### Phase 9: Data Deletion

#### 4.29 GDPR-Style Deletion

| ID | Requirement |
|----|-------------|
| 4.29.1 | Student requests account deletion → Soft delete (hide from UI) |
| 4.29.2 | Data preserved for 30 days |
| 4.29.3 | After 30 days → Hard delete |
| 4.29.4 | Super admin can trigger immediate hard delete |

---

### Phase 10: Error Handling & Edge Cases

#### 4.30 Error Handling

| ID | Scenario | System Behavior |
|----|----------|----------------|
| 4.30.1 | Profile save fails during completion | Show error toast, allow retry, data persisted locally until success |
| 4.30.2 | Avatar upload fails (R2 unavailable) | Fall back to Google profile picture, show "Retry upload" option |
| 4.30.3 | Student starts test before profile complete | Block with modal: "Complete your profile to continue" |
| 4.30.4 | Teacher feedback fails to save | Show error toast, feedback cached locally for retry |
| 4.30.5 | Academic Record load timeout | Show cached data + "Syncing..." indicator |
| 4.30.6 | Orphaned results (deleted course/class) | Display with courseId = null, show as "Unassigned Course" |
| 4.30.7 | Pre-PRD-0014 results | Manual backfill tool for admin to assign context |

---

## 5. Non-Goals (Out of Scope)

| Item | Reason |
|------|--------|
| Comparison with class average | Deferred - privacy concerns |
| Activity calendar heatmap | Deferred - complexity |
| Email notifications | In-app only for now |
| Parent/Guardian view | Future enhancement (architecture flexible) |
| Class-relative badges (e.g., "Top of Class") | Deferred |
| Animated badges | Static only for now |
| OTP phone verification | Deferred |
| Address autocomplete (Google Places API) | Deferred |

---

## 5.1 Accessibility Requirements

| ID | Requirement |
|----|-------------|
| 5.1.1 | WCAG 2.1 AA compliance for all profile forms |
| 5.1.2 | Keyboard navigation for all Academic Record tabs and cards |
| 5.1.3 | Screen reader support for statistics charts (alt text descriptions) |
| 5.1.4 | High contrast mode support |
| 5.1.5 | Focus indicators visible on all interactive elements |

---

## 6. Design Considerations

### Navigation Structure

**Student Dashboard:**
```
[My Courses] [Academic Record] [Profile]
```

**Academic Record Tabs:**
```
[All Results - Timeline] [By Course] [By Skill] [By Test Type]
```

### Phone Input Design

```
┌──────────────────────────────────────┐
│ [🇻🇳 +84 ▼] [xxx-xxx-xxxx        ] │
└──────────────────────────────────────┘
Combined flag selector with country code + formatted number input
```

### Date of Birth Input

```
┌─────────────────────────────────────────────────────┐
│ [Day ▼] / [Month ▼] / [Year ▼]                     │
│   01         January       2000                     │
└─────────────────────────────────────────────────────┘
3 dropdowns, displays as DD/MM/YYYY
```

### Result Card Preview

```
┌──────────────────────────────────────────────────────┐
│ 📝 IELTS Reading Test 1                        85%  │
│ Course: IELTS Preparation | Module: Intro           │
│ Submitted: Jan 30, 2026 at 14:30                   │
│ [Has Feedback ✓]                                   │
└──────────────────────────────────────────────────────┘
```

### Badge Visual Style

- Modern, edgy aesthetic
- Sharp, vibrant colors
- Gradient fills with glow effects
- Metallic/bling appearance

---

## 7. Technical Considerations

### Data Architecture

```
Firebase Realtime Database:

// Extended User Profile
users/{uid}
├── auth: { email, displayName, photoURL, role, status }
├── profile
│   ├── firstName: string
│   ├── familyName: string
│   ├── dateOfBirth: "DD/MM/YYYY"
│   ├── phone: { countryCode: "+84", number: "xxx-xxx-xxxx" }
│   ├── address: { street, city, province, country }
│   ├── school: string | null
│   ├── job: string | null
│   ├── avatarUrl: string (Cloudflare R2)
│   └── completedAt: timestamp
├── enrollments
│   └── {enrollmentId}: { courseId, classId, enrolledAt, expiredAt, status }
└── badges
    └── {badgeId}: { type, earnedAt, courseId? }

// Enhanced Test Results
test_results/{resultId}
├── (existing fields)
├── courseId: string | null (NEW)
├── courseName: string | null (NEW)
├── classId: string | null (NEW)
├── className: string | null (NEW)
├── moduleId: string | null (NEW)
├── moduleName: string | null (NEW)
├── questionResults: [
│   {
│     ...existing fields...
│     teacherFeedback: string | null (NEW)
│   }
│ ]
├── overallFeedback: string | null (NEW)
├── feedbackUpdatedAt: timestamp | null (NEW)
├── feedbackUpdatedBy: string | null (NEW)
└── markingStatus: 'auto-marked' | 'pending-review' | 'reviewed' (UPDATED)

// Indexes
results_by_student/{studentId}/{resultId}: { preview }
results_by_course/{courseId}/{resultId}: { preview }
results_by_class/{classId}/{resultId}: { preview }
results_by_session/{sessionCode}/{resultId}: { preview }
results_by_teacher/{teacherId}/{resultId}: { preview }
guest_results/{guestName}/{resultId}: { preview }

// Academic Summaries (Cached)
academic_summaries/{studentId}
├── overview: { totalTests, averageScore, bestScore, studyStreak, lastActiveAt }
├── skillBreakdown: { reading: {...}, listening: {...}, ... }
├── courseProgress: { {courseId}: { progress%, completedModules, attendance% } }
└── lastUpdated: timestamp

// Module Attendance
module_attendance/{courseId}/{classId}/{moduleId}
├── isComplete: boolean
├── completedAt: timestamp
├── completedBy: teacherId
├── attendees: { {studentId}: { joinedAt, submittedAt, status } }
└── exceptions: { {studentId}: { reason, note } }
```

### Integration Points

- **Cloudflare R2:** Avatar storage (existing integration)
- **Firebase Auth:** Google sign-in (existing)
- **Notification System:** In-app notifications (existing)
- **PRD-0014 Course System:** Module, Course, Class entities

### Migration Notes

- Existing test results: Add null values for new context fields
- Existing users: Mark as `profileCompleted: false` until they complete profile
- Existing guest results: Migrate to new `guest_results` structure
- Orphaned results (deleted course/class): Set courseId = null, display as "Unassigned Course"
- Pre-PRD-0014 results: Provide manual backfill tool for admin to assign context

### Session Results Permanence

**CRITICAL:** Current session results use temporary in-memory storage. This PRD requires:
- All feedback to persist in `test_results` collection (permanent storage)
- Migration from any temporary session storage to permanent storage
- Backfill process for in-flight sessions during deployment

---

## 8. Success Metrics

| Metric | Target |
|--------|--------|
| Profile completion rate | 100% of new users complete within first session |
| Academic Record usage | 80% of students view their record weekly |
| Teacher feedback adoption | 50% of results receive feedback within 7 days |
| Badge engagement | Track badge earn rates |
| Data integrity | 0% data loss on result submissions |

---

## 9. Open Questions

| # | Question | Priority | Status |
|---|----------|----------|--------|
| 1 | Should profile fields be translatable/internationalized? | Low | Deferred |
| 2 | Should there be a "Share Academic Record" feature? | Low | Deferred |
| 3 | Should badges have different tiers (Bronze/Silver/Gold)? | Low | Future |
| 4 | What's the threshold for "Improvement Star" (currently 20%)? | Medium | Needs validation |
| 5 | Should Writing/Speaking tests have separate pending queues? | Medium | Implementation detail |
| 6 | How long should guest results persist before auto-deletion? | Medium | Suggested: 30 days |
| 7 | What's the backfill strategy for orphaned results (deleted courses)? | High | Needs decision |
| 8 | Should lecture module attendance be weighted differently than test modules? | Medium | Currently equal weight |
| 9 | Where should badges be displayed most prominently? | Medium | Currently: Profile + Academic Record |

---

## 10. Implementation Phases

### Phase 1: Enhanced Profile System (Priority: HIGH)
- Requirements: 4.1 - 4.6
- Estimated effort: 1-2 weeks

### Phase 2: Academic Record Core (Priority: HIGH)
- Requirements: 4.7 - 4.12
- Estimated effort: 2-3 weeks

### Phase 3: Teacher Feedback System (Priority: HIGH)
- Requirements: 4.13 - 4.17
- Estimated effort: 1-2 weeks

### Phase 4: Module Session & Attendance (Priority: MEDIUM)
- Requirements: 4.18 - 4.21
- Estimated effort: 1-2 weeks

### Phase 5: Guest Results System (Priority: LOW)
- Requirements: 4.22 - 4.24
- Estimated effort: 1 week

### Phase 6: Badge System (Priority: LOW)
- Requirements: 4.25 - 4.26
- Estimated effort: 1 week

### Phase 7: Writing/Speaking Review Flow (Priority: MEDIUM)
- Requirements: 4.27
- Estimated effort: 0.5 weeks

### Phase 8: Alerts & Deletion (Priority: LOW)
- Requirements: 4.28 - 4.29
- Estimated effort: 0.5 weeks

**Total Estimated Effort: 8-12 weeks**

---

## Appendix A: Summary of User Decisions

| Question | Decision |
|----------|----------|
| Academic Record content | Test results + course progress + attendance/participation |
| Result organization | Tabbed: Timeline, By Course, By Skill, By Test Type |
| Statistics | Full analytics dashboard (excluding comparison, calendar) |
| Teacher access | View/add feedback to own courses only, read-only for others |
| Profile completion | Blocking - required before proceeding |
| Avatar upload | Cloudflare R2, 5MB max, auto-resize, Gmail fallback |
| Phone format | Country dropdown + validated format |
| Address | All fields required (Street, City, Province, Country) |
| Profile editing | Student + Admin can edit, Teacher view-only |
| Guest results | Separate page, claimable on registration, suffix for duplicates |
| Badges | Modern/edgy style, silent earning |
| Attendance | Per-course, attendance = joined + submitted |
| Progress | Score-based for tests, attendance-based for lecture modules |
| Module completion | Class-level with individual exceptions |
| Session from module | Modal with material selection, audience choice |
| Feedback notification | Immediate, links to result detail |
| Writing/Speaking status | Pending until teacher clicks "Mark as Reviewed" |
| Data architecture | Hybrid: Extend results + Cached summaries + Module attendance |
| Course duplication | Structure only (fresh enrollments, clean slate) |
| Data deletion | Soft delete → Hard delete after 30 days |

---

## Appendix B: Confirmed Workflows

### B.1 New User Registration Flow

```
User clicks "Sign in with Google"
    → First-time user detected
    → Redirect to Profile Completion Page (blocking)
    → User fills:
        - First Name (2-50 chars)
        - Family Name (2-50 chars)
        - DOB (3 dropdowns: Day/Month/Year)
        - Phone (Country selector + formatted number)
        - Address (Street, City, Province, Country - all required)
        - School (optional)
        - Job (optional)
        - Avatar (optional, upload to R2)
    → User submits → Profile saved with completedAt timestamp
    → Redirect to appropriate dashboard
```

### B.2 Teacher Starts Session from Module

```
Teacher opens Course Profile → Modules Tab
    → Clicks "Start Session" on Module X
    → Modal opens:
        - Select ONE material from module
        - Audience: "Course students only" OR "Open to all"
        - Standard session settings
    → Teacher confirms
    → Session created with courseId + classId + moduleId embedded
    → Students join and take test
    → Timer ends → All answers auto-submitted
    → Results saved with full context
```

### B.3 Teacher Reviews & Adds Feedback

```
Teacher opens result (from Session Results or Student Academic Record)
    → Views question-by-question breakdown
    → For each question: Add/edit teacherFeedback (visible to student)
    → At bottom: Add/edit overallFeedback (visible to student)
    → Clicks "Save"
    → Student receives notification: "View feedback →"
    → Clicking notification → Opens result detail page
```

### B.4 Module Completion Flow

```
After session from module ends:
    → All attended students marked as "attended"
    → Teacher goes to Course Profile → Module → "Mark Complete"
    → Module marked complete for entire class
    → Teacher can add exceptions (mark specific students incomplete)
    → Exception shows: Module complete (class), individual "incomplete"
    → Exception reversible by teacher
```

---

*End of PRD-0015*
