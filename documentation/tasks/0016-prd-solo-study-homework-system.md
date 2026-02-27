# PRD: Solo Study & Homework System

> **PRD Number:** 0016  
> **Status:** Draft  
> **Created:** 2026-02-03  
> **Author:** Antigravity AI (via Discovery Session)

---

## 1. Introduction/Overview

### Problem Statement

The current application only supports **teacher-controlled live sessions** where students are synchronized with the teacher's pacing. This creates significant gaps:

1. **No asynchronous learning** - Teachers cannot assign work for students to complete on their own time
2. **No self-directed practice** - Students cannot independently study with available materials
3. **Limited flexibility** - All learning requires teacher presence

### Solution

Implement a **Solo Study & Homework System** with two distinct modes:

| Mode | Description | Who Controls |
|------|-------------|--------------|
| **Self-Study** | Student browses materials and practices independently | Student-driven |
| **Homework** | Teacher assigns materials with configured settings and deadlines | Teacher-assigned |

Both modes operate **asynchronously** without requiring teacher presence during the session. All results are tracked with context labels to distinguish between class sessions, homework, and self-study.

---

## 2. Goals

### Primary Goals

1. **Enable asynchronous homework assignments** - Teachers can assign materials with deadlines, attempt limits, and custom configurations
2. **Enable student self-study** - Students can browse and practice materials independently with unlimited retakes
3. **Unified result tracking** - All results (live sessions, homework, self-study) are tracked in student profiles with clear context labels
4. **Teacher visibility** - Teachers can view all activity from their assigned students across all contexts

### Success Metrics

| Metric | Target |
|--------|--------|
| Self-study adoption | 50%+ students use within first month |
| Homework completion rate | 80%+ submitted before deadline |
| Teacher efficiency | < 2 minutes to create homework assignment |
| Student engagement | Average 3+ self-study sessions per week |

---

## 3. User Stories

### 3.1 Self-Study Mode

#### US-1: Library Discovery
> **As a student**, I want to browse available materials for self-study, so that I can practice independently and improve my skills.

**Acceptance Criteria:**
- Student can access a "Library" tab in navigation
- Library shows materials from: enrolled courses, public library, recommended, search
- Materials can be filtered by: type, skill, difficulty, source
- Only materials with `solo_enabled: true` are visible
- Student sees material metadata before starting

#### US-2: Self-Study Session
> **As a student**, I want to take a self-study test with the material's default settings, so that I can practice without waiting for a teacher.

**Acceptance Criteria:**
- Student can start a solo session from library or course materials
- Session uses material owner's default configuration
- Timer behavior per material config
- Unlimited retakes allowed
- Results shown immediately after completion
- Results labeled as "Self-Study" context

#### US-3: Self-Study Progress
> **As a student**, I want to see my self-study history with streaks and progress, so that I stay motivated to practice regularly.

**Acceptance Criteria:**
- Student can view all self-study results in "My Results"
- Shows best and latest scores per material
- Practice streaks are tracked ("5-day streak! 🔥")
- Results clearly labeled with "Self-Study" badge

---

### 3.2 Homework Mode - Teacher

#### US-4: Homework Creation
> **As a teacher**, I want to assign materials as homework to my students, so that they can complete work on their own time.

**Acceptance Criteria:**
- Teacher can access "Homework" tab in navigation (peer-level with Classes, Courses, Materials)
- Flexible workflow: Material-first OR Target-first OR ad-hoc
- Can target: individual students, saved groups, entire class, course enrollees
- Can configure: timer, attempts, feedback timing, due date
- Can set late submission policy (allowed with flag)

#### US-5: Homework Configuration
> **As a teacher**, I want to customize homework settings that override material defaults, so that I can adapt assignments to my class needs.

**Acceptance Criteria:**
- Configuration panel shows material defaults
- Teacher can override: timer, max attempts, feedback timing
- Feedback timing options: immediate, after completion, after deadline, never
- Due date and available-from date can be set
- Can save configuration as template for reuse

#### US-6: Homework Management
> **As a teacher**, I want to see all my homework assignments organized by status, so that I can track progress efficiently.

**Acceptance Criteria:**
- Multiple view options: by class, chronological, by status
- Status filters: Draft, Active, Past Due, Completed
- Can duplicate existing homework with modifications
- Can extend deadlines
- Shows submission counts and completion rates

#### US-7: Class Homework View
> **As a teacher**, I want to see homework results within my class view, so that I can review class-level performance.

