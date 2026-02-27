# Implementation Plan - Student-Teacher Assignment (Phase 1)

## Phase 1: Database Schema & History Tracking
- [ ] Task: Update userService.ts or create ssignmentManager.ts to handle assignment data operations
    - [ ] Write Tests: Verify creation of StudentTeacherAssignment records
    - [ ] Implement: ssignStudentToTeacher and unassignStudent functions
- [ ] Task: Implement assignment history tracking in Firebase
    - [ ] Write Tests: Verify history logs are created correctly
    - [ ] Implement: Update assignment functions to append to history nodes
- [ ] Task: Conductor - User Manual Verification 'Phase 1: Database Schema & History Tracking' (Protocol in workflow.md)

## Phase 2: Super Admin User Management UI
- [ ] Task: Add \"Assigned To\" and \"Students\" columns to AdminUserManagementPage.jsx
    - [ ] Write Tests: Verify columns render with correct data
    - [ ] Implement: Data mapping for assignment columns
- [ ] Task: Implement \"Assign to Teacher\" and \"Assign Students\" modals
    - [ ] Write Tests: Verify modals open and submit correctly
    - [ ] Implement: Selection UI and submission logic
- [ ] Task: Add assignment filters and statistics to Super Admin toolbar
    - [ ] Write Tests: Verify filtering logic (Assigned/Unassigned)
    - [ ] Implement: Filter dropdowns and aggregate stats display
- [ ] Task: Conductor - User Manual Verification 'Phase 2: Super Admin User Management UI' (Protocol in workflow.md)

## Phase 3: Teacher Students Page & Controls
- [ ] Task: Update Teacher \"Students\" page to filter by assignment
    - [ ] Write Tests: Verify only assigned students are visible
    - [ ] Implement: Assignment-aware data fetching in TeacherLobbyPage
- [ ] Task: Implement \"Request Student\" flow
    - [ ] Write Tests: Verify request creation and notification
    - [ ] Implement: Email input modal and pending request logic
- [ ] Task: Implement \"Release Student\" flow with unenrollment options
    - [ ] Write Tests: Verify unassignment and course unenrollment logic
    - [ ] Implement: Release confirmation dialog
- [ ] Task: Conductor - User Manual Verification 'Phase 3: Teacher Students Page & Controls' (Protocol in workflow.md)

## Phase 4: Student Dashboard & Notifications
- [ ] Task: Update Student Dashboard with \"Your Teachers\" section
    - [ ] Write Tests: Verify teachers list renders correctly
    - [ ] Implement: YourTeachers component in StudentDashboardPage
- [ ] Task: Implement in-app notifications for assignment events
    - [ ] Write Tests: Verify notifications appear for both roles
    - [ ] Implement: Trigger notifications in assignment service
- [ ] Task: Conductor - User Manual Verification 'Phase 4: Student Dashboard & Notifications' (Protocol in workflow.md)
