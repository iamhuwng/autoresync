---
title: 'Troubleshooting: Vite/esbuild File Lock on Windows'
createdAt: '2026-03-05T08:28:51.256Z'
updatedAt: '2026-03-05T08:29:17.883Z'
description: >-
  Fix for persistent "The process cannot access the file because it is being
  used by another process" errors when running `vite build` on Windows
tags:
  - troubleshooting
  - vite
  - esbuild
  - windows
  - build
---
# Troubleshooting: Vite/esbuild File Lock on Windows

## Problem

Running `npx vite build` or `npm run build` on Windows fails with:

```
[vite:esbuild-transpile] remove C:\Users\<username>\AppData\Local\Temp\esbuild-<hash>...
✗ Build failed in 27s
Error: The process cannot access the file because it is being used by another process.
```

This happens **even when no esbuild.exe process is visibly running**. The build completes transform phase (`✓ 8957 modules transformed`) but crashes during the chunk rendering phase when esbuild tries to clean up its temporary files in `%TEMP%`.

## Root Cause

Windows Defender (or other antivirus software / Windows Search Indexer) scans files as they are created in `%TEMP%`. When esbuild creates its temp directory and then immediately tries to delete it, the AV scanner holds a file handle, causing the `EBUSY` / access denied error.

This is a known Windows platform issue with esbuild's temp file cleanup.

## Solution: Redirect TEMP to a non-indexed directory

Set `TEMP`, `TMP`, and `TMPDIR` to a directory that is excluded from AV scanning (e.g. `C:\tmp\esbuild_tmp`) before running the build:

```powershell
# One-liner (PowerShell) — use this instead of plain `npm run build`
$env:TMPDIR='C:\tmp\esbuild_tmp'; $env:TEMP='C:\tmp\esbuild_tmp'; $env:TMP='C:\tmp\esbuild_tmp'; node node_modules/vite/bin/vite.js build
```

Or create the directory first if needed:

```powershell
New-Item -ItemType Directory -Force C:\tmp\esbuild_tmp | Out-Null
$env:TMPDIR='C:\tmp\esbuild_tmp'; $env:TEMP='C:\tmp\esbuild_tmp'; $env:TMP='C:\tmp\esbuild_tmp'
node node_modules/vite/bin/vite.js build
```

> **Why `node node_modules/vite/bin/vite.js build` instead of `npx vite build`?**  
> Using `node` directly invokes the already-installed local Vite binary instead of going through npx's process resolution, which avoids a potential secondary file-lock on the npx cache.

## Deploy command (after successful build)

```powershell
npx firebase deploy --only hosting:kahut1
```

## What Does NOT Work

| Approach | Why it fails |
|----------|-------------|
| `taskkill /F /IM esbuild.exe` | esbuild.exe is already gone; the lock is held by AV/indexer |
| Retry `npx vite build` | Same `%TEMP%` path → same lock |
| `Remove-Item $env:TEMP\esbuild-*` | Can't delete — file is locked by the same process |
| `npm run build` | Calls `vite build` which uses the same `%TEMP%` |

## Permanent Fix (Optional)

Add `C:\tmp` to Windows Defender exclusion list:

1. Windows Security → Virus & threat protection → Manage settings
2. Exclusions → Add or remove exclusions → Add a folder
3. Add `C:\tmp`

Or add to a PowerShell profile (`$PROFILE`) to always set the env vars for build sessions:

```powershell
function build-app {
    $env:TMPDIR = 'C:\tmp\esbuild_tmp'
    $env:TEMP   = 'C:\tmp\esbuild_tmp'
    $env:TMP    = 'C:\tmp\esbuild_tmp'
    node node_modules/vite/bin/vite.js build
}
```

## Diagnosis

If unsure whether this is the issue, capture the full error:

```powershell
node node_modules/vite/bin/vite.js build 2>&1 | Out-File -FilePath C:\tmp\vite_out.txt -Encoding ascii -Width 500
Select-String -Path C:\tmp\vite_out.txt -Pattern "remove|cannot access"
```

Look for the line `remove C:\Users\...\AppData\Local\Temp\esbuild-...` — that confirms the Windows file lock issue.

## Source

Discovered and solved during Firebase deployment sessions on this project (March 2026).
