---
title: Media Storage Architecture
createdAt: '2026-02-27T16:33:46.887Z'
updatedAt: '2026-07-07T16:20:00.000Z'
description: >-
  Cloudflare R2 storage: two-path strategy (temp vs permanent), upload patterns,
  listening audio, common pitfalls.
tags:
  - architecture
  - r2
  - storage
  - media
  - audio
---
# Media & Storage Architecture

## Overview

The application uses Cloudflare R2 for file storage, accessed via Cloudflare Workers as a proxy. A two-path strategy separates temporary uploads (auto-deleted after 24hr) from permanent storage.

Google Drive is retired and is not an active upload, import, playback, streaming, validation, OAuth, or compatibility path. See @doc/architecture/retired-features-current-state.

## Current Endpoint Boundary

Firebase Hosting serves the app at `https://kahut1.web.app`; it is not the upload backend. Upload, Listening authoring, upload-session, live-delivery, solo-delivery, and result-review delivery calls use the deployed Cloudflare Worker:

```text
https://r2-upload-signer.iamhuwng.workers.dev
```

Browser app code must not fall back to `http://localhost:8787`. That URL is only valid for explicit Worker-local tests or manual local Worker development. Current authority: @doc/architecture/firebase-hosting-worker-endpoint-policy and @doc/architecture/upload-storage-authority.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    React App (Browser)                       │
│                                                              │
│  Upload Components:                                          │
│  ├── AvatarUploader.tsx    → uploadAvatar() → permanent     │
│  ├── ListeningTestBuilder  → uploadAudio() → temp → perm   │
│  ├── AudioResourceEditor   → uploadAudio() → temp → perm   │
│  ├── ImageResourceEditor   → uploadImage() → temp → perm   │
│  └── CourseAnnouncementEditor → uploadFilePermanent()        │
├──────────────────────────────┬──────────────────────────────┤
│       r2StorageService       │                               │
│    src/services/r2Storage.ts │                               │
├──────────────────────────────┘                               │
│              ↓ HTTP (fetch)                                  │
├──────────────────────────────────────────────────────────────┤
│                  Cloudflare Worker                            │
│    Endpoints: /upload, /upload-permanent, /move, /delete     │
├──────────────────────────────────────────────────────────────┤
│                    Cloudflare R2 Bucket                       │
│                                                              │
│  temp/ (24hr auto-delete)     │  Permanent (no auto-delete) │
│  ├── temp/audio/              │  ├── audio/                 │
│  ├── temp/images/             │  ├── images/                │
│  └── temp/uploads/            │  ├── avatars/               │
│                               │  └── announcements/         │
└──────────────────────────────────────────────────────────────┘
```

## Two-Path Strategy

| Path | Auto-Delete | Use Case |
|------|-------------|----------|
| `temp/` | ✅ 24hr | Files during creation wizards (user might abandon) |
| Permanent | ❌ Never | Saved content (avatars, saved tests, announcements) |

### Decision Matrix
1. Can user abandon? → **Temp folder** (with `moveToPermanent()` on save)
2. File saved immediately? → **Direct permanent** (`uploadFilePermanent()`)
3. Orphaned files a problem? → **Temp folder** (auto-cleanup)

## Key Methods in `r2StorageService`

| Method | Destination | Use Case |
|--------|-------------|----------|
| `uploadAudio(file)` | `temp/audio/` | Test creation audio |
| `uploadImage(file)` | `temp/images/` | Test creation images |
| `moveToPermanent(key)` | Removes `temp/` prefix | On save |
| `uploadAvatar(file)` | `avatars/` | Profile pictures |
| `uploadFilePermanent(file, folder)` | `{folder}/` | Direct permanent |

## Listening Test Audio

The listening skills module (`src/skills/listening/`) handles audio for IELTS listening tests:
- Audio files uploaded during test creation → `temp/audio/`
- Moved to `audio/` on test save
- Audio playback uses native HTML5 `<audio>` element
- See @doc/listening-builder-improvements

## Common Pitfalls (from production bugs)

1. **Avatar disappearing after 24h**: Was using `uploadImage()` (temp) instead of `uploadAvatar()` (permanent)
2. **Announcement attachments lost**: Was using `uploadFile()` (temp) — fixed to `uploadFilePermanent()`
3. **Move endpoint 404**: R2 Worker's `/move` may not be implemented — always check `success` field

## Related Docs
- @doc/sop/file-upload-patterns-r2-storage — Full upload patterns SOP
- @doc/sop/r2-worker-update-guide — R2 Worker API reference
- @doc/guides/cloudflare-setup-guide — Cloudflare setup
- @doc/guides/firebase-storage-rules — Firebase storage rules
- @doc/prd/prd-unified-audio-architecture — Audio architecture PRD
- @doc/listening-builder-improvements — Listening builder improvements
