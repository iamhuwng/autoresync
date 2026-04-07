---
title: Development Workflows
description: Standard development workflows and processes for the team
createdAt: '2026-02-27T15:26:22.107Z'
updatedAt: '2026-04-05T14:27:18.920Z'
tags:
  - sop
  - workflows
  - development
---

# Development Workflows

This document outlines common development workflows for this project.

## 1. Adding a New Page Route

1. Create the new page component in the `/src/pages` directory.
2. Open `src/App.jsx`.
3. Add a new `<Route>` to the `<Routes>` section, specifying the path and component to render.

   ```javascript
   import MyNewPage from './pages/MyNewPage.jsx';

   <Route path="/my-new-page" element={<MyNewPage />} />
   ```

## 2. Handling Build Environment Issues

If you encounter persistent build errors after installing new dependencies, it may be due to a caching or dependency issue. To perform a full reset of the Node.js environment, run the following commands:

```bash
# On Windows (Command Prompt)
rmdir /s /q node_modules
del package-lock.json
npm install

# On Windows (PowerShell)
Remove-Item -Recurse -Force ./node_modules
Remove-Item package-lock.json
npm install

# On macOS / Linux
rm -rf node_modules
rm package-lock.json
npm install
```

## Building for Production (Windows)

`npm run build` and `npm run deploy:hosting` now use the direct build/deploy path:

```powershell
npm run build
npm run deploy:hosting
```

If you need to inspect the build before uploading, run `npm run build`, verify `dist/index.html`, then upload the existing build with:

```powershell
firebase deploy --only hosting:kahut1
```

If raw Vite hits the Windows esbuild temp-file lock issue, set `TMPDIR`, `TEMP`, and `TMP` manually to `C:\tmp\esbuild_tmp` for the current shell session before rerunning the build. See @doc/troubleshooting/troubleshooting-vite-esbuild-file-lock-on-windows for the full diagnosis and commands.

## Quick Deploy for Presentations

When build output is mangled or truncated in PowerShell, capture the standard build command to a file instead of calling Vite directly:

```powershell
# Step 1 - Build (clean output capture)
cmd /c npm run build 2>&1 | Out-File -FilePath C:\tmp\build-output.txt -Encoding utf8

# Step 2 - Verify build succeeded
Test-Path "dist\index.html"   # Should return True

# Step 3 - Deploy the verified build
firebase deploy --only hosting:kahut1 2>&1 | Out-File -FilePath C:\tmp\deploy-output.txt -Encoding utf8

# Step 4 - Check deploy result
Get-Content C:\tmp\deploy-output.txt
```

The deploy output will include the Hosting URL, for example `https://kahut1.web.app`, on success.

> Note: If you need demo-only UI visible in production before presenting, see @doc/patterns/pattern-presentation-mode-feature-toggle.
