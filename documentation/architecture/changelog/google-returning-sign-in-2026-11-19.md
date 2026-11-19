# Returning Google sign-in

Changelog ID: `CL-20261119-GOOGLE-RETURNING-SIGN-IN`
Master entry: [Master Changelog](../master_changelog.md)

Returning teachers and students wait for the existing profile read before
the sign-in page selects a destination. The new-student form opens only
after Firebase confirms that the Google account has no application profile.
Registration drafts retain names and student IDs. Password fields stay in
memory for the current form.

Release target: Firebase Hosting.
