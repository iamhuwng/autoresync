import { describe, expect, it } from 'vitest';
import {
  buildListeningSoloAttemptIdentity,
  buildListeningSoloResultId,
} from './listeningSoloAttemptIdentity';

describe('listeningSoloAttemptIdentity', () => {
  it('derives one stable homework submit operation from the bound submission attempt', () => {
    const identity = buildListeningSoloAttemptIdentity({
      materialId: 'listening/material.1',
      studentId: 'student#1',
      scopeContext: {
        mode: 'homework',
        homeworkId: 'hw/1',
        submissionId: 'sub[1]',
      },
    });

    expect(identity.attemptId).toBe('homework__student%231__listening%2Fmaterial%2E1__hw%2F1__sub%5B1%5D');
    expect(identity.submissionOperationId).toBe(`${identity.attemptId}__submit`);
    expect(buildListeningSoloResultId(identity.submissionOperationId)).toBe(
      'listening_solo__homework__student%231__listening%2Fmaterial%2E1__hw%2F1__sub%5B1%5D__submit',
    );
  });

  it('preserves a resumed attempt identity instead of minting a new submit operation', () => {
    const identity = buildListeningSoloAttemptIdentity({
      materialId: 'material-1',
      studentId: 'student-1',
      scopeContext: { mode: 'self_study' },
      existingAttemptId: 'self_study__student-1__material-1__attempt-abc',
      existingSubmissionOperationId: 'self_study__student-1__material-1__attempt-abc__submit',
    });

    expect(identity.attemptId).toBe('self_study__student-1__material-1__attempt-abc');
    expect(identity.submissionOperationId).toBe('self_study__student-1__material-1__attempt-abc__submit');
    expect(identity.resultId).toBe('listening_solo__self_study__student-1__material-1__attempt-abc__submit');
  });

  it('creates one reusable self-study attempt when a generated seed is supplied before answering starts', () => {
    const first = buildListeningSoloAttemptIdentity({
      materialId: 'material-1',
      studentId: 'student-1',
      scopeContext: { mode: 'self_study' },
      generatedAttemptSeed: 'attempt-001',
    });
    const second = buildListeningSoloAttemptIdentity({
      materialId: 'material-1',
      studentId: 'student-1',
      scopeContext: { mode: 'self_study' },
      existingAttemptId: first.attemptId,
    });

    expect(first.attemptId).toBe('self_study__student-1__material-1__attempt-001');
    expect(second.submissionOperationId).toBe(first.submissionOperationId);
    expect(second.resultId).toBe(first.resultId);
  });
});