**Acceptance Criteria:**
- Class detail page has "Homework Results" tab
- Shows list of homework assigned to this class
- Each homework shows: submission count, average score, completion rate
- Click through to see individual student submissions

---

### 3.3 Homework Mode - Student

#### US-8: Homework Discovery
> **As a student**, I want to see all my assigned homework in one place, so that I know what needs to be completed.

**Acceptance Criteria:**
- Student can access "Homework" tab in navigation
- Shows homework list with: title, due date, status, source (class/teacher)
- Status organization: Not Started, In Progress, Completed, Overdue
- Overdue items clearly highlighted

#### US-9: Homework Taking
> **As a student**, I want to complete assigned homework with teacher-configured settings, so that I meet my assignment requirements.

**Acceptance Criteria:**
- Student sees homework details before starting: timer, attempts, due date
- Session uses teacher's configured settings
- Attempt count tracked and enforced
- Late submission allowed if configured (flagged as late)
- Results stored with "Homework" context

#### US-10: Homework Feedback
> **As a student**, I want to receive feedback on my homework according to teacher settings, so that I learn from my mistakes.

**Acceptance Criteria:**
- Feedback shown based on teacher's `feedback_timing` setting
- "after_completion": see correct answers immediately
- "after_deadline": see correct answers only after deadline
- "never": only see score, not answers

---

### 3.4 Teacher Visibility

#### US-11: Student Results Overview
> **As a teacher**, I want to see all results for my assigned students, so that I can track their overall progress.

**Acceptance Criteria:**
- Teacher can view results for all assigned students only
- Results include all contexts: class sessions, homework, self-study
- Results labeled with context badge (🏫 Live | 📋 Homework | 📖 Self-Study)
- Filter by context type, date range, material, score
- Access immediately revoked when student is unassigned

---

## 4. Functional Requirements

### 4.1 Material Configuration

| # | Requirement |
|---|-------------|
| FR-1 | The system must allow material owners to enable/disable solo mode for their materials |
| FR-2 | The system must store default configuration (timer, feedback timing) for solo-enabled materials |
| FR-3 | The system must allow context-specific settings (self-study enabled, homework enabled, public library visibility) |

### 4.2 Homework Management

| # | Requirement |
|---|-------------|
| FR-4 | The system must allow teachers to create homework assignments targeting: individual students, student groups, classes, or course enrollees |
| FR-5 | The system must allow teachers to configure: timer, max attempts, feedback timing, due date, available-from date |
| FR-6 | The system must track homework status: draft, scheduled, active, past due, closed |
| FR-7 | The system must allow late submissions to be flagged as "late" when enabled |
| FR-8 | The system must allow teachers to save homework configurations as reusable templates |
| FR-9 | The system must allow teachers to duplicate existing homework with modifications |
| FR-10 | The system must allow teachers to create and manage named student groups |

### 4.3 Solo Session Engine

| # | Requirement |
|---|-------------|
| FR-11 | The system must create solo sessions for self-study and homework contexts |
| FR-12 | The system must apply material default configuration for self-study sessions |
| FR-13 | The system must apply teacher override configuration for homework sessions |
| FR-14 | The system must track attempt count for homework (unlimited for self-study) |
| FR-15 | The system must enforce max attempts for homework when configured |

### 4.4 Result Tracking

| # | Requirement |
|---|-------------|
| FR-16 | The system must store result context: class_session, homework, self_study, or course_material |
| FR-17 | The system must store source information: class ID, homework ID, course ID, or library |
| FR-18 | The system must store configuration that was applied (timer, feedback timing, source) |
| FR-19 | The system must track attempt number and late status for homework submissions |
| FR-20 | The system must allow filtering results by context type |

### 4.5 Access Control

| # | Requirement |
|---|-------------|
| FR-21 | Teachers must only see results from students assigned to them |
| FR-22 | Access to student results must be revoked immediately when teacher is unassigned |
| FR-23 | Homework assignments must remain active even if creating teacher is unassigned |
| FR-24 | New assigned teachers must be able to see historical results |

### 4.6 Student Library

| # | Requirement |
|---|-------------|
| FR-25 | The system must provide a library view for students to browse solo-enabled materials |
| FR-26 | The library must show materials from: enrolled courses, public library, recommended |
| FR-27 | The library must support filtering by: skill, type, difficulty, source |
| FR-28 | The library must support search by title and description |

### 4.7 Progress Tracking

