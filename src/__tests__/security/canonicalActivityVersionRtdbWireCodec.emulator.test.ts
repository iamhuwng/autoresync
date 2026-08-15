import { afterAll, describe, expect, it } from 'vitest';
import {
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';

import committedProductionState from '../../../tmp/prd0062-bridge-m1-committed-state-fixture.json';
import {
  hydrateCanonicalActivityVersionFromRtdb,
} from '../../../cloudflare/src/upload-worker/book-assembly/canonical-activity-version-repository';
import {
  assertCanonicalPublishedActivityVersion,
  createCanonicalActivityVersionFingerprint,
} from '../../services/book-assembly/canonicalActivityVersion.service';

const describeEmulator = process.env.FIREBASE_DATABASE_EMULATOR_HOST ? describe : describe.skip;
let testEnv: RulesTestEnvironment;

const withoutFingerprint = (value: Record<string, unknown>): Record<string, unknown> => {
  const copy = structuredClone(value);
  delete copy.payloadFingerprint;
  return copy;
};

describeEmulator('canonical Activity Version RTDB wire hydration', () => {
  afterAll(async () => { await testEnv?.cleanup(); });

  it('reconstructs only RTDB-erased schema-v1 null and empty-array children on read', async () => {
    testEnv = await initializeTestEnvironment({
      projectId: 'demo-canonical-activity-wire-codec',
    });
    const rawProduction = committedProductionState.canonicalActivity as Record<string, unknown>;
    const canonical = hydrateCanonicalActivityVersionFromRtdb(rawProduction) as Record<string, unknown>;
    expect(assertCanonicalPublishedActivityVersion(canonical)).toEqual(canonical);

    const path = `book_activity/versions/${canonical.activityId as string}/${canonical.activityVersionId as string}`;
    const safePath = `book_activity/student_safe_projections/${canonical.activityId as string}/${canonical.activityVersionId as string}`;
    const fullSafeProjection = {
      ...committedProductionState.studentSafeProjection,
      content: canonical.projection,
    };
    let wireValue: Record<string, unknown> | null = null;
    let safeWireValue: Record<string, unknown> | null = null;
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const ref = context.database().ref(path);
      await ref.set(canonical);
      wireValue = (await ref.once('value')).val() as Record<string, unknown> | null;
      const safeRef = context.database().ref(safePath);
      await safeRef.set(fullSafeProjection);
      safeWireValue = (await safeRef.once('value')).val() as Record<string, unknown> | null;
    });

    expect(wireValue).not.toBeNull();
    expect(wireValue).not.toHaveProperty('evidenceRefs');
    expect(wireValue).not.toHaveProperty('activity.taskProfile');
    expect(wireValue).not.toHaveProperty('activity.stimulus');
    expect(wireValue).not.toHaveProperty('activity.assetRefs');
    expect(wireValue).not.toHaveProperty('projection.taskProfile');
    expect(wireValue).not.toHaveProperty('projection.stimulus');
    expect(wireValue).not.toHaveProperty('projection.assetRefs');
    expect(createCanonicalActivityVersionFingerprint(withoutFingerprint(wireValue!) as never))
      .toBe('fnv1a64:995d6073941e3893');

    const hydrated = hydrateCanonicalActivityVersionFromRtdb(wireValue);
    expect(assertCanonicalPublishedActivityVersion(hydrated)).toEqual(canonical);
    expect((hydrated as Record<string, unknown>).payloadFingerprint)
      .toBe('fnv1a64:2fcc389f248bb9ae');
    expect(safeWireValue).toEqual(committedProductionState.studentSafeProjection);

    const tampered = structuredClone(wireValue!);
    delete tampered.createdByOperationId;
    expect(() => assertCanonicalPublishedActivityVersion(
      hydrateCanonicalActivityVersionFromRtdb(tampered),
    )).toThrow('invalid_canonical_activity_version:$.createdByOperationId:missing-field');

    await testEnv.withSecurityRulesDisabled(async (context) => {
      expect((await context.database().ref(path).once('value')).val()).toEqual(wireValue);
      expect((await context.database().ref(safePath).once('value')).val()).toEqual(safeWireValue);
    });
  });
});
