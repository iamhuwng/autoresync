# PRD-0014: Student-Teacher Assignment & Course Management System

**Created:** 2026-01-30
**Status:** Draft
**Author:** AI Assistant (based on user requirements)

---

## 1. Introduction/Overview

This PRD defines a comprehensive system for managing student-teacher relationships and course administration in the educational platform. The system enables:

1. **Super Admins** to assign students to specific teachers
2. **Teachers** to create and manage courses with structured modules
3. **Students** to access courses and materials assigned by their teachers

### Problem Statement
Currently, teachers see all users in User Management. There's no mechanism to:
- Assign specific students to specific teachers
- Create structured courses with time-bound access
- Manage materials across multiple courses and classes

### Solution
A multi-phase system that introduces:
- Student-Teacher assignment (Super Admin controlled)
- Course creation and management
- Module-based content organization
- Time-bound course-class linking

---

## 2. Goals

| Goal | Metric |
|------|--------|
| Enable targeted student management | Teachers only see their assigned students |
| Structured course delivery | Courses with modules, duration, and enrollment tracking |
| Flexible material management | Materials reusable across multiple courses |
| Time-bound access control | Automatic course expiration per class |
| Scalable administration | Super admin can manage all users and courses |

---

## 3. User Stories

### Super Admin
- As a super admin, I want to assign students to teachers so that teachers only manage their designated students.
- As a super admin, I want to view and manage all courses across all teachers for oversight.
- As a super admin, I want to approve teacher requests for new students or course types.

### Teacher
- As a teacher, I want to see only students assigned to me in my "Students" page.
- As a teacher, I want to create courses with modules and add materials (tests/quizzes) to them.
- As a teacher, I want to link courses to my classes with automatic expiration.
- As a teacher, I want to request specific students from the super admin.
- As a teacher, I want to release students I no longer work with.

### Student
- As a student, I want to see all teachers I'm assigned to in my dashboard.
- As a student, I want to see all courses I'm enrolled in with progress tracking.
- As a student, I want to browse and join public courses from the course catalog.

---

## 4. Functional Requirements

### Phase 1: Student-Teacher Assignment System

#### 4.1 Super Admin - Student Assignment

| ID | Requirement |
|----|-------------|
| 4.1.1 | Super admin can assign multiple students to one teacher |
| 4.1.2 | Super admin can assign one student to multiple teachers |
| 4.1.3 | Assignment includes optional course enrollment selection |
| 4.1.4 | Assignment history tracked in student profile (separate tab) |
| 4.1.5 | Assignment history tracked in teacher profile (separate tab) |
| 4.1.6 | Track: teacher/student name, assignment date, assigned by, unassignment date (if applicable), courses enrolled |
| 4.1.7 | Teachers and students receive in-app notification when assignment is made |

#### 4.2 Super Admin - User Management Page Updates

| ID | Requirement |
|----|-------------|
| 4.2.1 | Display "Assigned To" column for students (shows teacher names) |
| 4.2.2 | Display "Students" column for teachers (shows count/list) |
| 4.2.3 | Click student row → "Assign to Teacher" button → Select teacher + optional courses |
| 4.2.4 | Click teacher row → "Assign Students" button → Select students + optional courses |
| 4.2.5 | Filter: "Assigned" / "Unassigned" students |
| 4.2.6 | Color coding: Green = assigned, Gray = unassigned |
| 4.2.7 | Warning alert for unassigned students (informational) |
| 4.2.8 | Statistics display (e.g., "Teacher A has 45 students") |

#### 4.3 Teacher - Students Page

| ID | Requirement |
|----|-------------|
| 4.3.1 | Renamed from "User Management" to "Students" in Teacher Lobby ✅ (Already implemented) |
| 4.3.2 | Show ONLY students assigned to this teacher by super admin |
| 4.3.3 | Show assigned students with ability to add to classes |
| 4.3.4 | Show student progress/test history |
| 4.3.5 | Request more students: Enter student email → Super admin gets notification → Approves/Denies |
| 4.3.6 | After approval, student is automatically assigned (notification sent to teacher) |
| 4.3.7 | Release student: System asks "Also unenroll from your courses?" → Shows course list to select |
| 4.3.8 | If released student's only teacher, student becomes "unassigned" |

