#!/usr/bin/env node

/**
 * Pre-commit Enforcement Script
 * 
 * Runs on `git commit` to enforce project rules on NEW files only.
 * Existing files are left alone — rules are forward-only.
 * 
 * Rules enforced:
 * - Rule 15: No @mantine/* imports in NEW .tsx/.jsx/.ts files
 * 
 * Usage:
 *   node scripts/pre-commit-enforcement.js          (check staged files)
 *   node scripts/pre-commit-enforcement.js --fix    (interactive mode)
 *   node scripts/pre-commit-enforcement.js --check  (CI mode, exit 1 on fail)
 * 
 * Install as git hook:
 *   Copy to .git/hooks/pre-commit or use with husky/lint-staged
 */

import { execSync } from 'child_process';
import { readFileSync } from 'fs';

const isCI = process.argv.includes('--check');
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const GREEN = '\x1b[32m';
const DIM = '\x1b[2m';
const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';

function getStagedNewFiles() {
    try {
        // 'A' = newly Added files only (not Modified, Deleted, etc.)
        const output = execSync('git diff --cached --name-only --diff-filter=A', { encoding: 'utf-8' });
        return output.trim().split('\n').filter(Boolean);
    } catch {
        return [];
    }
}

function getStagedModifiedFiles() {
    try {
        // 'M' = Modified files
        const output = execSync('git diff --cached --name-only --diff-filter=M', { encoding: 'utf-8' });
        return output.trim().split('\n').filter(Boolean);
    } catch {
        return [];
    }
}

function getNewMantineImportsInModifiedFile(filePath) {
    try {
        // Get only the ADDED lines (lines with '+' prefix) from the staged diff
        const diff = execSync(`git diff --cached -U0 "${filePath}"`, { encoding: 'utf-8' });
        const addedLines = diff.split('\n')
            .filter(line => line.startsWith('+') && !line.startsWith('+++'))
            .map(line => line.substring(1)); // Remove the '+' prefix

        return addedLines.filter(line =>
            line.match(/import\s+.*from\s+['"]@mantine\//) ||
            line.match(/require\(['"]@mantine\//)
        );
    } catch {
        return [];
    }
}

function checkMantineInNewFile(filePath) {
    try {
        const content = readFileSync(filePath, 'utf-8');
        const lines = content.split('\n');
        const violations = [];

        lines.forEach((line, i) => {
            if (line.match(/import\s+.*from\s+['"]@mantine\//) ||
                line.match(/require\(['"]@mantine\//)) {
                violations.push({ line: i + 1, content: line.trim() });
            }
        });

        return violations;
    } catch {
        return [];
    }
}



// ── Main ──────────────────────────────────────────────────────────

console.log(`\n${BOLD}🔍 Pre-commit Rule Enforcement${RESET}\n`);

let hasErrors = false;
let hasWarnings = false;

// ── Rule 15: No Mantine in NEW files ─────────────────────────────

const newFiles = getStagedNewFiles()
    .filter(f => f.match(/\.(tsx|jsx|ts)$/) && f.startsWith('src/'));

if (newFiles.length > 0) {
    console.log(`${DIM}Checking ${newFiles.length} new file(s) for @mantine imports...${RESET}`);

    for (const file of newFiles) {
        const violations = checkMantineInNewFile(file);
        if (violations.length > 0) {
            hasErrors = true;
            console.log(`\n${RED}${BOLD}🚫 Rule 15 VIOLATION: ${file}${RESET}`);
            console.log(`${RED}   New file contains @mantine imports — this is BANNED for new code.${RESET}`);
            for (const v of violations) {
                console.log(`${RED}   Line ${v.line}: ${v.content}${RESET}`);
            }
            console.log(`${DIM}   → Use native HTML/CSS instead. See documentation/integration-safety-rules.md#rule-15${RESET}`);
        }
    }
}

// ── Rule 15: No NEW Mantine imports in MODIFIED files ────────────

const modifiedFiles = getStagedModifiedFiles()
    .filter(f => f.match(/\.(tsx|jsx|ts)$/) && f.startsWith('src/'));

if (modifiedFiles.length > 0) {
    console.log(`${DIM}Checking ${modifiedFiles.length} modified file(s) for NEW @mantine imports...${RESET}`);

    for (const file of modifiedFiles) {
        const newImports = getNewMantineImportsInModifiedFile(file);
        if (newImports.length > 0) {
            hasErrors = true;
            console.log(`\n${RED}${BOLD}🚫 Rule 15 VIOLATION: ${file}${RESET}`);
            console.log(`${RED}   Adding NEW @mantine imports to existing files is BANNED.${RESET}`);
            for (const imp of newImports) {
                console.log(`${RED}   + ${imp.trim()}${RESET}`);
            }
            console.log(`${DIM}   → Existing Mantine usage is fine, but don't add more.${RESET}`);
        }
    }
}



// ── Summary ──────────────────────────────────────────────────────

console.log('');
if (hasErrors) {
    console.log(`${RED}${BOLD}❌ Commit blocked — fix the violations above.${RESET}`);
    if (isCI) process.exit(1);
    // In non-CI mode, still exit 1 to block the commit
    process.exit(1);
} else if (hasWarnings) {
    console.log(`${YELLOW}⚠️  Warnings found — commit allowed, but please address them.${RESET}`);
    process.exit(0);
} else {
    console.log(`${GREEN}✅ All enforcement checks passed.${RESET}`);
    process.exit(0);
}
