import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

import { buildImportManifest } from '../build-ielts-reading-import.mjs';
import { closeTableCompletionRuntime } from '../table-completion-runtime.mjs';

afterAll(async () => {
  await closeTableCompletionRuntime();
});

describe('build-ielts-reading-import', () => {
  it('emits deterministic diagnostic ids and script-material metadata for known table fixtures', async () => {
    const sourceDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ielts-reading-import-'));
    const sourceFile = 'Practice Cam 17 Reading Test 04.md';
    await fs.writeFile(
      path.join(sourceDir, sourceFile),
      `### READING PASSAGE 1

## Bats to the rescue

Short passage text about bats, farms, pests, protein, culture, and houses.

### Questions 1-6

Do the following statements agree with the information given in Reading Passage 1?

**1** Many Madagascan forests are being destroyed by attacks from insects.

**2** Loss of habitat has badly affected insectivorous bats in Madagascar.

**3** Ricardo Rocha has carried out studies of bats in different parts of the world.

**4** Habitat modification has resulted in indigenous bats in Madagascar becoming useful to farmers.

**5** The Malagasy mouse-eared bat is more common than other indigenous bat species in Madagascar.

**6** Bats may feed on paddy swarming caterpillars and grass webworms.

### Questions 7-13

Complete the table below.

Choose ONE WORD ONLY from the passage for each answer.

The study carried out by Rocha's team

DNA analysis of bat **7** .........

The bats ate pests of rice, **8** ........, sugarcane, nuts and fruit.

The bats prevent disease by eating **9** ........ and blackflies.

They provide food rich in **10** .........

Buildings where they roost become **11** .........

They play an important role in local **12** .........

Farmers should provide special **13** ........ to support the bat population.

## Answer Cam 17 Reading Test 04

##### Passage 1

1 FALSE

2 FALSE

3 NOT GIVEN

4 TRUE

5 NOT GIVEN

6 TRUE

7 droppings

8 coffee

9 mosquitoes

10 protein

11 unclean

12 culture

13 houses
`,
      'utf8',
    );

    const cliOptions = {
      sourceDir,
      sourceFile,
      passageNumber: 1,
    };

    const firstManifest = await buildImportManifest(cliOptions);
    const secondManifest = await buildImportManifest(cliOptions);

    expect(firstManifest.materialCount).toBe(1);
    expect(secondManifest.materialCount).toBe(1);

    const firstMaterial = firstManifest.materials[0];
    const secondMaterial = secondManifest.materials[0];
    const firstDiagnostic = firstMaterial.tableCompletionDiagnostics?.[0];
    const secondDiagnostic = secondMaterial.tableCompletionDiagnostics?.[0];

    expect(firstMaterial.questionGroups ?? []).toHaveLength(0);
    expect(firstDiagnostic).toBeDefined();
    expect(firstDiagnostic.groupId).toBe(secondDiagnostic.groupId);
    expect(firstMaterial.tableCompletionDiagnostics).toEqual([
      expect.objectContaining({
        groupId: firstDiagnostic.groupId,
        sourceWorkflow: 'script-material',
        parseMode: 'unresolved',
        hasCanonicalGroup: false,
      }),
    ]);
  });
});