#### 4.4 Student Dashboard Updates

| ID | Requirement |
|----|-------------|
| 4.4.1 | Show "Your Teachers" section with list of assigned teachers |
| 4.4.2 | Format: "Math: Teacher A | Science: Teacher B | English: Teacher C" (if roles exist) |
| 4.4.3 | Fallback: "Your Teachers: Teacher A, Teacher B, Teacher C" |

#### 4.5 Unassigned Student Behavior

| ID | Requirement |
|----|-------------|
| 4.5.1 | Unassigned students can still participate in public sessions |
| 4.5.2 | Unassigned students can join public courses from catalog |
| 4.5.3 | Super admin sees warning for unassigned students in User Management |

---

### Phase 2: Course Management System

#### 4.6 Course Creation & Dashboard

| ID | Requirement |
|----|-------------|
| 4.6.1 | "Courses" tab in Teacher Lobby header (new navigation item) |
| 4.6.2 | Course Dashboard shows list of teacher's courses |
| 4.6.3 | Filter options: by type, status, date |
| 4.6.4 | Each course card shows: name, student count, material count, creation date |
| 4.6.5 | Actions: Edit, Remove, View Course Profile |
| 4.6.6 | "Add Course" button opens course creation form |

#### 4.7 Course Fields

| ID | Field | Required | Description |
|----|-------|----------|-------------|
| 4.7.1 | Course Name | Yes | Display name of the course |
| 4.7.2 | Course Type | Yes | Dropdown: IELTS, THCS, THPT, TOEIC, etc. + "Request new type..." |
| 4.7.3 | Course Code | Auto | Format: `[TYPE]-[YYYYMMDD]-[HHMM]` (e.g., `IELTS-20260130-1430`) |
| 4.7.4 | | | Hand-editable with "Edit" button |
| 4.7.5 | | | Must be unique across entire system |
| 4.7.6 | | | Must start with course type prefix |
| 4.7.7 | Date Created | Auto | System-generated |
| 4.7.8 | Duration | Yes | Days, Months, Years fields (course access period) |
| 4.7.9 | Entrance Requirements | Optional | Level: A1-C2, IELTS: 4-7 (informational only) |
| 4.7.10 | Graduate Target | Optional | Level: B1-C2, IELTS: 5-8 (informational only) |
| 4.7.11 | Note | Optional | Private notes (only creator can edit) |
| 4.7.12 | Visibility | Yes | Private / Protected / Public |

#### 4.8 Course Visibility Levels

| Level | Description |
|-------|-------------|
| Private | Students can request to join (teacher approves) |
| Protected | Course code required + teacher approval |
| Public | Listed in Course Catalog, student can request to join with filters |

#### 4.9 Course Type Management

| ID | Requirement |
|----|-------------|
| 4.9.1 | Teachers can request new types via dropdown "Request new type..." option |
| 4.9.2 | Request form opens when selected |
| 4.9.3 | Super admin sees requests in notification + Admin Settings → Course Types → Pending tab |
| 4.9.4 | Super admin can approve for requesting teacher only OR for all teachers |
| 4.9.5 | Requesting teacher receives notification upon approval |
| 4.9.6 | Teacher cannot create course until type is approved |

---

### Phase 3: Module & Material Management

#### 4.10 Module System

| ID | Requirement |
|----|-------------|
| 4.10.1 | Courses contain modules (units) |
| 4.10.2 | Modules can be created first, then materials added |
| 4.10.3 | OR materials can be added first, then grouped into modules |
| 4.10.4 | Each module has: Name, Order, Access Type |
| 4.10.5 | Access Types: "Open Access" (immediately visible) or "Sequential" (locked until teacher marks complete) |

#### 4.11 Sequential Module Behavior

