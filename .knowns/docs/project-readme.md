---
title: Project README
createdAt: '2026-02-27T15:25:16.583Z'
updatedAt: '2026-07-07T16:20:00.000Z'
description: 'Main project README with overview, setup instructions, and architecture'
tags:
  - overview
  - setup
  - architecture
---
# Documentation

This folder contains all the documentation for the project.

## Latest Updates

*   **[July 7, 2026 - Firebase Hosting And Worker Endpoint Policy](./architecture/firebase-hosting-worker-endpoint-policy.md)** - Firebase Hosting serves the app; Listening/R2 upload, authoring, and delivery calls use the deployed `r2-upload-signer` Worker, with no browser fallback to `localhost:8787`.
*   **[July 5, 2026 - Retired Features Current State](./architecture/retired-features-current-state.md)** - Current authority for retired Google Drive support, Reading V1, and Quiz. Active product flows use R2, Reading V2, test/Listening/Writing/THCS paths, retained academic results, and retirement notices where applicable.
*   **[November 11, 2025 - Text Highlighter Bug Fix](./SOP/0031-text-highlighter-bug-fix-nov11.md)** - Fixed critical bug where highlighting text above previous highlights failed. Changed from DOM path-based to character position-based approach for reliable sorting and rendering.
*   **[November 11, 2025 - Comprehensive Development Session](./SOP/0023-november-11-2025-comprehensive-session.md)** - Historical record containing obsolete Google Drive OAuth2 work; current uploads are R2-only.
*   **[November 7, 2025 - UI Enhancements and Quiz Creation Improvements](./SOP/0021-ui-enhancements-and-quiz-creation-improvements-nov-7-2025.md)** - Inline add question flow, passage panel fixes, toolbar redesign, and skip passages feature
*   **[November 7, 2025 - Matching Questions Answer Key & Validation Fixes](./SOP/0020-matching-questions-answer-key-and-validation-fixes-nov-7-2025.md)** - Fixed Edit Quiz validation to support both matching question formats and added debug logging for answer key merging
*   **[November 6, 2025 - IELTS Matching Questions and Display Fixes](./SOP/0019-ielts-matching-questions-and-display-fixes-nov-6-2025.md)** - Fixed matching question display errors and added question number prefixes to teacher view

## System

This section describes the current state of the system.

*   [Current - Retired Features Current State](./architecture/retired-features-current-state.md)
*   [0000 - Project Setup](./system/0000-project-setup.md)
*   [0001 - System Overview](./system/0001-system-overview.md)
*   [0002 - Quiz JSON Schema](./system/0002-quiz-json-schema.md) — historical/obsolete; Quiz is retired.
*   [0003 - Application Flow](./system/0003-application-flow.md)
*   [0004 - Student Interface Architecture](./system/0004-student-interface-architecture.md)
*   [0005 - Quiz Editor Architecture](./system/0005-quiz-editor-architecture.md) — historical/obsolete; Quiz editor/runtime is retired.
*   [0006 - Quiz Editor Inline Editing System](./system/0006-quiz-editor-inline-editing-system.md) — historical/obsolete; Quiz editor/runtime is retired.
*   [0007 - Mobile Compatibility Architecture](./system/0007-mobile-compatibility-architecture.md)
*   [0008 - Validation and Question Rendering](./system/0008-validation-and-question-rendering.md)
*   [0009 - Quiz Editor and Creation System](./system/0009-quiz-editor-and-creation-system.md) — historical/obsolete; Quiz editor/runtime is retired.
*   [0010 - Multi-Draft Management & Image Upload Systems](./system/0010-multi-draft-and-image-systems.md)
*   [0011 - Text Highlighter System](./system/0011-text-highlighter-system.md)

## Standard Operating Procedures (SOP)

This section provides best practices for executing certain tasks.

*   [0001 - Debugging Guide](./SOP/0001-debugging-guide.md)
*   [0002 - Development Workflows](./SOP/0002-development-workflows.md)
*   [0003 - PRD Implementation Audit Report](./SOP/0003-prd-implementation-audit-report.md)
*   [0004 - UAT Test Checklist](./SOP/0004-uat-test-checklist.md)
*   [0005 - PRD Compliance Fixes (2025-10-19)](./SOP/0005-prd-compliance-fixes-2025-10-19.md)
*   [0005 - PRD Compliance Retrospective](./SOP/0005-prd-compliance-retrospective.md)
*   [0006 - Session Retrospective (2025-10-20)](./SOP/0006-session-retrospective-2025-10-20.md)
*   [0007 - Timer Bug Fix Retrospective](./SOP/0007-timer-bug-fix-retrospective.md)
*   [0008 - Adaptive Layout Implementation Summary](./SOP/0008-adaptive-layout-implementation-summary.md)
*   [0009 - Session Retrospective (2025-10-22)](./SOP/0009-session-retrospective-2025-10-22.md)
*   [0010 - Two-Modal Quiz Editor Implementation](./SOP/0010-two-modal-quiz-editor-implementation.md) — historical/obsolete; Quiz editor/runtime is retired.
*   [0011 - Quiz Editor Enhancements (2025-10-23)](./SOP/0011-quiz-editor-enhancements-oct-23-2025.md) — historical/obsolete; Quiz editor/runtime is retired.
*   [0014 - Mobile Answer Capture Fix (2025-10-23)](./SOP/0014-mobile-answer-capture-fix-oct-23-2025.md)
*   [0018 - True/False/Yes/No/Not Given Implementation](./SOP/0018-true-false-yes-no-not-given-implementation.md)
*   [0019 - IELTS Matching Questions and Display Fixes (2025-11-06)](./SOP/0019-ielts-matching-questions-and-display-fixes-nov-6-2025.md)
*   [0020 - Matching Questions Answer Key & Validation Fixes (2025-11-07)](./SOP/0020-matching-questions-answer-key-and-validation-fixes-nov-7-2025.md)
*   [0021 - UI Enhancements and Quiz Creation Improvements (2025-11-07)](./SOP/0021-ui-enhancements-and-quiz-creation-improvements-nov-7-2025.md)
*   [0023 - Comprehensive Development Session (2025-11-11)](./SOP/0023-november-11-2025-comprehensive-session.md)
*   [0031 - Text Highlighter Bug Fix (2025-11-11)](./SOP/0031-text-highlighter-bug-fix-nov11.md)
*   [2025-10-20 - Retrospective Bug Fixes and Refactoring](./SOP/2025-10-20-retrospective-bug-fixes-and-refactoring.md)
*   **[File Upload Patterns & R2 Storage Strategy](./sop/file-upload-patterns-r2-storage.md)** ⚡ NEW - Critical guide for temp vs permanent storage decisions


