---
title: Mobile IELTS Listening Audio Navigation Contract
description: Current contract for mobile IELTS Listening section tabs, image swipes, section completion, and audio source reload behavior.
createdAt: '2026-05-11T17:22:18.028Z'
updatedAt: '2026-05-11T17:22:18.028Z'
tags:
  - architecture
  - ielts
  - listening
  - mobile
  - audio
  - navigation
---

# Mobile IELTS Listening Audio Navigation Contract

## Current Rule

Active mobile section navigation changes destination audio.

This applies to live, solo, and homework IELTS Listening mobile surfaces.

When a student taps another Part or otherwise chooses another section context, the host must:
- move viewed part/question context to the destination section
- move `currentAudioIndex` to the destination section audio
- clear old audio error state
- auto-start destination audio when the test is not submitted and the destination section has an audio URL

This rule is not conditional on `showPlayPause`.

## Retired Rule

Older PRD-0045 text said Standard/live mobile section tabs only changed viewed state and kept audio locked to the current section.

That rule is obsolete for the mobile student interface.

## Image Mode

`questionImages` is an ordered render list. A section may have multiple images with different `questionRange` values.

Mobile image mode shows one active image at a time and may expose an `X/Y` position pill across the flattened image list.

Swiping across image entries can cross section boundaries. When it does, viewed part, current question, and destination audio section move together.

Projection must not collapse images to one image per section.

## Section Completion

When section audio ends on mobile Listening:
- do not replay the completed section
- advance to the next section when one exists
- move viewed part/question to the next section
- start next section audio

## Source Reload

`AudioPlayer` owns source-change race handling. When playback intent remains active across `audioUrl` or section changes, the media element must reload before play sync and restart after the new source is ready.

Transient source-load races must not flip parent playback intent to stopped.

## Main Files

- `src/skills/listening/components/ListeningTestPage.tsx`
- `src/components/practice/ListeningPracticeView.tsx`
- `src/skills/listening/components/AudioPlayer.tsx`
- `src/components/test/mobile/MobileListeningImageCanvas.tsx`

## Repo Docs

- `documentation/architecture/mobile-ielts-listening-audio-navigation.md`
- `documentation/tasks/tasks-0045-prd-mobile-ielts-listening-test-taking-interface.md`
- `documentation/architecture/student-test-delivery-projections.md`
- `documentation/architecture/homework-solo-practice-architecture.md`