| # | Requirement |
|---|-------------|
| FR-29 | The system must track self-study streaks (consecutive days of practice) |
| FR-30 | The system must show best and latest scores per material |
| FR-31 | The system must display progress statistics on student dashboard |

---

## 5. Non-Goals (Out of Scope)

The following are explicitly **not** included in this PRD:

| Non-Goal | Reason |
|----------|--------|
| Diagnostic/Placement Tests | Planned for future (schema will be prepared) |
| Formal Exam Mode (proctoring) | Homework with strict config is sufficient for now |
| Real-time collaboration | Solo mode is single-player by design |
| AI-powered analytics | Future enhancement after core system is stable |
| Peer competition/challenges | Future gamification feature |
| Notification system | Will leverage existing system if available, else defer |
| Writing/Speaking auto-grading | Existing manual review system will be used |

---

## 6. Design Considerations

### 6.1 Navigation Changes

**Teacher Navigation:**
```
📊 Dashboard
├── 👥 Classes       
├── 📚 Courses       
├── 📝 Materials     
├── 📋 Homework  🆕  ← NEW: Peer-level tab
├── 🎮 Sessions      
└── 📈 Results       
```

**Student Navigation:**
```
📊 Dashboard
├── 📚 My Courses    
├── 📋 Homework  🆕  ← NEW: Assigned homework
├── 📖 Library   🆕  ← NEW: Self-study materials
├── 📈 My Results    
└── 👤 Profile       
```

### 6.2 Result Context Badges

| Context | Badge | Color |
|---------|-------|-------|
| Class Session | 🏫 Live Session | Blue |
| Homework | 📋 Homework | Purple |
| Self-Study | 📖 Practice | Green |
| Course Material | 📚 Course | Orange |

### 6.3 UI Components to Create

1. `TeacherHomeworkListPage` - List with view toggles
2. `HomeworkCreateModal` - Flexible creation workflow
3. `HomeworkConfigPanel` - Settings configuration
4. `StudentHomeworkListPage` - Status-organized list
5. `StudentLibraryPage` - Filterable material browser
6. `StudentSoloTestPage` - Self-paced test taking (reuse existing components)
7. `ResultContextBadge` - Reusable context indicator

---

## 7. Technical Considerations

### 7.1 Data Schema

#### Result Context (Extension to EnhancedTestResultRecord)
```typescript
interface ResultContext {
  type: 'class_session' | 'homework' | 'self_study' | 'course_material';
  source: {
    type: 'class' | 'homework' | 'course' | 'library';
    id?: string;
    name?: string;
  };
  assignment?: {
    homeworkId?: string;
    homeworkTitle?: string;
    dueDate?: Timestamp;
    isLate?: boolean;
    attemptNumber: number;
    maxAttempts?: number;
  };
  configApplied: {
    timerMinutes?: number;
    feedbackTiming: 'immediate' | 'after_completion' | 'after_deadline' | 'never';
    source: 'material_default' | 'teacher_override';
  };
}
```

#### Homework Assignment
```typescript
interface HomeworkAssignment {
  id: string;
  createdBy: string;
  materialId: string;
  materialTitle: string;
  target: {
    type: 'class' | 'course' | 'students' | 'group';
    classId?: string;
    courseId?: string;
    studentIds?: string[];
    groupId?: string;
  };
  scheduling: {
    availableFrom?: Timestamp;
    dueDate: Timestamp;
    lateSubmissionAllowed: boolean;
  };
  config: {
    timer_minutes: number | null;
    max_attempts: number;
    feedback_timing: string;
  };
  status: 'draft' | 'scheduled' | 'active' | 'past_due' | 'closed';
}
```

### 7.2 New Firebase Collections

| Collection | Purpose |
|------------|---------|
| `/homework_assignments/{id}` | Homework definitions |
| `/homework_submissions/{id}` | Student attempts |
| `/student_groups/{id}` | Saved student groups |
| `/homework_templates/{id}` | Reusable configs |

### 7.3 Integration Points

| Existing Component | Integration |
|-------------------|-------------|
| `EnhancedTestResultRecord` | Add `context` field |
| `TeacherClassDetailPage` | Add Homework tab |
| `StudentCoursesPage` | Link to solo study |
| `StudentDashboardPage` | Show upcoming homework, recent practice |
| `routeSecurity.ts` | Add new routes for homework and library pages |

### 7.4 Data Migration

1. Add `context: { type: 'class_session' }` to all existing results
2. Add `solo_enabled: false` to all existing materials (opt-in)

