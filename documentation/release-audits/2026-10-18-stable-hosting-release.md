# Stable Hosting release — 2026-10-18

The owner-authorized maintenance baseline is live at [kahut1.web.app](https://kahut1.web.app).
PR [#147](https://github.com/iamhuwng/autoresync/pull/147) merged as
`fb4197fc6152f45569afa2750df8b9fd681c956b`, tree
`679a0ab1de8025a9bf62662cdc6be3db8aa7e17e`. The immutable source tag is
`stable-2026-10-18`. All five PR checks and all five main workflows passed.

## Deployment proof

- Firebase project `temp-a1437`, Hosting site/target `kahut1` only.
- Finalized version `caa2ab5da3911495`, released `2026-10-17T17:20:30.758Z`
  (October 18, 00:20 Bangkok).
- The production manifest at `/.well-known/luyentap-release.json` binds the
  source revision/tree above. All **453 listed content hashes** were fetched
  and verified independently. The CLI reported 454 local deployment files
  including the manifest; the provider channel metadata reports 456 version
  files. These counts are recorded separately rather than treated as identical.
- Production environment SHA-256:
  `b872b1a42c7c208cfe09ff77a41ba06987624ce216c9f1ef67f61e5ef32e65b3`.
  The normal clean production build passed the bundle budget with a 257 KB root entry and local
  endpoint checks. All 391 JavaScript assets were checked for Groq literals.
- The documented first-manifest bootstrap was used because the prior release
  had no Git/source manifest. No assessment receipt was edited to force PASS.
- No Worker, Firebase rules, database, migration, or B2 deployment occurred.
  Existing AI and ordinary notification backends remain in place.

The previous verified Hosting version is `10039da56ea1c0ae`. If an authorized
Hosting rollback is needed, the locked Firebase CLI supports:

```text
firebase hosting:clone kahut1@10039da56ea1c0ae kahut1:live --project temp-a1437 --non-interactive
```

Rollback was prepared but not executed. It cannot undo backend/data changes.

## Browser checks and limits

The real deployed app was exercised in the in-app browser:

- Teacher materials loaded; the teacher Book tab was absent.
- Existing QA class roster loaded. Native class Settings opened with modal
  focus, Escape closed it and restored focus. The Courses tab switched correctly.
- Existing QA course loaded its native Modules empty state and Add Module action.
  No module was created or modified; populated-module interactions remain unit-tested.
- Ordinary teacher notifications loaded. Opening the existing QA class-request
  notice navigated to its class and persisted read state after reload. This
  marked that one notice read (unread count 3 to 2); no notice was sent.
- Student quick login from `/login` succeeded; dashboard feed and library loaded.
- A Book solo deep link displayed **Book unavailable**; Return opened Library.
  The inherited student Books catalogue tab remains visible and reports no
  ready public Books. Book editor/material/presentation flags remain disabled.

The teacher account had no drafts, so the changed draft-review header/sidebar
could not be exercised against an existing live draft. Its focused suite passed,
including sidebar selection. No production fixture was created just for this check.
An inherited class-page Logout handler navigates without signing out; the
Materials shell Logout signs out correctly and was used to switch roles.
That existing auth cleanup remains separate from this Hosting reconstruction.

Local qualification also passed 78 focused UI tests, 39 shared assessment tests,
34 guard unit tests, 21 activity-checker tests, and 32 independent schema fixtures.
Earlier AI/notification/rule/browser proof is scoped in the maintenance record.
No full suite, real AI inference, new notification delivery, PDF upload, or
full PDF Book lifecycle acceptance is claimed.

## Future changes and retained work

Start new work from GitHub `main`; use `stable-2026-10-18` to reproduce the exact
deployed source. Documentation-only release-record commits may follow that tag.
Use one feature branch and reviewed PR per change, clean-source builds, and
the normal guarded Hosting deployment route now that a live manifest exists.
Keep Worker/rules/storage releases separately scoped and evidenced.

The original dirty Book checkout is preserved. Its newer PRD0063 authoring and
PRD0062 delivery work was not merged or activated. PDF Book still needs source
integration, production submission/service configuration, current rollout and
capacity reconciliation, and teacher/student/provider lifecycle acceptance.

Former local-main commit `42574e740e7c036cbff248f87abdcea2fec467ff` and its 28
unpublished feedback/dashboard commits are retained locally at
`codex/retained-local-main-feedback-20261017`; they were not published through
promotion history. Homework UID normalization, newer local recovery/persistence,
and Listening upload deadline/restore fencing remain separately inventoried.
The owner explicitly accepted the historical active Groq credential exposure;
this release does not revoke it or erase historical assets.