| ID | Requirement |
|----|-------------|
| 4.11.1 | Sequential modules show materials as "locked" to students |
| 4.11.2 | Teacher can still start sessions from locked module materials |
| 4.11.3 | Teacher marks module complete for entire class (not individual students) |
| 4.11.4 | Location: Class Profile → Courses tab → Select course → "Mark Module X Complete" |
| 4.11.5 | After marked complete, students can access materials for self-revision |
| 4.11.6 | New students joining class inherit class progress (all unlocked modules accessible) |
| 4.11.7 | Teacher can unlock modules in any order (not strictly sequential) |

#### 4.12 Material Management

| ID | Requirement |
|----|-------------|
| 4.12.1 | Materials = Tests/Quizzes (independent entities) |
| 4.12.2 | Materials can be linked to multiple courses/modules |
| 4.12.3 | Private materials: Teacher owns, super admin can override |
| 4.12.4 | Public materials: Shown in "Public Library" in Teacher Lobby |

#### 4.13 Material Ownership & Copying

| ID | Requirement |
|----|-------------|
| 4.13.1 | Own materials: COPIED when added to course (independent version) |
| 4.13.2 | Public materials: LINKED (reference to original in Public Library) |
| 4.13.3 | Copied materials keep original version |
| 4.13.4 | "Sync with original" button to update copied material |

#### 4.14 Public Material Access Loss

| ID | Requirement |
|----|-------------|
| 4.14.1 | If owner makes linked public material private, courses linking to it lose access |
| 4.14.2 | Teacher must remove or replace the material |
| 4.14.3 | Notification sent to affected teachers |

#### 4.15 Material Profile Page

| ID | Field |
|----|-------|
| 4.15.1 | Test Title |
| 4.15.2 | Test Type (IELTS, THCS, THPT, etc.) |
| 4.15.3 | Skill (Reading, Listening, etc.) |
| 4.15.4 | Duration (minutes) |
| 4.15.5 | Difficulty |
| 4.15.6 | Description (Optional) |
| 4.15.7 | Target Band (Optional) |
| 4.15.8 | Estimated Score Range (Optional) |
| 4.15.9 | Created by (owner) |
| 4.15.10 | Created date |
| 4.15.11 | Is Public (yes/no) |

#### 4.16 Material Profile Editing

| ID | Requirement |
|----|-------------|
| 4.16.1 | Owner can edit Material Profile |
| 4.16.2 | Super admin can edit any Material Profile |

#### 4.17 Course Materials Tab UI

| ID | Requirement |
|----|-------------|
| 4.17.1 | Materials grouped by module (expandable sections) |
| 4.17.2 | Drag-and-drop to reorder materials within/between modules |
| 4.17.3 | Click material name → Navigate to Material Profile |
| 4.17.4 | "Add Material" button: Select from teacher's own materials |

---

### Phase 4: Course-Class Linking & Enrollment

#### 4.18 Course-Class Linking

| ID | Requirement |
|----|-------------|
| 4.18.1 | Courses are COPIED when linked to a class |
| 4.18.2 | Each class gets independent course copy |
| 4.18.3 | Course duration starts when linked to class |
| 4.18.4 | Example: 1-month course linked March 1 → expires April 1 for that class |
| 4.18.5 | Same course linked to different classes have independent expirations |
| 4.18.6 | "Sync with original" option to update class's course copy |

#### 4.19 Automatic Course Linking

| ID | Requirement |
|----|-------------|
| 4.19.1 | Class can be "linked" to course (permanent connection) |
| 4.19.2 | New students joining linked class are AUTO-enrolled in course |
| 4.19.3 | A class can be linked to multiple courses simultaneously |

#### 4.20 Course Expiration

| ID | Requirement |
|----|-------------|
| 4.20.1 | When course expires for a class, class loses access to materials |
| 4.20.2 | Course remains in system for reuse with other classes |
| 4.20.3 | Teacher notified 7 days before expiration (with option to extend) |
| 4.20.4 | Teacher can extend by adding X days/months to expiration |
| 4.20.5 | Extension only affects specific class, not original course duration |
| 4.20.6 | Cannot extend after expiration - must re-link (creates new enrollment) |

