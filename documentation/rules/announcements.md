# Announcement Safety Rules

> Rules for user-facing outcome messages after create, save, update, publish, assign, enroll, restore, archive, remove, delete, and similar state-changing workflows.
> **Load this file when:** adding or modifying user-facing success, failure, warning, or info announcements for tests, homework, Reading V2 masters/passages, students, courses/classes, books, or future material types.

---

## Rule 1 - Use The Shared Toast System

**Trigger:** Any workflow outcome that tells the user something was created, saved, updated, published, assigned, enrolled, restored, archived, removed, deleted, failed, blocked, or queued.

**Why it exists:**
One-off page banners and silent success states made material-removal workflows hard to confirm after a modal closed. Announcements must be consistent across material types and pages.

**The rule:**
Use the shared toast announcement system from `src/components/modern/ToastNotification.tsx`.

```tsx
import { toast } from '../components/modern';

toast.success('Removed "IELTS Cambridge 10 - Test 02: Reading". Linked Reading Passages were kept.');
toast.error('Could not remove this master test.');
toast.info('Saved draft.');
toast.warning('Some linked items need review.');
```

`ToastContainer` is mounted globally in `src/App.jsx`; do not mount duplicate page-level containers unless a test harness needs one.

**Required behavior:**
- success/info/warning announcements render with `role="status"` and polite live-region behavior
- failure announcements render with `role="alert"` and assertive live-region behavior
- announcement cards appear in the bottom-right corner
- announcement cards are rectangular and use an 8px maximum radius unless the shared design system changes
- announcements slowly fade/disappear after a readable duration
- announcements have a visible close button with accessible label `Dismiss announcement`

**Forbidden patterns:**
- `window.alert()`
- silent success after a state-changing action
- one-off success banners or inline notices for normal action outcomes
- page-local toast state when the shared `toast` API can express the outcome
- separate announcement UI for each material type

---

## Rule 2 - Announce The Real Outcome

**Trigger:** Any action with multiple possible outcomes, especially removal/archive/delete flows.

**The rule:**
Message text must match what happened in storage and permissions.

Examples:
- master-only removal: `Removed "Title". Linked Reading Passages were kept.`
- master plus owned linked passages: `Removed "Title". 2 linked Reading Passages were archived.`
- no linked items: `Removed "Title".`
- publish: `Published "Title". It is now visible in My Content.`
- failure: name the failed action and keep the message actionable

Do not say "deleted" when the implementation archives, removes from library, hides, soft-removes, or only removes a reference.

---

## Rule 3 - Keep Observability And Audit Separate

**Trigger:** Adding an announcement to a user-facing action handler.

**The rule:**
Announcements do not replace tracking or audit requirements.

Before finishing, verify:
1. the action is registered and tracked according to `documentation/rules/observability.md`
2. Reading V2 state-changing archive, restore, repair, remove, and duplicate-decision actions write required audit events according to `documentation/architecture/reading-v2-audit-trail.md`
3. the announcement message matches the durable outcome, not just the optimistic UI state

---

## Self-Check

- [ ] Did I use `toast.success`, `toast.error`, `toast.info`, `toast.warning`, or `toast.show` from the shared system?
- [ ] Is `ToastContainer` already mounted globally or mounted only inside a test harness?
- [ ] Does the message distinguish remove, archive, delete, restore, save, publish, assign, and enroll accurately?
- [ ] Does failure use an error announcement rather than silent console output?
- [ ] Did I keep feature tracking/audit writes intact?
- [ ] Did I add or update tests for the visible announcement and the underlying state change?
