# PRD: Login System with Role-Based Permissions

**Document ID:** 0011-prd-login-system-with-permissions  
**Created:** January 14, 2026  
**Status:** Draft - Pending Approval  
**Author:** AI Assistant (Cascade)

---

## 1. Introduction/Overview

### Problem Statement
The current application lacks a formal authentication system. Teachers use hardcoded credentials stored in environment variables, and students join sessions anonymously without persistent accounts. This creates several issues:
- No way to track student progress across sessions
- Teachers cannot manage their own content separately
- No role-based access control
- Anonymous guests cannot be distinguished from registered students

### Solution
Implement a comprehensive login system using **Firebase Authentication (Google Sign-In)** with four distinct user roles:
1. **Super Admin** - Full system access, manages teachers
2. **Teacher** - Creates content, manages classes and sessions
3. **Registered Student** - Joins classes, takes tests, views history
4. **Anonymous Guest** - Joins sessions when allowed, no history

### Goal
Enable secure, role-based access to the application while preserving the ability for anonymous guests to participate when teachers allow it.

---

## 2. Goals

| Goal | Metric | Target |
|------|--------|--------|
| Secure authentication | All users authenticate via Google Sign-In | 100% |
| Role separation | Each role has distinct permissions | 4 roles defined |
| Student tracking | Registered students can view test history | History page functional |
| Teacher content ownership | Teachers can only edit their own content | Ownership enforced |
| Anonymous guest support | Teachers can enable guest access per session | Toggle functional |
| Class management | Students can enroll in classes with codes | Enrollment working |
| Backward compatibility | Existing quizzes/tests remain accessible | 0 data loss |

---

## 3. User Stories

### Super Admin
- **SA-1:** As a Super Admin, I want to sign in with my Google account so that I can access the admin dashboard.
- **SA-2:** As a Super Admin, I want to generate teacher invitation codes so that I can onboard new teachers.
- **SA-3:** As a Super Admin, I want to view all users and their roles so that I can manage the system.
- **SA-4:** As a Super Admin, I want to disable/enable teacher accounts so that I can control access.
- **SA-5:** As a Super Admin, I want existing content (without owners) to be assigned to me and marked as public so that all teachers can access legacy materials.

### Teacher
- **T-1:** As a Teacher, I want to use an invitation code to create my account (one-time) so that I can access the teacher dashboard.
- **T-2:** As a Teacher, I want to sign in with Google (after initial setup) so that I can access my dashboard without needing an invitation each time.
- **T-3:** As a Teacher, I want to create classes with unique codes so that students can enroll.
- **T-4:** As a Teacher, I want to create quizzes/tests that I own so that only I can edit/delete them.
- **T-5:** As a Teacher, I want to make my content "public" so that other teachers can use it (read-only).
- **T-6:** As a Teacher, I want to create sessions linked to my classes so that enrolled students can participate.
- **T-7:** As a Teacher, I want to enable "anonymous guest mode" for a session so that non-registered users can join via a special link/QR code.
- **T-8:** As a Teacher, I want to set self-study access per class and/or per quiz/test so that students can practice outside of sessions.
- **T-9:** As a Teacher, I want a dedicated results page accessible from a menu so that I can review student performance across sessions.
- **T-10:** As a Teacher, I want to choose "Class members only" or "Anyone with code" when creating a session so that I can control who can join.

### Registered Student
- **S-1:** As a Student, I want to sign in with Google so that I can access my student dashboard.
- **S-2:** As a Student, I want to enter a class code (one-time per class) so that I can enroll in a teacher's class.
- **S-3:** As a Student, I want to see my enrolled classes so that I can choose which one to access.
- **S-4:** As a Student, I want to see available sessions in my class so that I can join a test/quiz.
- **S-5:** As a Student, I want to view my test history so that I can track my progress.
- **S-6:** As a Student, I want to access self-study materials (if teacher allows) so that I can practice on my own.

### Anonymous Guest
- **G-1:** As a Guest, I want to join a session via a special link/QR code so that I can participate without signing in.
- **G-2:** As a Guest, I want to enter my name so that the teacher can identify me during the session.
- **G-3:** As a Guest, I understand that my results will not be saved after the session ends.

---

## 4. Functional Requirements

### 4.1 Authentication