#### 4.21 Course Re-Linking

| ID | Requirement |
|----|-------------|
| 4.21.1 | Teacher can re-link expired course to same class |
| 4.21.2 | Creates new enrollment with fresh duration |
| 4.21.3 | Teacher chooses: "Continue progress" or "Reset progress" |

#### 4.22 Student Multi-Enrollment Tracking

| ID | Requirement |
|----|-------------|
| 4.22.1 | Student can have multiple enrollments in same course (via different classes) |
| 4.22.2 | Each enrollment tracked separately with own expiration |
| 4.22.3 | Student retains access until ALL enrollments expire |
| 4.22.4 | Enrollment table tracks: Student, Course, Enrollment Date, Expiration, Source Class |

#### 4.23 Class Profile - Courses Tab

| ID | Requirement |
|----|-------------|
| 4.23.1 | Shows linked courses + individual student enrollments |
| 4.23.2 | Actions: Link/unlink courses |
| 4.23.3 | Mark module completion for class |

---

### Phase 5: Student Course Experience

#### 4.24 Student "My Courses" Dashboard

| ID | Requirement |
|----|-------------|
| 4.24.1 | Show all enrolled courses (active + expired + archived) |
| 4.24.2 | Completion percentage per course (X/Y materials completed) |
| 4.24.3 | Filter by: Active, Expired, Archived |
| 4.24.4 | Cannot unenroll from private/protected courses (teacher controls) |
| 4.24.5 | Can freely unenroll from public courses |
| 4.24.6 | Can REQUEST to unenroll from protected courses (teacher approves) |

#### 4.25 Course Catalog (Public Courses)

| ID | Requirement |
|----|-------------|
| 4.25.1 | Students can browse public courses |
| 4.25.2 | Search/filter by: Type, Level (A1-C2), Teacher name, Duration |
| 4.25.3 | Course details visible (overview only, materials hidden) |
| 4.25.4 | Click "Request to Join" → Teacher approves |
| 4.25.5 | Students can join public courses regardless of teacher assignment |

#### 4.26 Protected Course Enrollment

| ID | Requirement |
|----|-------------|
| 4.26.1 | Student enters course code → Request sent to teacher |
| 4.26.2 | Teacher sees request in notification + Course Profile → Pending Requests tab |
| 4.26.3 | Teacher can enable "Auto-approve students with course code" |
| 4.26.4 | Requests auto-reject after 7 days if no response |
| 4.26.5 | Student can re-request after rejection/expiration |
| 4.26.6 | Student can cancel pending request |

#### 4.27 Unenroll Requests (Protected Courses)

| ID | Requirement |
|----|-------------|
| 4.27.1 | Student requests to unenroll → Goes to same Pending Requests tab |
| 4.27.2 | Teacher approves/denies unenrollment |

---

### Phase 6: Session & Results Integration

#### 4.28 Session Course Context

| ID | Requirement |
|----|-------------|
| 4.28.1 | When teacher starts session from Course → Materials tab, session is tagged with course |
| 4.28.2 | Session results save course context in metadata |
| 4.28.3 | Sessions are independent (no course progress tracking beyond results) |

#### 4.29 Locked Module Session

| ID | Requirement |
|----|-------------|
| 4.29.1 | Teacher can start session from locked module material |
| 4.29.2 | Default: Only students in linked class can join |
| 4.29.3 | Teacher can override to "Open to all" in session settings |

#### 4.30 Student Result Profile

| ID | Requirement |
|----|-------------|
| 4.30.1 | Results saved independently in student profile |
| 4.30.2 | Result metadata includes: Course name, Class name, Material name, Session ID |
| 4.30.3 | Group/filter by: Course, Class, Material, Date range |
| 4.30.4 | Compare with course average |
| 4.30.5 | Course/material deletion doesn't affect saved results |
| 4.30.6 | Results show original course/material names (no "[Deleted]" marking) |

---

### Phase 7: Course Announcements & Notifications

#### 4.31 Course Announcements

