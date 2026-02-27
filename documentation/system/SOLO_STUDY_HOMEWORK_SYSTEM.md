# Solo Study & Homework System Architecture

> **PRD Reference:** PRD-0016  
> **Status:** Implementation Complete  
> **Last Updated:** 2026-02-03

---

## 📋 Overview

The Solo Study & Homework System enables two primary features:
1. **Self-Study Mode**: Students can practice materials from their enrolled courses or the public library at their own pace
2. **Homework System**: Teachers can assign materials as homework with deadlines, attempt limits, and feedback timing controls

---

## 🏗️ Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        USER INTERFACE                           │
├─────────────────────────────────────────────────────────────────┤
│  Teacher Side                    │  Student Side                │
│  ┌──────────────────────────┐    │  ┌──────────────────────────┐│
│  │ TeacherHomeworkListPage  │    │  │ StudentHomeworkListPage  ││
│  │ HomeworkCreateModal      │    │  │ StudentHomeworkDetailPage││
│  │ HomeworkConfigPanel      │    │  │ StudentLibraryPage       ││
│  │ HomeworkCard             │    │  │ StudentSoloTestPage      ││
│  │ StudentGroupSelector     │    │  │ StreakWidget             ││
│  └──────────────────────────┘    │  └──────────────────────────┘│
├─────────────────────────────────────────────────────────────────┤
│                          HOOKS                                   │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────────┐ │
│  │ useHomeworkList │ │useMaterialLibrary│ │ useSoloSession    │ │
│  └─────────────────┘ └─────────────────┘ └─────────────────────┘ │
│  ┌─────────────────────┐ ┌───────────────────┐                   │
│  │useHomeworkSubmission│ │useResultsByContext│                   │
│  └─────────────────────┘ └───────────────────┘                   │
├─────────────────────────────────────────────────────────────────┤
│                         SERVICES                                 │
├─────────────────────────────────────────────────────────────────┤
│  ┌────────────────────┐ ┌────────────────────────────┐          │
│  │  homeworkManager   │ │ homeworkSubmissionService  │          │
│  └────────────────────┘ └────────────────────────────┘          │
│  ┌────────────────────┐ ┌────────────────────────────┐          │
│  │soloSessionManager  │ │ materialDiscoveryService   │          │
│  └────────────────────┘ └────────────────────────────┘          │
│  ┌────────────────────┐ ┌────────────────────────────┐          │
│  │studentGroupService │ │ homeworkTemplateService    │          │
│  └────────────────────┘ └────────────────────────────┘          │
│  ┌────────────────────┐ ┌────────────────────────────┐          │
│  │studentStreakService│ │courseMaterialAccessService │          │
│  └────────────────────┘ └────────────────────────────┘          │
├─────────────────────────────────────────────────────────────────┤
│                     FIREBASE/DATABASE                            │
├─────────────────────────────────────────────────────────────────┤
│  /homework_assignments  /homework_submissions                    │
│  /solo_sessions        /student_groups                           │
│  /homework_templates   /test_results (with context)              │
└─────────────────────────────────────────────────────────────────┘
```

---

## 📁 File Structure

### Types
```
src/types/
├── homework.types.ts       # HomeworkAssignment, HomeworkSubmission, HomeworkConfig, etc.
├── solo.types.ts           # SoloSession, MaterialSoloConfig, StudentGroup, etc.
└── results.types.ts        # ResultContext (updated with context field)
```

### Services
```
src/services/
├── homeworkManager.ts              # CRUD for homework assignments
├── homeworkSubmissionService.ts    # Student submission tracking
├── soloSessionManager.ts           # Solo practice session management
├── materialDiscoveryService.ts     # Library search and filtering
├── studentGroupService.ts          # Saved student groups
├── homeworkTemplateService.ts      # Reusable config templates
├── studentStreakService.ts         # Practice streak tracking
├── courseMaterialAccessService.ts  # Course material access verification
├── homeworkAutoTransitionService.ts# Automatic status transitions
├── homeworkBulkOperations.ts       # Bulk operations for teachers
└── deadlineReminderService.ts      # Deadline reminder notifications
```

### Hooks
```
src/hooks/
├── useHomeworkList.ts          # Fetch and filter homework (teacher)
├── useHomeworkSubmission.ts    # Track current submission (student)
├── useSoloSession.ts           # Manage solo test session
├── useMaterialLibrary.ts       # Browse and search materials
├── useStudentGroups.ts         # Manage saved groups
└── useResultsByContext.ts      # Filter results by context
```

### Pages
```
src/pages/
├── TeacherHomeworkListPage.tsx     # Teacher homework dashboard
├── StudentHomeworkListPage.tsx     # Student homework view
├── StudentHomeworkDetailPage.tsx   # Pre-start homework details
├── StudentLibraryPage.tsx          # Material browser for self-study
└── StudentSoloTestPage.tsx         # Self-paced test taking (shared)
```

### Components
```
src/components/homework/
├── HomeworkCreateModal.tsx     # Create homework wizard (3-step)
├── HomeworkConfigPanel.tsx     # Configuration form
├── HomeworkCard.tsx            # Homework list item
├── HomeworkStatusBadge.tsx     # Status indicators
├── StudentGroupSelector.tsx    # Group selection modal
└── index.ts                    # Barrel exports

