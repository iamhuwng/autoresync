import { useMemo } from 'react';
import type {
  BookHomeworkActivityBinding,
  BookHomeworkStructuralOutlineNode,
} from '../../types/homework.types';
import {
  classifyBookHomeworkDeadlineMutation,
  compileBookHomeworkScheduleDraft,
  resolveBookHomeworkLocalTime,
  resolveEffectiveBookHomeworkWindow,
  toBookHomeworkScheduleIso,
  type BookHomeworkDeadlineMutationIntent,
  type BookHomeworkScheduleDraft,
  type BookHomeworkScheduleRuleDraft,
} from '../../services/book-homework/bookHomeworkSchedule.service';
import './BookScheduleEditor.css';

export interface BookScheduleEditorProps {
  readonly value: BookHomeworkScheduleDraft;
  readonly onChange: (next: BookHomeworkScheduleDraft) => void;
  readonly outline: readonly BookHomeworkStructuralOutlineNode[];
  readonly activities: readonly BookHomeworkActivityBinding[];
  readonly affectedStudentStatesByNode?: Readonly<Record<string, readonly ('not-started' | 'in-progress' | 'submitted')[]>>;
  readonly conflictMessage?: string;
  readonly onIntent?: (intent: BookHomeworkDeadlineMutationIntent) => void;
  readonly timeZone?: string;
}

const updateRule = (
  rules: readonly BookHomeworkScheduleRuleDraft[],
  nodeKey: string,
  update: Partial<Omit<BookHomeworkScheduleRuleDraft, 'nodeKey'>>,
): readonly BookHomeworkScheduleRuleDraft[] => {
  const current = rules.find((rule) => rule.nodeKey === nodeKey)
    ?? { nodeKey, availableFrom: '', dueAt: '' };
  const next = { ...current, ...update };
  return (next.availableFrom || next.dueAt
    ? [...rules.filter((rule) => rule.nodeKey !== nodeKey), next]
    : rules.filter((rule) => rule.nodeKey !== nodeKey))
    .sort((left, right) => left.nodeKey.localeCompare(right.nodeKey));
};

