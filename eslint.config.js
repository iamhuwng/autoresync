import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

const sharedGlobals = {
  ...globals.browser,
  ...globals.node,
  ...globals.serviceworker,
  ...globals.es2021,
  ...globals.vitest,
}

const parserOptions = {
  ecmaVersion: 'latest',
  ecmaFeatures: { jsx: true },
  sourceType: 'module',
}

const baselineRules = {
  '@typescript-eslint/no-unused-vars': 'off',
  'no-async-promise-executor': 'off',
  'no-case-declarations': 'off',
  'no-constant-binary-expression': 'off',
  'no-control-regex': 'off',
  'no-empty': 'off',
  'no-empty-pattern': 'off',
  'no-extra-boolean-cast': 'off',
  'no-irregular-whitespace': 'off',
  'no-misleading-character-class': 'off',
  'no-prototype-builtins': 'off',
  'no-redeclare': 'off',
  'no-regex-spaces': 'off',
  'no-undef': 'off',
  'no-unexpected-multiline': 'off',
  'no-unused-vars': 'off',
  'no-unreachable': 'off',
  'no-useless-escape': 'off',
  'react-hooks/exhaustive-deps': 'off',
  'react-hooks/rules-of-hooks': 'off',
  'react-refresh/only-export-components': 'off',
}

const plugins = {
  '@typescript-eslint': tseslint.plugin,
  'react-hooks': reactHooks,
  'react-refresh': reactRefresh,
}

export default defineConfig([
  globalIgnores([
    '.backup/**',
    '.knowns/**',
    'artifacts/**',
    'cloudflare/.wrangler/**',
    'coverage/**',
    'dist/**',
    'documentation/archive/**',
    'documentation/backup_old_grading/**',
    'logs/**',
    'node_modules/**',
    'old-dashboard.jsx',
    'output/**',
    'tmp/**',
    '**/*.backup.*',
  ]),
  {
    linterOptions: {
      reportUnusedDisableDirectives: 'off',
    },
  },
  {
    files: ['**/*.{js,jsx,cjs,mjs}'],
    extends: [
      js.configs.recommended,
    ],
    plugins,
    languageOptions: {
      ecmaVersion: 2020,
      globals: sharedGlobals,
      parserOptions,
    },
    rules: baselineRules,
  },
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
    ],
    plugins,
    languageOptions: {
      ecmaVersion: 2020,
      globals: sharedGlobals,
      parser: tseslint.parser,
      parserOptions,
    },
    rules: {
      ...baselineRules,
    },
  },

])
