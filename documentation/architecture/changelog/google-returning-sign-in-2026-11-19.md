# Returning Google sign-in

Changelog ID: `CL-20261119-GOOGLE-RETURNING-SIGN-IN`
Master entry: [Master Changelog](../master_changelog.md)

Returning teachers and students wait for the existing profile read before
the sign-in page selects a destination. The new-student form opens only
after Firebase confirms that the Google account has no application profile.
Registration drafts retain names and student IDs. Password fields stay in
memory for the current form.

Release target: Firebase Hosting.


## Recorded release outcomes

<!-- release-operation:37e1442f-aa96-441e-b8a6-bd5aca8b20c9:outcome-926a17332719ef089c762e7925051423f1d708ead8a98b96ee7d624b1da45ef0.json -->

- Recorded: 2026-11-19T20:48:24.924Z; operation: `37e1442f-aa96-441e-b8a6-bd5aca8b20c9`.
- Source: `bd77e100bb8a7bcb25d88f3fcd9bf1ac8208f2ec`; target: `firebase:temp-a1437:hosting:kahut1`; action: deploy.
- Publication: **published**; verification: **passed**; provider: `projects/temp-a1437/sites/kahut1/versions/619a464adb5d2638@2026-11-19T20:44:47.220Z`.
- Retained evidence: [operation outcome](https://github.com/iamhuwng/autoresync/releases/tag/hosting-operation-37e1442f-aa96-441e-b8a6-bd5aca8b20c9#outcome-926a17332719ef089c762e7925051423f1d708ead8a98b96ee7d624b1da45ef0.json).
- This is a scoped historical observation; it does not establish current activation or completion of excluded services. Earlier implementation notes remain dated history.
