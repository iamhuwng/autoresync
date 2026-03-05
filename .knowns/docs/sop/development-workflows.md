---
title: Development Workflows
createdAt: '2026-02-27T15:26:22.107Z'
updatedAt: '2026-03-05T09:22:38.609Z'
description: Standard development workflows and processes for the team
tags:
  - sop
  - workflows
  - development
---
# Development Workflows

This document outlines common development workflows for this project.

## 1. Adding a New Page Route

1.  Create the new page component in the `/src/pages` directory.
2.  Open the `src/App.jsx` file.
3.  Add a new `<Route>` component to the `<Routes>` section, specifying the path and the component to render.

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

Plain `npm run build` fails intermittently on Windows due to esbuild temp file locks (antivirus/indexer). Use this instead:

```powershell
$env:TMPDIR='C:\tmp\esbuild_tmp'; $env:TEMP='C:\tmp\esbuild_tmp'; $env:TMP='C:\tmp\esbuild_tmp'; node node_modules/vite/bin/vite.js build
```

Then deploy:

```powershell
npx firebase deploy --only hosting:kahut1
```

See @doc/troubleshooting/troubleshooting-vite-esbuild-file-lock-on-windows for full diagnosis and permanent fix.



## Quick Deploy for Presentations

When `npm run build` output is mangled/truncated in PowerShell (due to ANSI/streaming issues), use `npx vite build` redirected to a file instead — it runs identically but captures clean output:

```powershell
# Step 1 — Build (clean output capture)
npx vite build 2>&1 | Out-File -FilePath C:\tmp\build-err.txt -Encoding utf8

# Step 2 — Verify build succeeded
Test-Path "dist\index.html"   # Should return True

# Step 3 — Deploy
npx firebase deploy --only hosting 2>&1 | Out-File -FilePath C:\tmp\deploy-output.txt -Encoding utf8

# Step 4 — Check deploy result
Get-Content C:\tmp\deploy-output.txt
```

The deploy output will include the **Hosting URL** (e.g. `https://kahut1.web.app`) on success.

> Note: If you need demo-only UI visible in production before presenting, see @doc/patterns/pattern-presentation-mode-feature-toggle.
