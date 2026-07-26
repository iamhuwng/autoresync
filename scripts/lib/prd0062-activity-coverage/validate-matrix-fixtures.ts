import { validateEditableActivity } from '../../../src/services/book-activity/activitySchema.service';
import { ACTIVITY_SCHEMA_FIXTURES } from '../../__tests__/fixtures/prd0062-activity-coverage/activity-schema-fixtures.mjs';
import { makeTaskProfileRegistry } from './validator.mjs';
import { readFile } from 'node:fs/promises';

const matrixPath = process.argv[2];
if (!matrixPath) throw new Error('Matrix path is required.');
interface CoverageMatrixRow {
  fixtureId: string;
  profile: { taxonomyId: string; typeId: string; taxonomyVersion: number };
  interaction: { family: string; variant: string };
  stimulus: { needs: string[]; assetKinds: string[] };
  contextRequirement: { mode: string; acceptedKinds: string[] };
  presentationMode: string;
  scoringReview: { mode: string };
  accessibility: { representations: string[] };
  support: { state: string };
}
const matrix = JSON.parse(await readFile(matrixPath, 'utf8')) as {
  rows: CoverageMatrixRow[];
};
const supportedStates = new Set(['structurally-supported', 'source-assisted-supported']);
const registry = makeTaskProfileRegistry(matrix.rows);
const same = (left: unknown, right: unknown) => JSON.stringify(left) === JSON.stringify(right);

const failures = matrix.rows
  .filter((row) => supportedStates.has(row.support.state))
  .flatMap((row) => {
    const fixture = ACTIVITY_SCHEMA_FIXTURES[row.fixtureId];
    if (!fixture) return [{ fixtureId: row.fixtureId, errors: ['missing committed fixture'] }];
    const correspondenceErrors: string[] = [];
    if (!same(fixture.coverage.stimulusNeeds, row.stimulus.needs)) correspondenceErrors.push('stimulus needs differ');
    if (!same(fixture.coverage.assetKinds, row.stimulus.assetKinds)) correspondenceErrors.push('asset kinds differ');
    if (!same(fixture.coverage.contextRequirement, row.contextRequirement)) correspondenceErrors.push('context differs');
    if (!same(fixture.coverage.accessibilityRepresentations, row.accessibility.representations)) correspondenceErrors.push('accessibility representations differ');
    if (!same(fixture.activity.taskProfile, row.profile)) correspondenceErrors.push('Task Profile differs');
    if (!same(fixture.activity.interaction, row.interaction)) correspondenceErrors.push('interaction differs');
    if (fixture.activity.presentationMode !== row.presentationMode) correspondenceErrors.push('presentation differs');
    if (fixture.activity.scoring.mode !== row.scoringReview.mode) correspondenceErrors.push('scoring mode differs');
    if (fixture.activity.responseCodec !== undefined) correspondenceErrors.push('fixture leaks non-schema responseCodec');
    if (!same(fixture.activity.contextRequirement, row.contextRequirement)) correspondenceErrors.push('Activity context differs');
    const fixtureAssetKinds = fixture.activity.assetRefs.map(
      (asset: { kind: string }) => asset.kind,
    );
    if (!same([...new Set(fixtureAssetKinds)].sort(), [...row.stimulus.assetKinds].sort())) correspondenceErrors.push('Activity assets differ');
    if (row.stimulus.needs.some((need: string) => need.startsWith('embedded-')) && fixture.activity.stimulus === null) correspondenceErrors.push('embedded stimulus absent');
    if (row.presentationMode === 'source-assisted' && fixture.activity.stimulus !== null) correspondenceErrors.push('source-assisted fixture embeds source');
    const result = validateEditableActivity(fixture.activity, {
      taskProfileRegistry: registry,
      mappedBookPageRefs: row.presentationMode === 'source-assisted' ? ['fixture-page-1'] : undefined,
    });
    return result.valid && correspondenceErrors.length === 0
      ? []
      : [{ fixtureId: row.fixtureId, errors: [...correspondenceErrors, ...result.errors] }];
  });

const supportedFixtureIds = new Set(matrix.rows.filter((row) => supportedStates.has(row.support.state)).map((row) => row.fixtureId));
for (const fixtureId of Object.keys(ACTIVITY_SCHEMA_FIXTURES)) {
  if (!supportedFixtureIds.has(fixtureId)) failures.push({ fixtureId, errors: ['fixture has no supported matrix row'] });
}

if (failures.length > 0) {
  console.log(JSON.stringify({
    ok: false,
    issues: failures.flatMap((failure) =>
      failure.errors.map((error) => ({
        code: 'invalid-schema-fixture',
        path: `$fixtures.${failure.fixtureId}`,
        message: typeof error === 'string' ? error : JSON.stringify(error),
      }))),
  }));
  process.exitCode = 1;
} else {
  console.log(JSON.stringify({
    ok: true,
    issues: [],
    fixtureCount: supportedFixtureIds.size,
  }));
}
