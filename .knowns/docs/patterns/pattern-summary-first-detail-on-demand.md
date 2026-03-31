---
title: 'Pattern: Summary First, Detail On Demand'
description: 'Canonical student-view loading pattern for tabbed and list-heavy surfaces: load summaries once, keep hosts in control, and fetch full detail only when the user opens it.'
createdAt: '2026-03-30T23:50:55.632Z'
updatedAt: '2026-03-31T00:26:19.066Z'
tags:
  - pattern
  - student
  - data-loading
  - summaries
  - governance
---

# Pattern: Summary First, Detail On Demand

## Purpose

Use this pattern for student-facing tabs, record lists, history views, and widgets that need to feel fast even as data grows.

The host loads a student-safe summary dataset once. Full detail is loaded only when the user opens a row, panel, or drill-down surface.

## Problem This Prevents

A common anti-pattern is to use full canonical records as the default list payload.

That creates avoidable cost:
- large payloads for small list rows
- repeated fetches when tabs mount and unmount
- detail-only fields leaking into list code paths
- more pressure to perform write-on-read repairs in list surfaces

## Canonical Rule

For student list and tab surfaces:
- the host owns the base summary dataset
- tabs and child panels receive filtered or grouped views of that host-owned data
- full records load only for detail interactions
- if a summary or student-safe read model exists, list surfaces use it first
- revisits keep prior content visible and refresh in the background

## Good Shape

```tsx
function AcademicRecordPage({ studentId }: Props) {
  const recordData = useAcademicRecordData(studentId);

  return (
    <AcademicRecordTabs
      overview={recordData.overview}
      thcs={recordData.thcs}
      writing={recordData.writing}
      ielts={recordData.ielts}
      course={recordData.course}
      onOpenResult={recordData.openResult}
    />
  );
}

function THCSProgressTab({ rows, onOpenResult }: Props) {
  return rows.map((row) => (
    <AcademicRecordResultRow key={row.resultId} row={row} onOpen={onOpenResult} />
  ));
}

async function openResult(resultId: string) {
  const detail = await getResultDetail(resultId);
  setSelectedResult(detail);
}
```

Why this is correct:
- the host pays the list cost once
- tabs are presentational selectors
- detail work happens only when the user asks for it

## Bad Shape

```tsx
function WritingTab({ studentId }: Props) {
  const [items, setItems] = useState([]);

  useEffect(() => {
    getFilteredResults(studentId, { type: 'writing' }).then(setItems);
  }, [studentId]);

  return <WritingRows items={items} />;
}

function THCSTab({ studentId }: Props) {
  const [items, setItems] = useState([]);

  useEffect(() => {
    getFilteredResults(studentId, { category: 'thcs' }).then(setItems);
  }, [studentId]);

  return <THCSRows items={items} />;
}
```

That shape makes each tab its own data owner, so switching tabs replays work that the host should already own.

## Summary Contract Guidance

A summary payload should include only what the list needs:
- stable ids
- labels and timestamps
- lightweight score or status fields
- canonical detail ids
- compact progression or review metadata

A summary payload should not include:
- full answer payloads
- grading editor state
- large analytics blobs
- fields needed only after opening detail

## Review Checklist

Block the change if any answer is "yes":
- Does a tab panel fetch list data on mount?
- Does a widget load full records when only summary rows are rendered?
- Does the surface drop prior content and return to a blocking spinner on every revisit?
- Is the summary-vs-detail contract missing from the change description or architecture note?

## Related Docs

- @doc/architecture/academic-record/academic-record-page-architecture
- @doc/patterns/pattern-student-shell-single-data-owner
- @doc/patterns/pattern-bulk-enrichment-from-shared-student-history


## Current Repo Anchor

As of 2026-03-31, Academic Record is the primary implementation anchor for this pattern.

Current implementation shape:
- `AcademicRecordPage` owns the list-safe record data once
- THCS and Writing surfaces consume host-provided data props
- full saved-result detail still loads only when the user opens `ResultSlidePanel`

Use this anchor when reviewing future student tabs that are tempted to become independent data owners on mount.
