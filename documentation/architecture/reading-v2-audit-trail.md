# Reading V2 Audit Trail

Status: current Reading V2 audit contract. Detailed history lives in
[`documentation/architecture/changelog/reading-v2-audit-trail.md`](changelog/reading-v2-audit-trail.md).

## Authority

Reading V2 audit events use:

```text
reading_v2/audit_events/{eventId}
```

Do not write PRD-0054 Reading V2 archive, restore, repair, remove, or duplicate
decision events to legacy `audit_logs`.

## Event Rules

- Events are append-only.
- Event ids must be unique and non-guessable enough for concurrent writers.
- Events must include actor, owner/material identifiers, action, created time,
  and safe summary context needed for diagnosis.
- View-only events belong to observability tracking, not audit.

## Forbidden Payload

Audit rows must not contain passage body, canonical payloads, answer keys,
student answers, scoring rules, AI evidence, hidden provenance, import evidence,
or draft bodies.

## Implementation Requirements

- Audit writes go through the Reading V2 audit service.
- RTDB rules must validate the path and fail closed on unsafe fields.
- Tests must cover allowed actions, forbidden fields, owner scope, and
  append-only behavior.

## Related Docs

- [`documentation/architecture/reading-v2-material-removal-lifecycle.md`](reading-v2-material-removal-lifecycle.md)
- [`documentation/rules/observability.md`](../rules/observability.md)
