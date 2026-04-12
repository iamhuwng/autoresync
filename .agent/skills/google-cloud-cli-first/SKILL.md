---
name: google-cloud-cli-first
description: Prefer the Google Cloud CLI for operational Google Cloud and Gemini troubleshooting. Load when diagnosing API keys, enabled services, active project/account mismatch, IAM, Vertex AI or Google AI auth, or MCP authentication against Google endpoints.
---

# Google Cloud CLI First

## When to Load

Load this skill when the task involves:
- Google Cloud project, auth, IAM, or service configuration
- Gemini, Vertex AI, Google AI Studio, or Google developer API failures
- API key diagnosis, key restrictions, enabled-service checks, or project mismatch
- Google-hosted MCP authentication or endpoint access issues

Do not load this skill for normal Gemini app development work unless the problem is operational. For SDK implementation and model usage, use `gemini-api-dev`.

## Default Rule

Use `gcloud` first. Do not begin with browser-console clicking, dashboard guesswork, or key rotation unless CLI evidence shows that is necessary.

## First Diagnostic Pass

Run these checks early and interpret them before changing code:

```powershell
gcloud auth list
gcloud config get-value project
gcloud services list --enabled
gcloud services api-keys list
```

If the problem is scoped, tighten the commands instead of broadening the search.

## Key Workflows

### API key problems

1. List keys in the active project with `gcloud services api-keys list --project=PROJECT_ID`.
2. Inspect the candidate key with `gcloud services api-keys describe KEY_RESOURCE_NAME --project=PROJECT_ID`.
3. Check `apiTargets`, browser referrers, IP restrictions, and whether the expected Google service is present.
4. Only fetch the raw key string with `gcloud services api-keys get-key-string` when the task truly requires comparing the actual secret value.
5. Treat wrong project, wrong restrictions, or missing API target as more likely than a mysteriously "bad" key.

### Service enablement problems

1. Confirm the active project first.
2. Check enablement with `gcloud services list --enabled --project=PROJECT_ID`.
3. If needed, verify a specific service directly before changing app code or env vars.
4. Do not assume a 403 or activation error means credentials are wrong; the API may simply be disabled in the active project.

### Project or account mismatch

1. Check the active account with `gcloud auth list`.
2. Check the active project with `gcloud config get-value project`.
3. If behavior still looks wrong, compare the project number/name seen in errors with the CLI context before doing anything else.

### MCP auth to Google endpoints

1. Confirm which Google service the MCP endpoint belongs to.
2. Verify the required auth mode from official docs.
3. If it is API-key based, inspect the key restrictions and service target in `gcloud` before editing client config.
4. If it is OAuth based, confirm the local `gcloud` identity and project context before assuming the endpoint is broken.

## Biases

- Prefer CLI facts over memory.
- Prefer project-context mistakes over secret-rotation guesses.
- Prefer inspecting restrictions over regenerating keys.
- Prefer official Google docs only after the CLI state is known.

## Hand-off

After the CLI pass, summarize:
- active account
- active project
- relevant enabled service state
- relevant key restriction state
- the smallest concrete fix implied by those facts
