# PRD0062 #106 canonical fork writer trust-boundary amendment

Status: `PROCEED_WITH_AMENDMENT`

This amendment supersedes only the frozen contract's claims that Firebase RTDB
Rules recursively validate, compare, or exactly authorize arbitrary composite
leaves in the canonical fork plan. All other frozen-contract requirements remain
in force.

## Authority and capability boundary

The Worker is the sole authoritative constructor and validator of the complete
root update plan: private canonical Activity, student-safe projection,
provenance, Book, node, indexes, summaries, and immutable receipt.

The dedicated Firebase capability is server-held. It is minted only after the
Worker has authenticated the actor, confirmed target ownership, resolved and
validated the authoritative source and target, completed replay checks, built
the entire plan, and validated that plan. The capability is never accepted from
or returned to the HTTP caller. It is not logged, persisted, cached, included in
errors, or reused after re-planning. Capability possession is inside the Worker
trust boundary.

Firebase Rules provide defense in depth and atomic concurrency control. They
bind the dedicated capability identity, deadline, actor, operation, source,
destination, target, and other scalar pins; constrain writes to the fixed path
families; require absent immutable destinations and receipt; enforce required
scalar shape, target ownership, source lifecycle/schema pins, and the target
Book `updatedAt` compare-and-set; and evaluate the single root PATCH atomically.
The Worker separately derives and pins the one-based semantic append order and
the zero-based target `materialRefs` index; the Book compare-and-set is not
coupled to a target-node timestamp that normal metadata edits do not advance.
Rules do not claim recursive equality, recursive immutability, or exact
authorization for arbitrary nested maps or arrays.

## Preserved contract

The public interface, one-PATCH atomicity, durable replay behavior, no-partial
failure behavior, private-answer and student-safe privacy boundary, unchanged
source records, default-off gates, and prohibition on retired persistence remain
unchanged.

## Acceptance evidence

Acceptance requires executable characterization tests showing that a direct
server-held capability can alter nested composites while scalar/path guards
remain enforced. It also requires Worker tests proving that only a fully built
and validated root plan reaches the capability mint/use seam, that the exact
plan is committed once, and that the capability is not accepted from or exposed
to HTTP callers, responses, logs, persistence, caches, or errors.