## Tasks & PRDs

This section contains the Product Requirements Documents (PRDs) and implementation plans for each feature.

*   [0001 - PRD: Interactive Learning App](./tasks/0001-prd-interactive-learning-app.md)
*   [0002 - Phase 2: Enhancement Roadmap](./tasks/0002-phase-2-enhancement-roadmap.md)
*   [0002 - PRD Deviation Adjustment Plan](./prd/0002-prd-deviation-adjustment-plan.md)
*   [0003 - Phase 3: Enhancement Roadmap](./tasks/0003-phase-3-enhancement-roadmap.md)
*   [0003 - Task List PRD Compliance](./prd/0003-task-list-prd-compliance.md)
*   [0004 - PRD: Two-Modal Quiz Editor System](./prd/0004-prd-two-modal-quiz-editor-system.md) — obsolete; Quiz editor/runtime is retired.
*   [Task List for PRD 0004](./tasks/tasks-0004-prd-two-modal-quiz-editor-system.md)
*   [0004 - PRD: Teacher Interface Enhancement](./tasks/0004-prd-teacher-interface-enhancement.md)
*   [0005 - PRD: Theme Selection](./tasks/0005-prd-theme-selection.md)
*   [Create PRD](./tasks/create-prd.md)
*   [Generate Tasks](./tasks/generate-tasks.md)
*   [Phase 2 Task List](./tasks/phase-2-task-list.md)
*   [Process Task List](./tasks/process-task-list.md)
*   [Task List for PRD 0001](./tasks/tasks-0001-prd-interactive-learning-app.md)
*   [Task List for PRD 0005](./tasks/tasks-0005-prd-theme-selection.md)
*   [Teacher Interface Task List](./tasks/teacher-interface-task-list.md)
*   [0014 - PRD: Student-Teacher Assignment & Course Management System](./tasks/tasks-0014-prd-student-teacher-assignment-and-course-system.md)
    *   [📊 Executive Summary](./EXECUTIVE_SUMMARY_COURSE_SYSTEM.md) - **START HERE**
    *   [Implementation Summary](./IMPLEMENTATION_SUMMARY_COURSE_SYSTEM.md)
    *   [Deployment Readiness Report](./DEPLOYMENT_READINESS_REPORT.md)
    *   [Quick Reference Guide](./QUICK_REFERENCE_COURSE_SYSTEM.md)
    *   [System Architecture](./SYSTEM_ARCHITECTURE.md)
    *   [Session Log (2026-01-30)](./conversation_2026-01-30_log.md)
*   **[0016 - PRD: Solo Study & Homework System](./tasks/0016-prd-solo-study-homework-system.md)** ✨
    *   [📋 Task List (72 tasks)](./tasks/tasks-0016-prd-solo-study-homework-system.md)
    *   Enables asynchronous learning: Self-Study + Homework modes
    *   Event-based result tracking with context labels
    *   Teacher homework assignment with configurable settings
    *   Student library for self-directed practice
    *   [Session Log (2026-02-03)](./conversation_2026-02-03_log.md)
*   **[0018 - PRD: Unified Audio Architecture](./tasks/0018-prd-unified-audio-architecture.md)** ✨ NEW
    *   [📋 Task List (104 sub-tasks)](./tasks/tasks-0018-prd-unified-audio-architecture.md)
    *   Unified `masterAudioState` replaces fragmented `audioCommand` system
    *   Online Class mode: Teacher + student audio sync (<1s drift)
    *   Offline Class mode: Teacher-only audio, student progress bar
    *   Headphone permission system for offline classrooms
    *   Historical Google Drive removal plan; Google Drive is now fully obsolete
    *   Solo practice integration with PRD-0016

## Feature Documentation

This section contains detailed documentation for major features and implementations.

*   [Student Quiz Redesign](./student-quiz-redesign.md) — historical/obsolete; dedicated Quiz URLs now show a retirement notice.
*   [Session Management Fixes](./session-management-fixes.md)
*   [Feedback Timing Fix](./feedback-timing-fix.md)

## Testing

This section contains documentation related to testing.

*   [Cross-Browser Testing Checklist](./testing/cross-browser-testing-checklist.md)

## Session Retrospectives

> **Update Note (2025-10-20):** This section is now obsolete. Session retrospectives are now considered a part of the Standard Operating Procedures (SOPs) and are located in the `/sop` directory. Please refer to the SOP section for the latest retrospectives.
