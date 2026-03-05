---
title: 'SOP: Vite/esbuild File-Lock Error on Windows'
createdAt: '2026-03-05T08:38:56.740Z'
updatedAt: '2026-03-05T08:40:06.480Z'
description: >-
  Troubleshooting guide for the esbuild Windows file-lock error during Vite
  production builds: 'The process cannot access the file because it is being
  used by another process.'
tags:
  - sop
  - troubleshooting
  - vite
  - windows
---
# SOP: Vite/esbuild File-Lock Error on Windows

## Error

```
✗ Build failed in 27.09s
[vite:esbuild-transpile] remove C:\Users\...\AppData\Local\Temp\esbuild-998a5e0bd6aa79e35cbe3e0c1296ab5f13f29d94...:
The process cannot access the file because it is being used by another process.
```

## Root Cause

Windows file locking. During a `vite build` or `npm run build`:
- Vite spawns an esbuild process that writes temp files to `%TEMP%\esbuild-*`
- Another process (antivirus scan, previous orphaned build, or Windows Indexing) has a lock on that temp file
- When esbuild tries to clean up its temp file at the end of the build, it fails

This error occurs **after** the build succeeds (8957 modules transformed ✓), so your output files in `dist/` are **still valid**.

## Fix: Quick (Usually Sufficient)

1. **Kill any orphaned Node/esbuild processes**:
   ```powershell
   Get-Process node, esbuild -ErrorAction SilentlyContinue | Stop-Process -Force
   ```

2. **Retry the build**:
   ```powershell
   npm run build
   ```

## Fix: If Quick Fix Fails

3. **Manually clean temp files**:
   ```powershell
   Remove-Item "$env:TEMP\esbuild-*" -Recurse -Force -ErrorAction SilentlyContinue
   ```

4. **Temporarily disable Windows Defender real-time protection** for the build, or **add an exclusion** for:
   - `%TEMP%\esbuild-*`
   - The project's `node_modules\.vite` directory

5. **Run as admin** (if antivirus is blocking):
   ```powershell
   # Run PowerShell as Administrator, then:
   npm run build
   ```

## Is the Build Output Valid?

**Yes** — the error occurs during temp-file cleanup, after all 8957 modules were successfully transformed and written to `dist/`. The `dist/` output is complete and deployable despite the error message.

## Prevention

Add these to Windows Defender exclusions (Settings → Virus & Threat Protection → Exclusions):
- `C:\Users\<user>\AppData\Local\Temp` (or `%TEMP%`)
- `C:\Users\<user>\Desktop\Homework App\kahoot
ode_modules`

## Related

- Only affects `npm run build` (production) — `npm run dev` (dev server) is unaffected
- Not a macOS/Linux issue — file locking semantics differ on those platforms