---

## 8. Success Metrics

| Metric | Measurement | Target |
|--------|-------------|--------|
| **Self-Study Adoption** | % of students who use library in first month | > 50% |
| **Homework Completion** | % of homework submitted before deadline | > 80% |
| **Teacher Efficiency** | Average time to create homework assignment | < 2 minutes |
| **Engagement** | Self-study sessions per student per week | > 3 |
| **Late Submission Rate** | % of homework submitted late | < 15% |

---

## 9. Open Questions (ANSWERED)

| # | Question | Answer | Source |
|---|----------|--------|--------|
| Q1 | Does current module progress system support sequential unlock + teacher control? | ✅ **YES** - `ModuleProgress` interface exists with `locked`, `available`, `completed` status. `ModuleAccessType` supports `'open' \| 'sequential'`. Teacher can call `updateModuleProgress(classId, moduleId, status)` | `types/class.types.ts:177`, `classManager.ts:382` |
| Q2 | Is there an existing notification system to leverage for deadline reminders? | ✅ **YES** - Full notification system exists: `notificationService.ts` (in-app), `emailNotification.service.ts` (email via Firebase Extension). Supports types: `info`, `success`, `warning`, `error`, `feedback`. Has `createBulkNotifications()` for announcements. | `services/notificationService.ts`, `services/emailNotification.service.ts` |
| Q3 | When a teacher leaves, what happens to their homework templates? | **RECOMMENDATION**: Templates remain in database but become orphaned. New assigned teacher can view but not edit. Consider: transfer ownership or mark as "shared template". | Policy decision (no existing pattern) |
| Q4 | Should homework be auto-closed after deadline + grace period, or require manual close? | **RECOMMENDATION**: Auto-close with option. Similar to existing `TestAssignmentStatus` which has `completed` state. Suggest: auto-transition to `past_due` at deadline, teacher can manually close or extend. | Consistent with `class.types.ts:33-38` |

### Investigation Summary

**Module Progress (Q1):**
- `ModuleProgress` interface: `{ status: 'locked' | 'available' | 'completed', unlockedAt?, completedAt? }`
- Sequential unlock works: modules with `accessType: 'sequential'` start as locked
- Teacher control exists: `updateModuleProgress(classId, moduleId, status)` function
- **No conflict with PRD requirements** - existing system already supports our needs

**Notification System (Q2):**
- In-app notifications: `createNotification()`, `getUserNotifications()`, `markNotificationAsRead()`
- Real-time subscription: `subscribeToNotifications(userId, callback)`
- Bulk notifications: `createBulkNotifications(userIds, data)` - perfect for homework announcements
- Email notifications: `sendEmail()`, `sendResultNotification()` - via Firebase Trigger Email extension
- **Can be extended** with new notification types like `'homework_assigned'`, `'deadline_reminder'`

---

## 10. Implementation Phases (Summary)

| Phase | Focus | Duration |
|-------|-------|----------|
| **Phase 0** | Foundation & Schema Design | 2-3 days |
| **Phase 1** | Result System Refactor (add context) | 3-4 days |
| **Phase 2** | Self-Study Mode (Library, Solo Session) | 1 week |
| **Phase 3** | Homework - Teacher Side | 1-2 weeks |
| **Phase 4** | Homework - Student Side | 1 week |
| **Phase 5** | Teacher Visibility & Access Control | 1 week |
| **Phase 6** | Advanced Features (Reminders, Bulk Ops, Streaks) | 1 week |

**Total Estimated Effort: 5-7 weeks**

---

## Appendix: Discovery Session Decisions

All decisions were made through an extensive clarifying questions session on 2026-02-03:

| Topic | Decision |
|-------|----------|
| Material Access | All sources (courses, public, recommended, search) |
| Teacher Visibility | Assigned students only, revoked immediately |
| Homework Target | Individual, class, course, or student groups |
| Homework Scheduling | Due date + Available window + Late flag |
| Attempt Tracking | All stored, latest score counts for homework |
| Result Storage | Event-based with context tagging |
| Config Hierarchy | Material defaults → Teacher overrides |
| Self-Study Tracking | Merge with source tag |
| Homework Tab | Peer-level with Classes, Courses, Materials |
| Late Submission | Allowed with flag (B) |
| Duplication | Yes with modification |
| Student Groups | Ad-hoc + Saved groups |

---

*PRD Status: Ready for Implementation Planning*  
*Next Step: Generate task breakdown using generate-tasks.md*