src/components/results/
├── ResultContextBadge.tsx      # Context badge (Live/Homework/Practice)
├── HomeworkResultsSummary.tsx  # Homework completion summary
└── StudentPracticeHistory.tsx  # Self-study history view

src/components/dashboard/
└── StreakWidget.tsx            # Practice streak display

src/components/access-control/
└── AccessControlWrapper.tsx    # Access control enforcement
```

---

## 🔄 Data Flow

### Self-Study Flow
```
1. Student → StudentLibraryPage
   ├── useMaterialLibrary hook fetches materials
   ├── materialDiscoveryService.getLibraryMaterials()
   └── Materials displayed with filters

2. Student clicks "Practice"
   └── Navigate to /student/solo-test/:materialId

3. StudentSoloTestPage
   ├── useSoloSession hook initializes session
   ├── soloSessionManager.createSoloSession()
   ├── Context: { type: 'self_study', source: { type: 'library' } }
   └── Results saved with self_study context

4. On Submit
   ├── soloSessionManager.completeSoloSession()
   ├── resultsService.saveTestResult() with context
   └── Navigate to result detail page
```

### Homework Flow
```
1. Teacher → TeacherHomeworkListPage
   ├── useHomeworkList hook fetches homework
   ├── Opens HomeworkCreateModal
   │   ├── Step 1: Select material and target
   │   ├── Step 2: Configure (HomeworkConfigPanel)
   │   └── Step 3: Review and confirm
   └── homeworkManager.createHomework()

2. Student → StudentHomeworkListPage
   ├── useStudentHomeworkList hook
   ├── homeworkSubmissionService.getStudentAssignedHomework()
   └── Displays by status (Not Started, In Progress, etc.)

3. Student → StudentHomeworkDetailPage
   ├── Shows homework details, attempts, deadline
   └── Creates submission on "Start"

4. Student → StudentSoloTestPage (homework mode)
   ├── context.type = 'homework'
   ├── Applies teacher's config overrides
   ├── Tracks late submission
   └── Links result to submission

5. Teacher views results
   ├── HomeworkResultsSummary component
   └── Completion rate, average score, on-time stats
```

---

## 📊 Result Context System

Results are now stored with a `context` field that tracks the source:

```typescript
interface ResultContext {
  type: 'class_session' | 'homework' | 'self_study' | 'course_material';
  source: {
    type: 'class' | 'homework' | 'library' | 'course';
    id: string;
    name: string;
  };
  assignment?: {
    homeworkId: string;
    dueDate: number;
    isLate: boolean;
    attemptNumber: number;
  };
  configApplied: {
    timerMinutes: number | null;
    feedbackTiming: 'after_completion' | 'after_deadline' | 'never';
    source: 'material_default' | 'teacher_override';
  };
}
```

### Context Badge Colors
- 🏫 **Live Session** - Blue
- 📋 **Homework** - Orange  
- 📖 **Practice** - Green
- 📚 **Course Material** - Purple

---

## 🔐 Access Control

### Teacher Visibility Rules
1. Teachers can see results from all contexts for **assigned students only**
2. Access is verified using `assignmentManager.isStudentAssignedToTeacher()`
3. When a student is unassigned:
   - Results remain in database (historical data preserved)
   - Teacher access is revoked immediately
   - `AccessControlWrapper` component handles periodic rechecks

### Student Practice Visibility
- Teachers can view student's self-study practice history
- `StudentPracticeHistory` component shows all practice results
- Helps teachers understand student engagement beyond homework

---

## ⏰ Homework Status Transitions

```
draft ────────────────→ scheduled ──────→ active ──────→ past_due ──→ closed
       (set dates)      (at availableFrom) (at dueDate)   (manual)
```

The `homeworkAutoTransitionService` handles automatic transitions:
- `scheduled` → `active` at `availableFrom` timestamp
- `active` → `past_due` at `dueDate` timestamp
- Client-side checks on page load with scheduled callbacks

---

## 🔔 Notification Types

Added homework-related notification types:
- `homework_assigned` - When teacher assigns homework
- `homework_due_soon` - 24h and 1h reminders
- `homework_submitted` - Confirmation for student
- `homework_graded` - When teacher grades (if manual grading)
- `deadline_reminder` - Client-side deadline alerts

---

## 🎯 Best Practices

### For New Development
1. **Always include context** when saving results
2. **Check material access** before allowing solo practice
3. **Verify teacher assignment** before showing student data
4. **Use hooks** rather than direct service calls in components
5. **Handle offline scenarios** with auto-save

### Testing Checklist
- [ ] Solo study can be started from library
- [ ] Homework can be created by teacher
- [ ] Student sees assigned homework
- [ ] Submit flows correctly with context
- [ ] Teacher can view results with filters
- [ ] Access control enforced on unassignment
- [ ] Deadline transitions work automatically
- [ ] Mobile layout works correctly

---

## 📝 Related Documentation

- [Database Schema](./0016-database-schema-homework-solo.md)
- [PRD Document](../tasks/0016-prd-solo-study-homework-system.md)
- [Task List](../tasks/tasks-0016-prd-solo-study-homework-system.md)

---

*Documentation generated: 2026-02-03*