| ID | Requirement |
|----|-------------|
| 4.31.1 | Teachers can send announcements to course students |
| 4.31.2 | Teacher selects which class(es) to send to (own students only) |
| 4.31.3 | Announcement supports: Rich text (formatting, links, images) + attachments (PDFs, documents) |
| 4.31.4 | Delivery: In-app notification only |

---

### Phase 8: Course Deletion & Archival

#### 4.32 Course Deletion

| ID | Requirement |
|----|-------------|
| 4.32.1 | Soft delete: Course archived (read-only) |
| 4.32.2 | Cannot delete if students enrolled (must remove all first) |
| 4.32.3 | Archived course visible in teacher's "Archived" tab |
| 4.32.4 | Teacher can restore within 30 days |
| 4.32.5 | Hard delete after 30 days |
| 4.32.6 | Teacher + super admin notified 7 days before hard delete (in-app) |

#### 4.33 Archival Behavior

| ID | Requirement |
|----|-------------|
| 4.33.1 | Students immediately lose access when course archived |
| 4.33.2 | Students notified with teacher's explanation (optional field) |
| 4.33.3 | Restored course: Enrollments cleared, fresh start |
| 4.33.4 | Student results preserved in their own profiles |

---

### Phase 9: Super Admin Course Management

#### 4.34 Super Admin Course Oversight

| ID | Requirement |
|----|-------------|
| 4.34.1 | View all courses across all teachers (read + edit + delete) |
| 4.34.2 | Assign students to any course |
| 4.34.3 | Analytics dashboard: Most popular courses by enrollment |

---

## 5. Non-Goals (Out of Scope)

| Item | Reason |
|------|--------|
| Course completion certificates | Future enhancement |
| Automated entrance requirement enforcement | Requirements are informational only |
| Course ratings/reviews | Not needed for initial release |
| Teacher performance analytics | Future phase |
| Hard limits on student/teacher counts | Show statistics only, no enforcement |
| Material scheduling within modules | Simplified to module-level unlock only |
| Assignment metadata (subject/course/role) | Keep simple, add relationship with materials later |
| Bulk assignment via CSV | Future enhancement |

---

## 6. Design Considerations

### Navigation Updates

**Teacher Lobby Header:**
```
👥 Students | 🏫 Classes | 📚 Courses | 📊 Sessions | Logout
```

**Super Admin:**
- All existing User Management features
- Plus: Assignment column, filter, statistics
- Plus: Course Types management

### Color Coding
- **Green:** Assigned students
- **Gray:** Unassigned students

### Status Indicators
- Course visibility badges (Private/Protected/Public)
- Module lock icons
- Enrollment expiration warnings (7 days before)

---

## 7. Technical Considerations

### New Data Entities

```
StudentTeacherAssignment
├── studentId
├── teacherId
├── assignedBy (super admin)
├── assignedAt
├── unassignedAt (nullable)
└── coursesEnrolled[]

Course
├── id
├── name
├── code (unique)
├── type
├── ownerId (teacher)
├── duration (days/months/years)
├── visibility (private/protected/public)
├── entranceRequirements (informational)
├── graduateTarget (informational)
├── note
├── createdAt
├── archivedAt (nullable)
└── hardDeleteAt (nullable)

Module
├── id
├── courseId
├── name
├── order
├── accessType (open/sequential)
└── materials[] (references)

CourseMaterial (junction)
├── courseId
├── moduleId
├── materialId
├── order
├── isCopy (boolean)
├── syncedAt (for copies)
└── originalMaterialId (for copies)

ClassCourseLink
├── classId
├── courseId (copy)
├── originalCourseId
├── linkedAt
├── expiresAt
└── isAutoEnroll (boolean)

CourseEnrollment
├── studentId
├── courseId
├── enrollmentType (class-based/individual)
├── sourceClassId (nullable)
├── enrolledAt
└── expiresAt

CourseRequest (joins)
├── studentId
├── courseId
├── type (join/unenroll)
├── requestedAt
├── expiresAt (7 days)
├── status (pending/approved/denied/expired)
└── respondedAt

CourseTypeRequest
├── teacherId
├── typeName
├── requestedAt
├── status
├── approvedFor (teacher-only/all)
└── approvedBy

CourseAnnouncement
├── courseId
├── targetClassIds[]
├── content (rich text)
├── attachments[]
└── createdAt
```