| ID | Requirement |
|----|-------------|
| FR-AUTH-01 | The system must use Firebase Authentication with Google Sign-In as the only authentication method. |
| FR-AUTH-02 | The system must identify Super Admin by matching the signed-in user's email against `VITE_SUPER_ADMIN_EMAIL` environment variable. |
| FR-AUTH-03 | The system must store user roles in Firebase Custom Claims (`role: 'super_admin' | 'teacher' | 'student'`). |
| FR-AUTH-04 | The system must create a user profile in `users/{uid}` upon first sign-in. |
| FR-AUTH-05 | The system must redirect users to their appropriate dashboard based on role after sign-in. |

### 4.2 Teacher Invitation System

| ID | Requirement |
|----|-------------|
| FR-INV-01 | Super Admin must be able to generate invitation codes (format: `TEACH-XXXXXX`). |
| FR-INV-02 | Super Admin must be able to invite specific email addresses (teacher must use that exact Google account). |
| FR-INV-03 | Invitation codes must expire after 7 days or upon use (whichever comes first). |
| FR-INV-04 | When a user signs in with a valid invitation code, the system must assign `role: 'teacher'` to their account. |
| FR-INV-05 | Invitation codes must be single-use and marked as `used: true` after successful registration. |
| FR-INV-06 | After initial account creation, teachers must be able to sign in directly without needing an invitation. |

### 4.3 Class Management

| ID | Requirement |
|----|-------------|
| FR-CLS-01 | Teachers must be able to create classes with auto-generated 6-character codes. |
| FR-CLS-02 | Classes must store `teacherId` (Firebase UID of the owner). |
| FR-CLS-03 | Students must be able to join a class by entering the class code (one-time enrollment). |
| FR-CLS-04 | Teachers must be able to view enrolled students in their classes. |
| FR-CLS-05 | Teachers must be able to remove students from their classes. |
| FR-CLS-06 | Teachers must be able to archive classes when no longer needed. |
| FR-CLS-07 | Teachers must be able to set `allowSelfStudy` per class (default: false). |

### 4.4 Content Ownership & Sharing

| ID | Requirement |
|----|-------------|
| FR-OWN-01 | All new quizzes/tests must have an `ownerId` field set to the creator's Firebase UID. |
| FR-OWN-02 | Teachers must only be able to edit/delete content they own. |
| FR-OWN-03 | Teachers must be able to set `isPublic: true` on their content to share with other teachers (read-only). |
| FR-OWN-04 | Super Admin must be able to view and manage all content. |
| FR-OWN-05 | Existing content without `ownerId` must be migrated to Super Admin's UID and marked as `isPublic: true`. |
| FR-OWN-06 | Teachers must be able to set `allowSelfStudy` per quiz/test (default: false). |

### 4.5 Session Management

| ID | Requirement |
|----|-------------|
| FR-SES-01 | Sessions must store `teacherId` (Firebase UID of the creator). |
| FR-SES-02 | Sessions must optionally link to a `classId`. |
| FR-SES-03 | Sessions must have an `allowAnonymous` boolean flag (default: false). |
| FR-SES-04 | When creating a session from a class, teachers must choose: "Class members only" or "Anyone with session code". |
| FR-SES-05 | When `allowAnonymous: true`, the system must generate a shareable link and QR code for guest access. |
| FR-SES-06 | Player records must include `userId: uid | null` to link registered students to their accounts. |

### 4.6 Student Dashboard & History

| ID | Requirement |
|----|-------------|
| FR-STU-01 | Registered students must see a dashboard with: enrolled classes, join class input, and test history. |
| FR-STU-02 | Students must be able to view their enrolled classes and select one to see available sessions. |
| FR-STU-03 | Students must be able to see a list of active sessions in their selected class. |
| FR-STU-04 | Students must be able to view their test history with scores and dates. |
| FR-STU-05 | Test results must be stored in `student_history/{uid}/{sessionCode}`. |
| FR-STU-06 | If `allowSelfStudy` is enabled (class-level OR content-level), students must be able to browse and take materials outside of sessions. |

### 4.7 Teacher Results Page

| ID | Requirement |
|----|-------------|
| FR-RES-01 | Teachers must have a dedicated "Results" page accessible from the main menu. |
| FR-RES-02 | The Results page must show all sessions created by the teacher. |
| FR-RES-03 | Teachers must be able to filter results by class, date range, and test/quiz. |
| FR-RES-04 | Teachers must be able to view individual student performance within a session. |
| FR-RES-05 | Teachers must be able to export results (CSV format). |

### 4.8 Anonymous Guest Flow

