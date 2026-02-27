---
title: Database Schema Homework Solo
createdAt: '2026-02-27T15:25:38.043Z'
updatedAt: '2026-02-27T15:25:39.429Z'
description: Database schema design for homework and solo study system
tags:
  - database
  - schema
  - homework
  - solo
---
# Database Schema: Solo Study & Homework System (PRD-0016)

> **Created:** 2026-02-03  
> **Related PRD:** [0016-prd-solo-study-homework-system.md](../tasks/0016-prd-solo-study-homework-system.md)

This document defines the Firebase Realtime Database and Firestore schema for the Solo Study & Homework System.

---

## 1. New Collections Overview

| Collection | Database | Purpose |
|------------|----------|---------|
| `/homework_assignments/{id}` | Realtime DB | Homework assignment definitions |
| `/homework_submissions/{id}` | Realtime DB | Student homework submissions |
| `/student_groups/{id}` | Realtime DB | Saved student groups |
| `/homework_templates/{id}` | Realtime DB | Reusable homework configs |
| `/solo_sessions/{id}` | Realtime DB | Active solo sessions |

---

## 2. Homework Assignments Collection

**Path:** `/homework_assignments/{homeworkId}`

```typescript
{
  // Identification
  id: string;                    // Unique homework ID (matches document key)
  
  // Ownership
  createdBy: string;             // Teacher UID who created this
  createdAt: number;             // Unix timestamp
  updatedAt: number;             // Unix timestamp
  
  // Content Reference
  materialId: string;            // Reference to test/quiz
  materialTitle: string;         // Denormalized for display
  materialType: "quiz" | "test";
  materialSkill: "reading" | "listening" | "writing" | "speaking";
  
  // Target (who should complete this homework)
  target: {
    type: "class" | "course" | "students" | "group";
    classId?: string;            // If type === "class"
    className?: string;          // Denormalized
    courseId?: string;           // If type === "course"
    courseName?: string;         // Denormalized
    studentIds?: string[];       // If type === "students"
    studentNames?: string[];     // Denormalized
    groupId?: string;            // If type === "group"
    groupName?: string;          // Denormalized
  };
  
  // Scheduling
  scheduling: {
    availableFrom?: number;      // When homework becomes available (optional)
    dueDate: number;             // Deadline timestamp
  };
  
  // Configuration (overrides material defaults)
  config: {
    timerMinutes: number | null; // Time limit (null = no limit)
    maxAttempts: number | null;  // Max attempts (null = unlimited)
    feedbackTiming: "immediate" | "after_completion" | "after_deadline" | "never";
    lateSubmissionAllowed: boolean;
  };
  
  // What students see before starting
  visibility: {
    showTimer: boolean;
    showAttempts: boolean;
    showDueDate: boolean;
    showQuestionCount: boolean;
    showDuration: boolean;
  };
  
  // Status
  status: "draft" | "scheduled" | "active" | "past_due" | "closed";
  
  // Optional metadata
  title?: string;                // Custom title (defaults to materialTitle)
  description?: string;          // Instructions for students
  
  // Statistics (denormalized for quick access)
  stats: {
    totalAssigned: number;
    started: number;
    submitted: number;
    lateSubmissions: number;
    averageScore?: number;
    completionRate?: number;
  }
}
```

**Indexes:**
- `createdBy` - Query homework by teacher
- `target/classId` - Query homework by class
- `status` - Filter by status
- `scheduling/dueDate` - Sort by deadline

---

## 3. Homework Submissions Collection

**Path:** `/homework_submissions/{submissionId}`