### Integration Points
- Firebase Realtime Database for real-time updates
- Existing Session system for course-tagged sessions
- Existing Results system for course-context metadata
- Notification system for in-app notifications

---

## 8. Success Metrics

| Metric | Target |
|--------|--------|
| Teachers using assigned students view | 100% adoption |
| Courses created per teacher | Average 3+ courses within 3 months |
| Student course enrollment | 90% of active students enrolled in 1+ course |
| Course completion rate | Trackable (baseline establishment) |
| Assignment request approval time | < 24 hours average |

---

## 9. Open Questions

| # | Question | Priority | Status |
|---|----------|----------|--------|
| 1 | Should there be a public course "Featured" section curated by super admin? | Low | Deferred |
| 2 | Should teachers be able to duplicate/clone entire courses? | Medium | Future enhancement |
| 3 | Should there be course templates for common structures? | Low | Deferred |
| 4 | What happens to course copy when original is deleted? | Medium | Keep copy as-is |
| 5 | Should module completion trigger any automated actions? | Low | Deferred |

---

## 10. Implementation Phases

### Phase 1: Student-Teacher Assignment (Priority: HIGH)
- Requirements: 4.1 - 4.5
- Estimated effort: 2-3 weeks

### Phase 2: Course Management (Priority: HIGH)
- Requirements: 4.6 - 4.9
- Estimated effort: 2-3 weeks

### Phase 3: Module & Material Management (Priority: HIGH)
- Requirements: 4.10 - 4.17
- Estimated effort: 3-4 weeks

### Phase 4: Course-Class Linking & Enrollment (Priority: HIGH)
- Requirements: 4.18 - 4.23
- Estimated effort: 2-3 weeks

### Phase 5: Student Course Experience (Priority: MEDIUM)
- Requirements: 4.24 - 4.27
- Estimated effort: 2 weeks

### Phase 6: Session & Results Integration (Priority: MEDIUM)
- Requirements: 4.28 - 4.30
- Estimated effort: 1-2 weeks

### Phase 7: Course Announcements (Priority: LOW)
- Requirements: 4.31
- Estimated effort: 1 week

### Phase 8: Course Deletion & Archival (Priority: LOW)
- Requirements: 4.32 - 4.33
- Estimated effort: 1 week

### Phase 9: Super Admin Course Management (Priority: MEDIUM)
- Requirements: 4.34
- Estimated effort: 1 week

**Total Estimated Effort: 15-20 weeks**

---

## Appendix A: Summary of All User Decisions

| Question | Decision |
|----------|----------|
| Multi-student per teacher | Yes |
| Multi-teacher per student | Yes |
| Teacher sees only assigned students | Yes |
| Assignment UI | Both student-based and teacher-based |
| Bulk assignment | Select multiple students → assign to one teacher |
| Assignment duration | Optional expiration date |
| Assignment history | Full tracking (who, when, courses) |
| Notifications | In-app for both teachers and students |
| Course creation | Teachers create own, super admin manages all |
| Course code format | TYPE-YYYYMMDD-HHMM (hand-editable) |
| Course duration | Per class-link (not global) |
| Course visibility | Private / Protected / Public |
| Course expiration behavior | Auto-remove from class, course remains |
| Module types | Open Access / Sequential (teacher-controlled unlock) |
| Material ownership | Own = copied, Public = linked |
| Material update | Sync with original option |
| Student course view | All courses (active + expired + archived) |
| Student unenroll | Free from public, request for protected, blocked for private |
| Session course context | Tagged when started from course |
| Results | Independent, course as metadata only |
| Course deletion | Soft delete, 30-day archive, hard delete |
| Super admin analytics | Most popular courses (basic) |

---

*End of PRD-0014*
