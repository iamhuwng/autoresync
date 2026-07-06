import assert from 'node:assert/strict';
import test from 'node:test';
import {
  findMantineImports,
  selectRelevantSourceFiles,
} from '../check-mantine-boundary.mjs';

test('findMantineImports detects single-line and multiline static imports', () => {
  const source = `
    import { Button } from '@mantine/core';
    import {
      useMediaQuery,
    } from "@mantine/hooks";
    export { notifications } from '@mantine/notifications';
  `;

  assert.deepEqual(findMantineImports(source, 'src/example.tsx'), [
    { line: 2, module: '@mantine/core' },
    { line: 3, module: '@mantine/hooks' },
    { line: 6, module: '@mantine/notifications' },
  ]);
});

test('findMantineImports ignores comments and ordinary strings', () => {
  const source = `
    // import { Button } from '@mantine/core';
    const documentation = "Use @mantine/core only in legacy files";
  `;

  assert.deepEqual(findMantineImports(source, 'src/example.ts'), []);
});

test('findMantineImports detects dynamic imports and require calls', () => {
  const source = `
    const modal = await import('@mantine/core');
    const hooks = require("@mantine/hooks");
  `;

  assert.deepEqual(findMantineImports(source, 'src/example.ts'), [
    { line: 2, module: '@mantine/core' },
    { line: 3, module: '@mantine/hooks' },
  ]);
});

test('selectRelevantSourceFiles normalizes and limits changed paths', () => {
  assert.deepEqual(selectRelevantSourceFiles([
    'src\\components\\Legacy.tsx',
    'src/services/query.ts',
    'documentation/example.ts',
    'src/styles.css',
    'functions/src/index.ts',
  ]), [
    'src/components/Legacy.tsx',
    'src/services/query.ts',
  ]);
});
