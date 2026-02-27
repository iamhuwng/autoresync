# Track Specification: Student-Teacher Assignment System (Phase 1)

## Overview
Implement the foundational student-teacher assignment system as defined in Phase 1 of PRD-0014. This system shifts the platform from an open user model to a managed relationship model where teachers are assigned specific students by Super Admins.

## Scope
- **Data Model:** Update Firebase schema to support StudentTeacherAssignment and history.
- **Super Admin UI:** Enhance User Management with assignment columns, buttons, and filters.
- **Teacher UI:** Update the "Students" page to show only assigned students and provide "Request/Release" functionality.
- **Student UI:** Add "Your Teachers" section to the student dashboard.
- **Notifications:** Implement in-app notifications for assignment changes.

## Functional Requirements (from PRD-0014)
- **Super Admin Assignment:** Multi-student to one teacher, one student to multi-teacher.
- **History Tracking:** Log all assignment/unassignment events with metadata.
- **UI Indicators:** Color-coded rows (Green/Gray), count badges, and statistics.
- **Teacher Controls:** Request student (email-based) and release student flow.
- **Student Visibility:** Dashboard list of assigned teachers with optional roles.

## Technical Constraints
- Must be backward compatible with existing session/results data.
- Ensure strict data isolation (Teachers only see assigned students).
- Maintain glassmorphic design consistency.
