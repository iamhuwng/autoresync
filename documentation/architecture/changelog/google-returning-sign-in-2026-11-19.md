# Returning Google sign-in

Changelog ID: `CL-20261119-GOOGLE-RETURNING-SIGN-IN`
Master entry: [Master Changelog](../master_changelog.md)

Returning teachers and students wait for the existing profile read before
the sign-in page selects a destination. The new-student form opens only
after Firebase confirms that the Google account has no application profile.
Registration drafts retain names and student IDs. Password fields stay in
memory for the current form.

Release target: Firebase Hosting.
\n## Recorded release outcomes\n\n<!-- release-operation:37e1442f-aa96-441e-b8a6-bd5aca8b20c9:10743ef421d8879405d9e162bb1c170d6bbcfe82110c11a2a8c623423b4e5ff0 -->\n\n- Recorded: 2026-11-19T20:48:27.872Z. Operation: 37e1442f-aa96-441e-b8a6-bd5aca8b20c9.\n- Source: d77e100bb8a7bcb25d88f3fcd9bf1ac8208f2ec. Target: irebase:temp-a1437:hosting:kahut1. Action: deploy.\n- Publication: **published**. Verification: **passed**. Provider: projects/temp-a1437/sites/kahut1/versions/619a464adb5d2638@2026-11-19T20:44:47.220Z.\n- Retained evidence: [operation outcome](https://github.com/iamhuwng/autoresync/releases/tag/hosting-operation-37e1442f-aa96-441e-b8a6-bd5aca8b20c9).\n- This is a scoped historical observation. It does not establish activation or completion of excluded services.\n
