---
title: Notification System
createdAt: '2026-02-27T17:02:37.381Z'
updatedAt: '2026-02-27T17:03:01.845Z'
description: >-
  In-app and email notifications: types, real-time listeners, preferences, RTDB
  paths.
tags:
  - architecture
  - notifications
  - realtime
  - student
  - teacher
---
# Notification System Architecture

## Overview

In-app notification system for students and teachers. Covers test results, homework assignments, class announcements, and system events. Uses Firebase RTDB for storage with real-time listeners.

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Components                            │
│  ├── NotificationBell.tsx    — Header bell icon + count  │
│  ├── NotificationPanel.tsx   — Dropdown notification list│
│  ├── NotificationSettingsModal.tsx — Preferences UI      │
│  └── NotificationPreferences.tsx  — Settings form        │
├─────────────────────────────────────────────────────────┤
│                    Services                              │
│  ├── notificationService.ts      — CRUD, mark read      │
│  ├── emailNotification.service.ts — Email notifications  │
│  └── deadlineReminderService.ts  — Homework reminders    │
├─────────────────────────────────────────────────────────┤
│                    Types                                  │
│  └── notification.types.ts       — Type definitions      │
├─────────────────────────────────────────────────────────┤
│                    RTDB                                   │
│  /notifications/{userId}/{notificationId}                │
│  /notification_preferences/{userId}                      │
└─────────────────────────────────────────────────────────┘
```

## Notification Types

| Type | Trigger | Recipient |
|------|---------|-----------|
| `test_result` | Test graded/auto-graded | Student |
| `homework_assigned` | Teacher creates homework | Students |
| `homework_due_soon` | 24h and 1h before deadline | Students |
| `homework_submitted` | Student submits homework | Student |
| `homework_graded` | Teacher grades manually | Student |
| `class_announcement` | Teacher posts announcement | Class students |
| `enrollment_approved` | Teacher approves request | Student |
| `enrollment_request` | Student requests to join | Teacher |
| `session_started` | Teacher starts live session | Class students |

## Real-Time Updates

- `NotificationBell` subscribes to Firebase RTDB listener on mount
- Unread count badge updates in real-time
- Uses `onValue()` listener on `/notifications/{userId}`
- Cleanup on unmount

## Email Notifications

- `emailNotification.service.ts` handles email delivery
- Triggered server-side (or via RTDB triggers)
- Users can configure preferences in `NotificationSettingsModal`

## RTDB Paths

```
/notifications/{userId}/{notificationId}/
  ├── type: string          — Notification type
  ├── title: string         — Display title
  ├── message: string       — Body text
  ├── read: boolean         — Read status
  ├── createdAt: number     — Timestamp
  ├── data: {}              — Extra payload (resultId, classId, etc.)
  └── actionUrl?: string    — Link to navigate to

/notification_preferences/{userId}/
  ├── email: boolean        — Receive email notifications
  ├── inApp: boolean        — Receive in-app notifications
  └── types: {}             — Per-type preferences
```

## Related Docs
- @doc/architecture/homework-solo-practice-architecture — Homework notifications
- @doc/architecture/student-experience-architecture — Student UX
- @doc/sop/student-ux-improvements — UX improvements to notifications
