# Changelog System Research

Changelog ID: `CL-20260708-CHANGELOG-SYSTEM-RESEARCH`
Master entry: [`documentation/architecture/master_changelog.md`](../master_changelog.md)

**Date:** 2026-07-08
**Scope:** how large/professional projects structure changelogs and docs maintenance, plus repo-fit recommendations

## Findings

- **Keep a Changelog** treats a changelog as a curated, chronologically ordered list of notable changes per version. Its guidance is to keep the latest version first, show release dates, group the same kinds of changes together, keep an `Unreleased` section at the top, and use human-friendly categories such as `Added`, `Changed`, `Deprecated`, `Removed`, `Fixed`, and `Security`. [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
- **Semantic Versioning** gives the release number meaning: `major` for breaking changes, `minor` for new features/non-critical fixes, and `patch` for critical bug fixes. SemVer also defines pre-release and build metadata precedence, so version labels stay machine-sortable as well as human-readable. [SemVer](https://semver.org/) [React versioning policy](https://react.dev/community/versioning-policy)
- **GitHub** frames releases as deployable software iterations based on git tags, with release notes and downloadable assets. GitHub also supports manually written or automatically generated release notes. [GitHub releases](https://docs.github.com/en/repositories/releasing-projects-on-github/about-releases) [GitHub auto-generated release notes](https://docs.github.com/en/repositories/releasing-projects-on-github/automatically-generated-release-notes)
- **GitLab** groups release notes and patch notes by version, and its changelog system is version/date oriented with category sections. GitLab also documents a commit-trailer-based workflow for generating changelog entries. [GitLab release notes](https://docs.gitlab.com/releases/) [GitLab changelogs](https://docs.gitlab.com/user/project/changelogs/) [GitLab changelog entries](https://docs.gitlab.com/development/changelog/)
- **Docs maintenance** in large projects is usually versioned at the major-release level, not every minor/patch. React's docs stay current within a major line and archive older major docs instead of publishing docs for every small release. [React versions](https://react.dev/versions) [React versioning policy](https://react.dev/community/versioning-policy)
- **Architecture docs** are a separate artifact from changelogs. ADR guidance says an ADR records a significant architectural decision, its context, and its consequences, and it has a lifecycle/status. That makes ADRs a better home for "why we chose this shape" than for release history. [AWS ADR process](https://docs.aws.amazon.com/prescriptive-guidance/latest/architectural-decision-records/adr-process.html) [AWS ADR best practices](https://docs.aws.amazon.com/prescriptive-guidance/latest/architectural-decision-records/best-practices.html) [MADR](https://adr.github.io/madr/)

## Repo-Fit Recommendations

These are repo-fit inferences from the sources above and the current docs layout in this repo, which already separates architecture, SOP, tasks, and release-oriented notes. [documentation/README.md](<C:/Users/The Lord/Desktop/luyentap-writing-import-rebased/documentation/README.md>)

1. **Create one dedicated changelog area**
   - Use `documentation/architecture/changelog/` as the home for release history.
   - Keep stable design/authority material in `documentation/architecture/`.
   - Keep process/runbook material in `documentation/SOP/`.
   - Keep implementation plans in `documentation/tasks/`.

2. **Use a master changelog**
   - File for this repo: `documentation/architecture/master_changelog.md` (keeps the user-requested name)
   - Common release-file name in public projects: `CHANGELOG.md`
   - Shape:

```md
# Changelog

## Unreleased
### Added
### Changed
### Fixed
### Removed
### Security

## [1.4.0] - 2026-07-08
### Added
### Changed
### Fixed
```

   - Rule: newest release first, move entries out of `Unreleased` at release time, and keep old released sections stable. This follows the Keep a Changelog model. [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)

3. **Use one detailed log file per release or major change**
   - Suggested folder: `documentation/architecture/changelog/`
   - Suggested filename: `CL-YYYYMMDD-SLUG.md`, `v1.4.0.md`, or `2026-07-08-v1.4.0.md`
   - Shape:

```md
# v1.4.0

- ID: CHG-20260708-001
- Status: released
- Date: 2026-07-08
- Related docs: ADR-20260708-001, PRD-0048

## Summary
## User-visible changes
## Migration / rollout notes
## Verification
```

4. **Use a stable ID scheme**
   - Release sections: semver tags, e.g. `1.4.0` or `v1.4.0`.
   - Detailed changelog entries: `CHG-YYYYMMDD-NNN`.
   - Architecture decisions: `ADR-YYYYMMDD-NNN` only when the file is an ADR or decision record.
   - Keep IDs immutable once published.

5. **Split changelog vs architecture cleanly**
   - Put user-visible release facts in the changelog.
   - Put rationale, alternatives, consequences, and long-lived contracts in architecture docs or ADRs.
   - If a shipped change depends on an architecture decision, cross-link the two docs instead of duplicating the full reasoning in the changelog.
   - Do not use the changelog as the decision log, and do not use architecture docs as release history.

## Bottom Line

For this repo, the safest pattern is:

- `documentation/architecture/master_changelog.md` for the master, release-oriented history
- `documentation/architecture/changelog/` for detailed per-change or per-release notes
- `documentation/architecture/` for stable design/authority docs
- `documentation/SOP/` and `documentation/tasks/` for process and implementation work

That matches the way large projects separate release history from decision history, while still keeping the result easy to scan and maintain. [GitHub releases](https://docs.github.com/en/repositories/releasing-projects-on-github/about-releases) [GitLab release notes](https://docs.gitlab.com/releases/) [AWS ADR process](https://docs.aws.amazon.com/prescriptive-guidance/latest/architectural-decision-records/adr-process.html)
