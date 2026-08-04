import { readFile } from 'node:fs/promises';
import path from 'node:path';

export const CANONICAL_ACTIVITY_SCHEMA_SOURCE = 'src/types/bookActivity.types.ts';

const uniqueSorted = (values) => [...new Set(values)].sort();

const sourceArray = (source, exportName) => {
  const match = source.match(new RegExp(`export const ${exportName} = \\[([\\s\\S]*?)\\] as const`, 'u'));
  return match ? uniqueSorted([...match[1].matchAll(/'([^']+)'/gu)].map((entry) => entry[1])) : [];
};

export async function readCanonicalActivitySchema(rootDir) {
  const sourcePath = path.join(rootDir, CANONICAL_ACTIVITY_SCHEMA_SOURCE);
  const source = await readFile(sourcePath, 'utf8');
  const version = source.match(/export const ACTIVITY_SCHEMA_VERSION = (\d+) as const;/u)?.[1];
  return {
    source: CANONICAL_ACTIVITY_SCHEMA_SOURCE,
    schemaVersion: version ? Number(version) : null,
    families: sourceArray(source, 'ACTIVITY_INTERACTION_FAMILIES'),
    presentationModes: sourceArray(source, 'ACTIVITY_PRESENTATION_MODES'),
    contextModes: sourceArray(source, 'ACTIVITY_CONTEXT_MODES'),
  };
}

export async function readCanonicalTaxonomyEvidence(rootDir) {
  const reading = await readFile(path.join(rootDir, 'src/types/readingV2Taxonomy.ts'), 'utf8');
  const listening = await readFile(
    path.join(rootDir, 'documentation/samples/IELTS-listening-question-type-display-design.md'),
    'utf8',
  );
  return {
    reading: uniqueSorted([...reading.matchAll(/canonicalSlug:\s*'([^']+)'/gu)].map((match) => match[1])),
    listening: uniqueSorted([...listening.matchAll(/^\|\s*`(listening-[^`]+)`\s*\|/gmu)].map((match) => match[1])),
  };
}
