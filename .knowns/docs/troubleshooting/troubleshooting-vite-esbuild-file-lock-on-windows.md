---
title: 'Troubleshooting: Vite/esbuild File Lock on Windows'
description: 'Fix for persistent "The process cannot access the file because it is being used by another process" errors when running `vite build` on Windows'
createdAt: '2026-03-05T08:28:51.256Z'
updatedAt: '2026-04-05T14:26:27.731Z'
tags:
  - troubleshooting
  - vite
  - esbuild
  - windows
  - build
---

# Troubleshooting: Vite/esbuild File Lock on Windows

## Problem

Running a raw Vite production build on Windows, including the default `npm run build` path in this repo, can fail with:

```
[vite:esbuild-transpile] remove C:\Users\<username>\AppData\Local\Temp\esbuild-<hash>...
X Build failed in 27s
Error: The process cannot access the file because it is being used by another process.
```

This happens even when no `esbuild.exe` process is visibly running. The build completes the transform phase but crashes during chunk rendering when esbuild tries to clean up its temporary files in `%TEMP%`.

## Root Cause

Windows Defender, other antivirus software, or Windows Search Indexer can scan files as they are created in `%TEMP%`. When esbuild creates its temp directory and then immediately tries to delete it, another process can still hold a file handle, causing the `EBUSY` or access denied error.

This is a known Windows platform issue with esbuild temp-file cleanup.

## Solution: Set a Stable Temp Directory Manually

The default build path is now direct Vite. If the file-lock issue appears, set `TMPDIR`, `TEMP`, and `TMP` to a non-indexed directory for the current shell session before rebuilding.

```powershell
New-Item -ItemType Directory -Force C:\tmp\esbuild_tmp | Out-Null
$env:TMPDIR='C:\tmp\esbuild_tmp'
$env:TEMP='C:\tmp\esbuild_tmp'
$env:TMP='C:\tmp\esbuild_tmp'
npm run build
```

If you want a direct Vite invocation while debugging, use:

```powershell
New-Item -ItemType Directory -Force C:\tmp\esbuild_tmp | Out-Null
$env:TMPDIR='C:\tmp\esbuild_tmp'
$env:TEMP='C:\tmp\esbuild_tmp'
$env:TMP='C:\tmp\esbuild_tmp'
node node_modules/vite/bin/vite.js build
```

> Why `node node_modules/vite/bin/vite.js build` instead of `npx vite build`?
> Using `node` directly invokes the already-installed local Vite binary instead of going through npx's process resolution, which avoids a potential secondary file-lock on the npx cache.

## Deploy command (after successful build)

If `dist/` is already verified and you do not want to rebuild, upload it directly:

```powershell
firebase deploy --only hosting:kahut1
```

For the normal one-command release path, use:

```powershell
npm run deploy:hosting
```

If the temp-directory workaround is needed, set the env vars in that shell first and then run `npm run deploy:hosting`.

## What Does NOT Work

| Approach | Why it fails |
|----------|-------------|
| `taskkill /F /IM esbuild.exe` | `esbuild.exe` is already gone; the lock is held by AV or the indexer |
| Retry `npx vite build` | Same `%TEMP%` path, same lock |
| `Remove-Item $env:TEMP\esbuild-*` | Cannot delete because the file is locked by another process |
| Raw Vite build with default `%TEMP%` | Uses the same indexed temp path and can hit the same lock |

## Permanent Fix (Optional)

Add `C:\tmp` to the Windows Defender exclusion list:

1. Windows Security -> Virus & threat protection -> Manage settings
2. Exclusions -> Add or remove exclusions -> Add a folder
3. Add `C:\tmp`

Or add this to your PowerShell profile (`$PROFILE`) to always set the env vars for manual build sessions:

```powershell
function build-app {
    $env:TMPDIR = 'C:\tmp\esbuild_tmp'
    $env:TEMP   = 'C:\tmp\esbuild_tmp'
    $env:TMP    = 'C:\tmp\esbuild_tmp'
    npm run build
}
```

## Diagnosis

If you are unsure whether this is the issue, capture the full error:

```powershell
node node_modules/vite/bin/vite.js build 2>&1 | Out-File -FilePath C:\tmp\vite_out.txt -Encoding ascii -Width 500
Select-String -Path C:\tmp\vite_out.txt -Pattern "remove|cannot access"
```

Look for the line `remove C:\Users\...\AppData\Local\Temp\esbuild-...` to confirm the Windows file-lock issue.

## Source

Discovered and solved during Firebase deployment sessions on this project in March 2026.
