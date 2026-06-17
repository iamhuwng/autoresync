# IELTS Assignment Legacy Removal Notes

Date: 2026-06-18

## Why This Exists

Teacher Lobby assignment now has a temporary compatibility bridge for legacy IELTS Reading V1 and current IELTS Listening rows. Some live rows do not carry stable assignment metadata such as `testType: 'IELTS'`, `hasStudentSafeProjection`, or `deliveryProjectionReady`, even when a real student-safe payload exists.

## Keep During Current Patch

- Legacy IELTS Reading V1 and IELTS Listening rows may be recognized by `skill: 'Reading'` or `skill: 'Listening'`.
- My Content probes `student_safe_tests/{testId}` before marking those rows assignment-ready.
- Rows without a real safe projection must remain blocked.
- Worker validation must continue to require real safe student content.

## Remove After Reading V1 Retirement

- Remove legacy Reading V1 fallback probing from `src/services/firebaseQueryOptimizer.js`.
- Remove Reading V1-specific tests that only exist to support thin `/tests` rows without full metadata.
- Keep Reading V2 canonical Teacher Lobby hydration through `reading_v2/relationship_indexes/teacher-lobby`.

## Listening System A Migration Reminder

IELTS Listening still lacks the unified System A shape used by Reading V2:

- canonical material metadata
- relationship indexes for Teacher Lobby
- versioned student-safe projection path
- producer-written assignment readiness metadata

When Listening is upgraded, move it to the same canonical projection pattern instead of expanding legacy `student_safe_tests/{testId}` special cases.
