# Native Windows x64 development

Install Git for Windows and the native x64 Node version pinned in [`.node-version`](../../.node-version), with its bundled npm. Firebase Hosting's current CLI dependency declares support through Node 24. From the checkout where you plan to edit:

```powershell
npm.cmd ci --no-audit --no-fund
npm.cmd run dev
```

Open `http://localhost:5173/login`. For a separate student session use `npm.cmd run dev -- --port 5174`. The app uses the spare Firebase project `luyentap-pdf-qa-20261021` and its designated spare upload Worker. Use approved spare accounts and data, including refreshed live-state copies where the scenario needs them. The launcher rejects Firebase metadata for a different project or backend. Preserve existing shared public media URLs in copied records. The spare Worker must allow the localhost origin for Student ID flows.

To preview the built spare site, run `npm.cmd run build:spare` and then `npm.cmd run preview:spare`. This creates `dist-spare/` for local testing. For release evidence, build from a clean candidate and follow the [spare preview checks](release-safety.md#codex-verification-handoff). Production Hosting uses the separately approved `dist/` artifact through GitHub Release Promotion. Use spare Hosting for checks that depend on a deployed domain, redirects, or Hosting headers.

For Firebase rules tests or disposable data, use the emulator commands and a native x64 JDK 21. The full emulator-based app is available via `npm.cmd run dev:emulators`. For Worker code, install that package's dependencies with `npm.cmd --prefix cloudflare ci --no-audit --no-fund`. R2 backup Worker tests use their own package and lockfile.
