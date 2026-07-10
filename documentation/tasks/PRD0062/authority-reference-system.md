# PRD0062 Authority Reference System

Status: Active compact-reference rule. Created: 2026-07-10.

## Purpose

Keep Packet evidence traceable without repeating command logs in contracts, findings indexes, traceability, or handoffs. Detailed evidence lives in a packet detail file; master docs link to its stable anchors.

## ID Classes

| Class | Meaning | Definition location |
|---|---|---|
| `F-*` | finding, blocker, risk | findings detail; master findings links only |
| `G-*` | traceability gate | traceability |
| `E-*` | evidence record | findings detail |
| `D-*` | current decision | packet contract |
| `R-*` | review record/finding | current handoff or review detail |
| `C-*` | command/proof record | findings detail |
| `T-*` | Packet taskbox reference | component task list |
| `H-*` | handoff reference | current handoff |

Format: `<CLASS>-P<packet>[optional phase]-<three digits>`, for example `F-P2B0-001`. A legacy global ID such as `P2-GATE-001` or `T-004` remains valid historical authority; do not rename it. Add the current compact ID beside it.

Every issued ID has one canonical anchor definition, lowercased, for example `&lt;a id="f-p2b0-001"&gt;&lt;/a&gt;`. References use the target file plus `#<lowercase-id>`. Repeated reference text is allowed; duplicate anchor definitions are not.

## Required Backtracking

```text
T taskbox -> G traceability gate -> D contract decision -> F findings index
-> detailed F finding -> E evidence -> C command/proof -> R review -> H handoff
```

For Packet 2B0: `T-P2B0-001` -> `G-P2B0-001` -> `D-P2B0-002` -> `F-P2B0-005` through `F-P2B0-007` -> `E-P2B0-005` through `E-P2B0-007` -> `C-P2B0-005` through `C-P2B0-012` -> `R-P2B0-003` -> `H-P2B0-003`. `D-P2B0-001`, `F/E/C-P2B0-001` through `004`, and `R/H-P2B0-001` remain historical baseline; `R/H-P2B0-002` are the Packet 2B0.2 continuation records.

## Current Definition Registry

| ID class | Packet 2B0 definition file |
|---|---|
| `F`, `E`, `C` | `findings-packet-2B0-private-r2-boundary.md`; current Packet 2B0.3 records are `F/E-P2B0-005` through `007` and `C-P2B0-005` through `012` |
| `G` | `traceability-book-activity-v1.md` |
| `D` | `contracts-book-activity-packet-2.md`; `D-P2B0-001` is historical and `D-P2B0-002` is current |
| `R`, `H` | `handoff-book-activity-packet-2B0-1.md` (`R/H-P2B0-001`); `handoff-book-activity-packet-2B0-2.md` (`R/H-P2B0-002`); `handoff-book-activity-packet-2B0-3.md` (`R/H-P2B0-003`) |
| `T` | `tasks-book-activity-02-source-pdf-delivery.md` |

## Validation

Use an anchor-only duplicate check, then ensure every Packet 2B0 master reference points to the detail file:

```powershell
$root = 'documentation/tasks/PRD0062'
$anchors = Get-ChildItem $root -Recurse -Filter *.md | ForEach-Object {
  Select-String -Path $_.FullName -Pattern '<a id="(?<id>[^"]+)"></a>' -AllMatches | ForEach-Object {
    $line = $_
    $line.Matches | ForEach-Object {
      [pscustomobject]@{ Id = $_.Groups['id'].Value; Path = $line.Path; Line = $line.LineNumber }
    }
  }
}
$anchors | Group-Object Id | Where-Object Count -gt 1 | ForEach-Object { $_.Group }
rg -n 'findings-packet-2B0-private-r2-boundary\.md#' $root
```

An empty duplicate-anchor result is pass. A detail file without a findings-index reference, or a master reference to a missing file/anchor, is closure-blocking documentation drift.