| ID | Requirement |
|----|-------------|
| FR-GUE-01 | When a session has `allowAnonymous: true`, guests can access via a special URL (e.g., `/guest/{sessionCode}`). |
| FR-GUE-02 | Guests must enter their name before joining (no Google Sign-In required). |
| FR-GUE-03 | Guest player records must have `userId: null` and `isGuest: true`. |
| FR-GUE-04 | Guest results must NOT be saved to `student_history` (session-only). |

---

## 5. Non-Goals (Out of Scope)

| Item | Reason |
|------|--------|
| Email/password authentication | Google Sign-In is simpler and more secure |
| School/organization hierarchy | Deferred to future version |
| Multiple Super Admins | Single Super Admin is sufficient for now |
| Teacher-to-teacher content transfer | Can be added later |
| Student self-registration as teacher | Teachers are invite-only |
| Super Admin participating as student | Admin role is admin-only |
| Co-teachers per class | Single owner per class for now |
| Push notifications | Not required for MVP |

---

## 6. Design Considerations

### 6.1 UI/UX Requirements

All UI must follow the existing **glassmorphic design system**:
- Use `Card`, `CardBody`, `Button`, `Input` from `src/components/modern`
- Card variants: `glass`, `lavender`, `sky`, `mint`, `rose`, `peach`
- Backdrop blur effects on modals and overlays
- Soft pastel color palette
- Poppins font for headings, Inter for body

### 6.2 New Pages Required

| Page | Route | Description |
|------|-------|-------------|
| Login Page (Updated) | `/` | Google Sign-In + Guest join option |
| Student Dashboard | `/student` | Enrolled classes, join class, history |
| Teacher Results | `/teacher/results` | Dedicated results review page |
| Admin Users | `/admin/users` | User management for Super Admin |
| Admin Invitations | `/admin/invitations` | Teacher invitation management |
| Guest Join | `/guest/:sessionCode` | Anonymous guest entry point |

### 6.3 Updated Pages

| Page | Changes |
|------|---------|
| Teacher Lobby | Filter content by ownership, add "My Content" / "Public" tabs |
| Session Management | Show only sessions created by current teacher (Super Admin sees all) |
| Create Session Modal | Add "Allow Anonymous" toggle, class selection dropdown |

---

## 7. Technical Considerations

### 7.1 Firebase Configuration

```javascript
// Required Firebase services
- Firebase Authentication (Google provider)
- Firebase Realtime Database (existing)
- Firebase Custom Claims (for roles)
```

### 7.2 Database Schema Changes

```
users/{uid}/
├── email: string
├── displayName: string
├── photoURL: string
├── role: 'super_admin' | 'teacher' | 'student'
├── createdAt: number
├── createdBy: uid | null (for teachers)
├── status: 'active' | 'disabled'
└── enrolledClasses: { classCode: true, ... } (for students)

teacher_invites/{inviteCode}/
├── createdBy: uid
├── createdAt: number
├── expiresAt: number
├── email: string | null (if specific email invited)
├── used: boolean
└── usedBy: uid | null

classes/{classCode}/
├── ... (existing fields from classManager.ts)
├── teacherId: uid (Firebase UID)
├── settings/
│   ├── allowSelfStudy: boolean
│   └── ... (existing)
└── sharedMaterials: { contentId: { type, addedAt } }

quizzes/{quizId}/
├── ... (existing fields)
├── ownerId: uid
├── isPublic: boolean
└── allowSelfStudy: boolean

tests/{testId}/
├── ... (existing fields)
├── ownerId: uid
├── isPublic: boolean
└── allowSelfStudy: boolean

game_sessions/{code}/
├── ... (existing fields)
├── teacherId: uid (Firebase UID)
├── classId: string | null
├── allowAnonymous: boolean
└── players/{playerId}/
    ├── ... (existing fields)
    ├── userId: uid | null
    └── isGuest: boolean

student_history/{uid}/{sessionCode}/
├── testId/quizId: string
├── classId: string | null
├── completedAt: number
├── score: number
└── answers: { ... }
```

### 7.3 Environment Variables

```env
# New required variable
VITE_SUPER_ADMIN_EMAIL=admin@example.com

# Existing (to be deprecated after migration)
VITE_ADMIN_USERNAME=...
VITE_ADMIN_PASSWORD=...
```

### 7.4 Migration Strategy

1. **Phase 1:** Add Firebase Auth without breaking existing flow
2. **Phase 2:** Migrate existing content to Super Admin ownership
3. **Phase 3:** Update UI to use new auth system
4. **Phase 4:** Deprecate old admin login modal
5. **Phase 5:** Add class and student features

