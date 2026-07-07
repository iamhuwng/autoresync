# Cloudflare Worker Update Guide - Obsolete

Status: Obsolete
Retired: 2026-07-07

This guide is retained only as a historical pointer. Do not paste the old inline Worker code into Cloudflare Dashboard, do not replace the deployed `r2-upload-signer` Worker from this document, and do not use it as current upload architecture.

Current authority:

- `documentation/architecture/upload-storage-authority.md`
- `documentation/architecture/firebase-hosting-worker-endpoint-policy.md`
- checked-in Worker source under `cloudflare/`

Current browser endpoint policy:

```text
Firebase Hosting app: https://kahut1.web.app
Upload/listening Worker: https://r2-upload-signer.iamhuwng.workers.dev
```

The browser app must not fall back to `http://localhost:8787`. Local Worker URLs are only for Worker-local contract tests, e2e fixtures, or explicit manual Worker development.

For deploys, use checked-in source and Wrangler/Firebase workflows from current architecture docs and package scripts. Do not use the retired paste-dashboard snippet that previously lived here.
