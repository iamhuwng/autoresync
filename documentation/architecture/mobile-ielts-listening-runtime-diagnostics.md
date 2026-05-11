# Mobile IELTS Listening Runtime Diagnostics

Status: Active
Last Updated: 2026-05-12
Owner: Frontend Platform / IELTS Listening

## Purpose

Define how runtime diagnostics for the mobile IELTS Listening experience are collected without adding production load overhead on real phones.

## Problem Summary

During PRD-0045 hardening, diagnostics were added to:
- `AudioPlayer` playback lifecycle
- `ListeningTestPage` live-session orchestration
- `ListeningPracticeView` solo/homework playback
- `useSoloResume` resume lookup

Most calls were in hot or frequently-triggered pathways (`playing`, `pause`, `canplay`, `waiting`, section transitions, playback toggles).
Leaving them always-on in production risks extra main-thread work and console serialization overhead on lower-power devices.

## Decision

Diagnostics remain available but are **gated**:

- Default in production: **OFF**
- Default in development: **ON**
- Production opt-in for live debugging:
  - Query param: `?diagListening=1`
  - Local storage: `listening_diagnostics=1`

Implementation: `src/utils/listeningDiagnostics.ts`

## What Is Gated

All high-volume listening diagnostics were moved to `listeningDiagnostics.log/info/warn` in:
- `src/skills/listening/components/AudioPlayer.tsx`
- `src/skills/listening/components/ListeningTestPage.tsx`
- `src/components/practice/ListeningPracticeView.tsx`
- `src/hooks/solo/useSoloResume.ts`

Critical user-impact warnings/errors that should remain visible are still logged directly with `console.warn` / `console.error`.

## Performance Impact

With diagnostics disabled (normal production path), overhead is reduced to:
- one startup flag evaluation
- cheap guarded function calls where diagnostics were previously unguarded

No per-event stringification or console output happens unless diagnostics are enabled.

## Relation to Global Diagnostic Logger

`src/utils/diagnosticLogger.js` still intercepts console methods when instantiated.
That module is dynamically imported by reporting/admin flows and is not loaded as part of the standard listening startup path.
This keeps listening-page initial load unaffected by diagnostic log persistence machinery.

## Obsoleted Guidance

Any previous guidance implying **always-on** verbose listening diagnostics in production is obsolete.
Use the gated model above for live debugging.

## Scope Boundary

This diagnostics document only defines runtime logging behavior and production overhead control.
It does not replace real-device symptom tracking for touch responsiveness, audio UI layout, or playback visual behavior.

For the current section-tab, image-swipe, section-completion, and audio-source contract, see:
- `documentation/architecture/mobile-ielts-listening-audio-navigation.md`

The older reference to `documentation/architecture/mobile-ielts-listening-real-device-issue-matrix.md` is obsolete in this checkout unless that file is recreated. Use the active navigation contract above plus fresh live-device evidence for current playback behavior.