### 7.5 Existing Code to Leverage

- `src/services/classManager.ts` - Has class CRUD operations, student management, and test assignment logic. **Recommendation: Build on top of existing code** (per user choice #9C).
- `src/services/firebase.js` - Firebase Auth already initialized (`getAuth`).
- `src/types/class.types.ts` - Existing type definitions for classes.

---

## 8. Success Metrics

| Metric | Measurement | Target |
|--------|-------------|--------|
| Authentication adoption | % of users signing in with Google | 100% (teachers/students) |
| Teacher content ownership | % of content with valid ownerId | 100% after migration |
| Student enrollment | Average students per class | Track baseline |
| Session participation | Registered vs anonymous ratio | Track baseline |
| History usage | % of students viewing history | > 50% |
| Self-study usage | Sessions started outside class | Track baseline |

---

## 9. User Flow Diagrams

### 9.1 Teacher Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│ TEACHER FLOW                                                         │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  [Login Page]                                                        │
│       │                                                              │
│       ▼                                                              │
│  Sign in with Google                                                 │
│       │                                                              │
│       ├── First time? ──► Enter invitation code ──► Account created │
│       │                                                              │
│       ▼                                                              │
│  [Teacher Lobby]                                                     │
│       │                                                              │
│       ├── [Quiz/Test Tab] ──► View/Create content                   │
│       │                                                              │
│       ├── [Classes Tab] ──► Create/Manage classes                   │
│       │                                                              │
│       ├── [Sessions Tab] ──► View active sessions                   │
│       │                                                              │
│       └── [Results Menu] ──► [Teacher Results Page]                 │
│                                                                      │
│  Creating a Session:                                                 │
│  [Teacher Lobby] ──► Select content ──► Create Session              │
│       │                                                              │
│       ├── Link to class? ──► Select class                           │
│       │       │                                                      │
│       │       └── Access: "Class only" OR "Anyone with code"        │
│       │                                                              │
│       └── Allow anonymous? ──► Toggle ON ──► Generate link/QR       │
│                                                                      │
│       ▼                                                              │
│  [Teacher Monitor Page] ──► Monitor students ──► End session        │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

### 9.2 Student Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│ STUDENT FLOW                                                         │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  [Login Page]                                                        │
│       │                                                              │
│       ▼                                                              │
│  Sign in with Google                                                 │
│       │                                                              │
│       ▼                                                              │
│  [Student Dashboard]                                                 │
│       │                                                              │
│       ├── Join Class ──► Enter class code (one-time)                │
│       │                                                              │
│       ├── My Classes ──► Select a class                             │
│       │       │                                                      │
│       │       ▼                                                      │
│       │  [Class View]                                                │
│       │       │                                                      │
│       │       ├── Active Sessions ──► Select session ──► Join test  │
│       │       │                                                      │
│       │       └── Self-Study (if allowed) ──► Browse materials      │
│       │                                                              │
│       └── Test History ──► View past results                        │
│                                                                      │
│  Taking a Test:                                                      │
│  [Class View] ──► Select session ──► [Student Test Page]            │
│       │                                                              │
│       ▼                                                              │
│  Complete test ──► Results saved to history ──► [Results Page]      │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

### 9.3 Anonymous Guest Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│ ANONYMOUS GUEST FLOW                                                 │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  Teacher enables "Allow Anonymous" for session                       │
│       │                                                              │
│       ▼                                                              │
│  System generates: Link + QR Code                                    │
│       │                                                              │
│       ▼                                                              │
│  Guest scans QR / clicks link ──► /guest/{sessionCode}              │
│       │                                                              │
│       ▼                                                              │
│  [Guest Join Page]                                                   │
│       │                                                              │
│       ├── Enter name                                                 │
│       │                                                              │
│       └── (Optional) "Sign in instead" link                         │
│                                                                      │
│       ▼                                                              │
│  Join session ──► Take test ──► See results (session only)          │
│       │                                                              │
│       ▼                                                              │
│  Session ends ──► Results NOT saved ──► Return to login             │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 10. Open Questions

| # | Question | Status |
|---|----------|--------|
| 1 | Should teachers be able to see results from other teachers' sessions in shared classes? | **Answered: No** - Teachers see only their own sessions |
| 2 | What happens if a student is removed from a class? Should their history be deleted? | **Pending** - Recommend: Keep history, just remove enrollment |
| 3 | Should there be a "forgot which class" feature for students? | **Pending** - Could show all enrolled classes on dashboard |
| 4 | Rate limiting for invitation codes? | **Pending** - Recommend: Max 10 active invites per Super Admin |
| 5 | Should anonymous guest names be validated for duplicates? | **Pending** - Current behavior already handles this |

---

## 11. Implementation Phases

### Phase 1: Authentication Foundation
- [ ] Set up Firebase Auth with Google provider
- [ ] Create `AuthContext` and `useAuth` hook
- [ ] Create `users/{uid}` on first sign-in
- [ ] Implement Super Admin detection via email
- [ ] Update `PrivateRoute` to use Firebase Auth

### Phase 2: Teacher Invitation System
- [ ] Create `teacher_invites` collection
- [ ] Build invitation generation UI for Super Admin
- [ ] Build invitation redemption flow for teachers
- [ ] Set up Firebase Custom Claims for roles

### Phase 3: Content Ownership Migration
- [ ] Add `ownerId` and `isPublic` to quiz/test schemas
- [ ] Create migration script for existing content
- [ ] Update TeacherLobbyPage to filter by ownership
- [ ] Add "Make Public" toggle to content editor

### Phase 4: Class System Enhancement
- [ ] Extend existing `classManager.ts` with new features
- [ ] Add `allowSelfStudy` settings
- [ ] Build class management UI for teachers
- [ ] Build class enrollment UI for students

### Phase 5: Student Dashboard
- [ ] Create Student Dashboard page
- [ ] Implement class selection and session list
- [ ] Build test history view
- [ ] Implement self-study access

### Phase 6: Session Enhancements
- [ ] Add `allowAnonymous` to session creation
- [ ] Generate guest links and QR codes
- [ ] Create `/guest/:sessionCode` route
- [ ] Link player records to user accounts

### Phase 7: Teacher Results Page
- [ ] Create dedicated Results page
- [ ] Add menu navigation
- [ ] Implement filtering and search
- [ ] Add CSV export functionality

---

## 12. Appendix

### A. Permission Matrix

| Action | Super Admin | Teacher | Student | Guest |
|--------|-------------|---------|---------|-------|
| **Account Management** |
| Create teacher accounts | ✅ | ❌ | ❌ | ❌ |
| Disable/enable accounts | ✅ | ❌ | ❌ | ❌ |
| View all users | ✅ | ❌ | ❌ | ❌ |
| **Content Management** |
| View all content | ✅ | ❌ | ❌ | ❌ |
| Create quizzes/tests | ✅ | ✅ | ❌ | ❌ |
| Edit own quizzes/tests | ✅ | ✅ | ❌ | ❌ |
| Delete own quizzes/tests | ✅ | ✅ | ❌ | ❌ |
| Make content public | ✅ | ✅ | ❌ | ❌ |
| View public content | ✅ | ✅ | ❌ | ❌ |
| **Class Management** |
| Create classes | ✅ | ✅ | ❌ | ❌ |
| Manage own classes | ✅ | ✅ | ❌ | ❌ |
| View all classes | ✅ | ❌ | ❌ | ❌ |
| Join class (with code) | ❌ | ❌ | ✅ | ❌ |
| **Session Management** |
| Create sessions | ✅ | ✅ | ❌ | ❌ |
| Monitor sessions | ✅ | ✅ (own) | ❌ | ❌ |
| View session results | ✅ | ✅ (own) | ❌ | ❌ |
| **Participation** |
| Join sessions | ❌ | ❌ | ✅ | ⚠️ |
| Take tests/quizzes | ❌ | ❌ | ✅ | ⚠️ |
| View own history | ❌ | ❌ | ✅ | ❌ |

*⚠️ = Only if session has `allowAnonymous: true`*

### B. Database Indexes Required

```javascript
// Firebase Realtime Database Rules
{
  "rules": {
    "users": {
      ".indexOn": ["role", "email", "createdAt"]
    },
    "classes": {
      ".indexOn": ["teacherId", "status", "createdAt"]
    },
    "quizzes": {
      ".indexOn": ["ownerId", "isPublic", "createdAt"]
    },
    "tests": {
      ".indexOn": ["ownerId", "isPublic", "createdAt"]
    },
    "game_sessions": {
      ".indexOn": ["teacherId", "classId", "status", "createdAt"]
    },
    "student_history": {
      "$uid": {
        ".indexOn": ["completedAt", "classId"]
      }
    }
  }
}
```

---

**END OF PRD**

---

*This document requires user approval before implementation begins.*
