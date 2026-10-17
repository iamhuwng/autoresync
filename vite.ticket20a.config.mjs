import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, mergeConfig } from 'vite';
import baseConfig from './vite.config.js';

const repoRoot = path.dirname(fileURLToPath(import.meta.url));

/**
 * Acceptance-only harness isolation.
 *
 * A user-owned untracked transpilation artifact can shadow the authoritative
 * TypeScript module under Vite. Keep that artifact untouched and force this
 * ticket's localhost browser run to resolve the canonical source.
 */
export default mergeConfig(baseConfig, defineConfig({
  plugins: [{
    name: 'ticket20a-canonical-material-catalog-types',
    enforce: 'pre',
    resolveId(source) {
      if (source.endsWith('/materialCatalog.types.js')) {
        return path.resolve(repoRoot, 'src/types/materialCatalog.types.ts');
      }
      return null;
    },
    load(id) {
      if (id.endsWith('/src/types/materialCatalog.types.js')) {
        return 'export * from "/src/types/materialCatalog.types.ts";';
      }
      return null;
    },
  }],
}));