const BookScheduleEditor = ({
  value,
  onChange,
  outline,
  activities,
  affectedStudentStatesByNode = {},
  conflictMessage,
  onIntent,
  timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone,
}: BookScheduleEditorProps) => {
  const compiled = useMemo(() => {
    if (!value.dueDate) return { schedule: null, error: null };
    try {
      return { schedule: compileBookHomeworkScheduleDraft(value, outline, timeZone), error: null };
    } catch (error) {
      return {
        schedule: null,
        error: error instanceof Error ? error.message : 'Book schedule is invalid.',
      };
    }
  }, [outline, timeZone, value]);

  const localValue = (timestamp: string): string => timestamp.slice(0, 16);
  const offset = (timestamp: string): string | undefined => /(?:Z|[+-]\d{2}:\d{2})$/u.exec(timestamp)?.[0];
  const updateLocal = (current: string, nextWall: string): string => {
    const currentOffset = offset(current);
    if (!currentOffset || !nextWall) return nextWall;
    const resolution = resolveBookHomeworkLocalTime(nextWall, timeZone);
    const normalizedOffset = currentOffset === 'Z' ? '+00:00' : currentOffset;
    return resolution.offsets.includes(normalizedOffset) ? `${nextWall}${currentOffset}` : nextWall;
  };
  const disambiguation = (timestamp: string, apply: (next: string) => void) => {
    if (!timestamp) return null;
    const chosenOffset = offset(timestamp);
    if (chosenOffset) return <small>{timeZone} (UTC{chosenOffset === 'Z' ? '+00:00' : chosenOffset})</small>;
    const resolution = resolveBookHomeworkLocalTime(timestamp, timeZone);
    if (resolution.offsets.length !== 2) return resolution.offsets.length === 1
      ? <small>{timeZone} (UTC{resolution.offsets[0]})</small>
      : <small role="alert">This local time does not exist in {timeZone}.</small>;
    return (
      <small role="group" aria-label={`Choose UTC offset for ${timestamp}`}>
        {timeZone}: choose {resolution.offsets.map((offset) => (
          <button key={offset} type="button" onClick={() => apply(`${timestamp}${offset}`)}>UTC{offset}</button>
        ))}
      </small>
    );
  };

  const changeDeadline = (nodeKey: string, nextDueAt: string): void => {
    const previousDueAt = value.scheduleRules.find((rule) => rule.nodeKey === nodeKey)?.dueAt || undefined;
    const scheduleRules = updateRule(value.scheduleRules, nodeKey, { dueAt: nextDueAt });
    onChange({ ...value, scheduleRules });
    try {
      onIntent?.(classifyBookHomeworkDeadlineMutation({
        nodeKey,
        previousDueAt: previousDueAt
          ? toBookHomeworkScheduleIso(previousDueAt, 'Previous deadline', timeZone)
          : undefined,
        nextDueAt: nextDueAt
          ? toBookHomeworkScheduleIso(nextDueAt, 'Next deadline', timeZone)
          : undefined,
        affectedStudentStates: affectedStudentStatesByNode[nodeKey],
      }));
    } catch {
      // Invalid or ambiguous wall time has no mutation intent until the teacher resolves it.
    }
  };

  const clearRule = (nodeKey: string): void => {
    const previousDueAt = value.scheduleRules.find((rule) => rule.nodeKey === nodeKey)?.dueAt || undefined;
    onChange({ ...value, scheduleRules: value.scheduleRules.filter((rule) => rule.nodeKey !== nodeKey) });
    if (previousDueAt) {
      onIntent?.(classifyBookHomeworkDeadlineMutation({
        nodeKey,
        previousDueAt,
        affectedStudentStates: affectedStudentStatesByNode[nodeKey],
      }));
    }
  };

  return (
    <section className="book-schedule-editor" aria-labelledby="book-schedule-title">
      <div className="book-schedule-editor__heading">
        <div>
          <h4 id="book-schedule-title">Book schedule</h4>
          <p>Open access is the default. Release dates and deadlines never create prerequisite unlocking.</p>
        </div>
        <span>Schedule intent only</span>
      </div>

      <div className="book-schedule-editor__assignment">
        <label>
          <span>Assignment available from</span>
          <input
            aria-label="Available From"
            type="datetime-local"
            value={localValue(value.availableFrom)}
            onChange={(event) => onChange({ ...value, availableFrom: updateLocal(value.availableFrom, event.target.value) })}
          />
          {disambiguation(value.availableFrom, (availableFrom) => onChange({ ...value, availableFrom }))}
          <small>Leave empty for open access.</small>
        </label>
        <label>
          <span>Final due date *</span>
          <input
            aria-label="Due Date"
            type="datetime-local"
            value={localValue(value.dueDate)}
            onChange={(event) => onChange({ ...value, dueDate: updateLocal(value.dueDate, event.target.value) })}
            required
          />
          {disambiguation(value.dueDate, (dueDate) => onChange({ ...value, dueDate }))}
          <small>All nested deadlines must be equal to or earlier than this date.</small>
        </label>
      </div>

      <p className="book-schedule-editor__authority">
        Deadlines may be extended at any time. Adding or shortening a deadline after an affected student starts requires the trusted 33D command; this browser editor cannot authorize it.
      </p>

      {conflictMessage && <p className="book-schedule-editor__conflict" role="alert">{conflictMessage}</p>}
      {compiled.error && <p className="book-schedule-editor__conflict" role="alert">{compiled.error}</p>}

      <div className="book-schedule-editor__rules" aria-label="Nested structural schedules">
        {outline.map((node) => {
          const rule = value.scheduleRules.find((entry) => entry.nodeKey === node.nodeKey);
          const effective = compiled.schedule
            ? resolveEffectiveBookHomeworkWindow({
                schedule: compiled.schedule,
                outline,
                nodeKey: node.nodeKey,
              })
            : null;
          return (
            <fieldset key={node.nodeKey}>
              <legend>{node.titleSnapshot || node.nodeKey} <small>{node.nodeType}</small></legend>
              <div className="book-schedule-editor__rule-fields">
                <label>
                  <span>Release override</span>
                  <input
                    aria-label={`Release override for ${node.titleSnapshot || node.nodeKey}`}
                    type="datetime-local"
                    value={localValue(rule?.availableFrom ?? '')}
                    onChange={(event) => onChange({
                      ...value,
                      scheduleRules: updateRule(value.scheduleRules, node.nodeKey, {
                        availableFrom: updateLocal(rule?.availableFrom ?? '', event.target.value),
                      }),
                    })}
                  />
                  {disambiguation(rule?.availableFrom ?? '', (availableFrom) => onChange({
                    ...value,
                    scheduleRules: updateRule(value.scheduleRules, node.nodeKey, { availableFrom }),
                  }))}
                </label>
                <label>
                  <span>Deadline override</span>
                  <input
                    aria-label={`Deadline override for ${node.titleSnapshot || node.nodeKey}`}
                    type="datetime-local"
                    value={localValue(rule?.dueAt ?? '')}
                    onChange={(event) => changeDeadline(
                      node.nodeKey,
                      updateLocal(rule?.dueAt ?? '', event.target.value),
                    )}
                  />
                  {disambiguation(rule?.dueAt ?? '', (dueAt) => changeDeadline(node.nodeKey, dueAt))}
                </label>
                <button type="button" onClick={() => clearRule(node.nodeKey)} disabled={!rule}>
                  Remove overrides
                </button>
              </div>
              <p>
                Release: {effective?.release.explanation ?? 'Set the final due date to resolve inheritance.'}
                {' '}
                Deadline: {effective?.deadline.explanation ?? 'Set the final due date to resolve inheritance.'}
              </p>
            </fieldset>
          );
        })}
      </div>

      {compiled.schedule && (
        <table className="book-schedule-editor__windows">
          <caption>Effective Activity windows</caption>
          <thead>
            <tr><th scope="col">Activity</th><th scope="col">Release</th><th scope="col">Deadline</th></tr>
          </thead>
          <tbody>
            {activities.filter((activity) => activity.state === 'required').map((activity) => {
              const effective = resolveEffectiveBookHomeworkWindow({
                schedule: compiled.schedule!,
                outline,
                nodeKey: activity.nodeKey,
              });
              return (
                <tr key={activity.placementId}>
                  <th scope="row">{activity.titleSnapshot || activity.activityId}</th>
                  <td>{effective.release.value ?? 'Open access'}</td>
                  <td>{effective.deadline.value}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </section>
  );
};

export default BookScheduleEditor;