```typescript
{
  // Identification
  id: string;                    // Unique submission ID
  homeworkId: string;            // Reference to homework assignment
  studentId: string;             // Student UID
  studentName?: string;          // Denormalized
  
  // Attempt tracking
  attemptNumber: number;         // 1-based attempt number
  
  // Timing
  startedAt: number;             // When student started
  submittedAt?: number;          // When submitted (null if in progress)
  timeSpent?: number;            // Seconds spent
  isLate: boolean;               // Was this submitted after deadline?
  
  // Result link
  resultId?: string;             // Link to EnhancedTestResultRecord in Firestore
  
  // Scores (denormalized from result)
  score?: number;
  maxScore?: number;
  percentage?: number;
  bandScore?: number;
  
  // Status
  status: "in_progress" | "submitted" | "graded"
}
```

**Indexes:**
- `homeworkId` - Get all submissions for a homework
- `studentId` - Get all submissions by a student
- `homeworkId + studentId` - Get student's submissions for specific homework

---

## 4. Student Groups Collection

**Path:** `/student_groups/{groupId}`

```typescript
{
  // Identification
  id: string;                    // Unique group ID
  teacherId: string;             // Teacher who owns this group
  
  // Group info
  name: string;                  // Display name (e.g., "Advanced Readers")
  studentIds: string[];          // Array of student UIDs
  studentNames?: string[];       // Denormalized for display
  
  // Metadata
  createdAt: number;
  updatedAt: number;
}
```

**Indexes:**
- `teacherId` - Query groups by teacher

---

## 5. Homework Templates Collection

**Path:** `/homework_templates/{templateId}`

```typescript
{
  // Identification
  id: string;                    // Unique template ID
  teacherId: string;             // Teacher who owns this template
  
  // Template info
  name: string;                  // Display name (e.g., "Standard Quiz", "Timed Exam")
  
  // Configuration
  config: {
    timerMinutes: number | null;
    maxAttempts: number | null;
    feedbackTiming: "immediate" | "after_completion" | "after_deadline" | "never";
    lateSubmissionAllowed: boolean;
  };
  
  // Visibility settings
  visibility: {
    showTimer: boolean;
    showAttempts: boolean;
    showDueDate: boolean;
    showQuestionCount: boolean;
    showDuration: boolean;
  };
  
  // Metadata
  createdAt: number;
  updatedAt: number;
}
```

**Indexes:**
- `teacherId` - Query templates by teacher

---

## 6. Solo Sessions Collection

**Path:** `/solo_sessions/{sessionId}`

```typescript
{
  // Identification
  id: string;                    // Unique session ID
  studentId: string;             // Student taking this session
  
  // Material
  materialId: string;
  materialTitle: string;
  materialType: "quiz" | "test";
  materialSkill: "reading" | "listening" | "writing" | "speaking";
  
  // Context (determines config and result tagging)
  context: {
    type: "class_session" | "homework" | "self_study" | "course_material";
    source: {
      type: "class" | "homework" | "course" | "library" | "direct_link";
      id?: string;
      name?: string;
    };
    assignment?: {
      homeworkId?: string;
      homeworkTitle?: string;
      dueDate?: number;
      isLate?: boolean;
      attemptNumber: number;
      maxAttempts?: number;
    };
    configApplied: {
      timerMinutes?: number;
      feedbackTiming: "immediate" | "after_completion" | "after_deadline" | "never";
      source: "material_default" | "teacher_override";
    };
  };
  
  // Timing
  startedAt: number;
  endedAt?: number;
  timeSpent: number;             // Seconds
  timeRemaining?: number;        // Seconds (if timer enabled)
  
  // Progress
  currentQuestion: number;       // 0-based index
  totalQuestions: number;
  answers: {                     // Map of questionId -> answer
    [questionId: string]: any;
  };
  
  // Status
  status: "active" | "paused" | "completed" | "abandoned";
  
  // Result link
  resultId?: string;             // Created after completion
}
```

**Indexes:**
- `studentId` - Query sessions by student
- `status` - Filter active sessions
- `studentId + status` - Get active sessions for a student

---

## 7. Material Schema Extension

**Path:** Existing material/test storage (varies by type)

Add the following fields to existing test/quiz documents:

