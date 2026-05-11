import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const V2_CORE_ROOTS = ['src/services/reading-v2', 'src/components/reading-v2'] as const;
const RESULT_SURFACE_ROOTS = ['src/pages', 'src/components'] as const;
const REQUIRED_BOUNDARY_NOTES = [
  {
    filePath: 'src/types/readingV2.types.ts',
    tokens: ['canonical', 'projection'],
  },
  {
    filePath: 'src/services/reading-v2/readingV2Repository.service.ts',
    tokens: ['Reading V2', 'Repository'],
  },
  {
    filePath: 'src/services/reading-v2/readingV2Projection.service.ts',
    tokens: ['Projection'],
  },
  {
    filePath: 'src/components/reading-v2/runtime/ReadingV2RuntimeShell.tsx',
    tokens: ['runtime boundary', 'derived V2 projections only'],
  },
  {
    filePath: 'src/services/reading-v2/readingV2LaunchIntegration.service.ts',
    tokens: ['launch adapter boundary', 'explicit engine-marked'],
  },
  {
    filePath: 'src/services/reading-v2/readingV2Result.service.ts',
    tokens: ['result boundary', 'existing result/feedback shells'],
  },
] as const;

const FORBIDDEN_IMPORT_PATTERNS = [
  /from ['"].*IELTSQuestionsPanel/,
  /from ['"].*QuestionEditorPanel/,
  /from ['"].*TestEditor/,
  /from ['"].*readingQuestionGroups/,
  /from ['"].*readingQuestionContract/,
  /from ['"].*tableCompletionTransforms/,
  /from ['"].*tableCompletionCanonicalizer/,
  /from ['"].*tableCompletionRepair/,
  /from ['"].*tableCompletionValidator/,
  /from ['"].*ai-extractor\.service/,
  /from ['"].*offline-parser\.service/,
];

const collectSourceFiles = (directory: string): string[] => {
  const entries = readdirSync(directory);

  return entries.flatMap((entry) => {
    const path = join(directory, entry);
    const stats = statSync(path);

    if (stats.isDirectory()) {
      return collectSourceFiles(path);
    }

    return /\.(ts|tsx|js|jsx)$/.test(path) ? [path] : [];
  });
};

describe('Reading V2 boundary imports', () => {
  it('keeps V2 core folders independent from legacy Reading editor/runtime/parser/scoring helpers', () => {
    const violations = V2_CORE_ROOTS.flatMap(collectSourceFiles).flatMap((filePath) => {
      const content = readFileSync(filePath, 'utf8');
      return FORBIDDEN_IMPORT_PATTERNS.filter((pattern) => pattern.test(content)).map(
        (pattern) => `${relative(process.cwd(), filePath)} matched ${pattern}`,
      );
    });

    expect(violations).toEqual([]);
  });

  it('does not introduce standalone Reading V2 result-review routes, pages, or review components', () => {
    const forbiddenPathPatterns = [
      /src[\\/](pages|components)[\\/]reading-v2[\\/]review/i,
      /src[\\/](pages|components)[\\/].*ReadingV2(Teacher|Student)Review/i,
      /src[\\/](pages|components)[\\/].*ReadingV2.*ResultReview/i,
      /src[\\/](pages|components)[\\/].*ReadingV2.*ResultsPage/i,
    ];
    const forbiddenRoutePatterns = [
      /\/teacher\/reading-v2\/results/i,
      /\/student\/reading-v2\/results/i,
    ];
    const files = RESULT_SURFACE_ROOTS.flatMap(collectSourceFiles);
    const pathViolations = files.filter((filePath) =>
      forbiddenPathPatterns.some((pattern) => pattern.test(filePath.replace(/\\/g, '/'))),
    );
    const routeViolations = files.flatMap((filePath) => {
      const content = readFileSync(filePath, 'utf8');
      return forbiddenRoutePatterns
        .filter((pattern) => pattern.test(content))
        .map((pattern) => `${relative(process.cwd(), filePath)} matched ${pattern}`);
    });

    expect([...pathViolations.map((filePath) => relative(process.cwd(), filePath)), ...routeViolations]).toEqual([]);
  });

  it('does not introduce a new Reading V2 Teacher Lobby page, dashboard, or Reading-only filter rail', () => {
    const forbiddenPatterns = [
      /ReadingV2TeacherLobby(Page|Dashboard)/i,
      /ReadingV2LobbyDashboard/i,
      /reading-v2-only-filter/i,
      /ReadingOnlyFilterRail/i,
      /\/teacher\/reading-v2\/lobby/i,
      /\/teacher\/reading-v2\/dashboard/i,
    ];
    const files = RESULT_SURFACE_ROOTS.flatMap(collectSourceFiles);
    const violations = files.flatMap((filePath) => {
      const content = readFileSync(filePath, 'utf8');
      return forbiddenPatterns
        .filter((pattern) => pattern.test(content))
        .map((pattern) => `${relative(process.cwd(), filePath)} matched ${pattern}`);
    });

    expect(violations).toEqual([]);
  });

  it('keeps code-level boundary notes at V2 entry points before rollout', () => {
    const missingNotes = REQUIRED_BOUNDARY_NOTES.filter(({ filePath, tokens }) => {
      const content = readFileSync(filePath, 'utf8');
      const head = content.slice(0, 600);
      return !tokens.every((token) => head.includes(token));
    }).map(({ filePath }) => filePath);

    expect(missingNotes).toEqual([]);
  });
});