```typescript
{
  // ... existing fields ...
  
  // PRD-0016: Solo mode configuration
  soloEnabled: boolean;          // Whether this material can be used in solo mode
  
  soloConfig: {
    defaults: {
      timerMinutes: number | null;
      feedbackTiming: "immediate" | "after_completion" | "after_deadline" | "never";
      suggestedAttempts: number;
    };
    contexts: {
      selfStudy: {
        enabled: boolean;        // Available in student library
        publicLibrary: boolean;  // Visible in public library
      };
      homework: {
        enabled: boolean;        // Can be used in homework assignments
        allowTeacherOverride: boolean;
      };
      courseMaterial: {
        canMarkRequired: boolean;
      };
    };
  }
}
```

---

## 8. Result Record Extension

**Path:** Firestore `/student_results/{resultId}` (existing)

Add the `context` field to `EnhancedTestResultRecord`:

```typescript
{
  // ... existing fields ...
  
  // PRD-0016: Result context
  context?: {
    type: "class_session" | "homework" | "self_study" | "course_material";
    source: {
      type: "class" | "homework" | "course" | "library" | "direct_link";
      id?: string;
      name?: string;
    };
    assignment?: {
      homeworkId?: string;
      homeworkTitle?: string;
      dueDate?: number;
      isLate?: boolean;
      attemptNumber: number;
      maxAttempts?: number;
    };
    configApplied: {
      timerMinutes?: number;
      feedbackTiming: "immediate" | "after_completion" | "after_deadline" | "never";
      source: "material_default" | "teacher_override";
    };
  }
}
```

---

## 9. Security Rules (Firebase Realtime Database)

```javascript
{
  "rules": {
    // Homework assignments
    "homework_assignments": {
      "$homeworkId": {
        ".read": "auth != null && (
          root.child('homework_assignments').child($homeworkId).child('createdBy').val() === auth.uid ||
          root.child('homework_assignments').child($homeworkId).child('target/studentIds').hasChild(auth.uid)
        )",
        ".write": "auth != null && (
          !data.exists() || 
          data.child('createdBy').val() === auth.uid
        )"
      }
    },
    
    // Homework submissions
    "homework_submissions": {
      "$submissionId": {
        ".read": "auth != null && (
          data.child('studentId').val() === auth.uid ||
          root.child('homework_assignments').child(data.child('homeworkId').val()).child('createdBy').val() === auth.uid
        )",
        ".write": "auth != null && (
          !data.exists() && newData.child('studentId').val() === auth.uid ||
          data.child('studentId').val() === auth.uid
        )"
      }
    },
    
    // Student groups (teacher only)
    "student_groups": {
      "$groupId": {
        ".read": "auth != null && data.child('teacherId').val() === auth.uid",
        ".write": "auth != null && (
          !data.exists() || data.child('teacherId').val() === auth.uid
        )"
      }
    },
    
    // Homework templates (teacher only)
    "homework_templates": {
      "$templateId": {
        ".read": "auth != null && data.child('teacherId').val() === auth.uid",
        ".write": "auth != null && (
          !data.exists() || data.child('teacherId').val() === auth.uid
        )"
      }
    },
    
    // Solo sessions (student only)
    "solo_sessions": {
      "$sessionId": {
        ".read": "auth != null && data.child('studentId').val() === auth.uid",
        ".write": "auth != null && (
          !data.exists() && newData.child('studentId').val() === auth.uid ||
          data.child('studentId').val() === auth.uid
        )"
      }
    }
  }
}
```

---

## 10. Data Migration Notes

### Existing Results Migration
- Add `context: { type: 'class_session', source: { type: 'class' } }` to all existing results
- Script: `src/utils/resultsMigration.ts` (Phase 1)

### Existing Materials Migration
- Add `soloEnabled: false` to all existing materials (opt-in model)
- Teachers must explicitly enable solo mode for their materials

---

*Schema Version: 1.0*  
*Last Updated: 2026-02-03*
