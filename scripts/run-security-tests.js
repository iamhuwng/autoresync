#!/usr/bin/env node

/**
 * Security Test Runner for CI/CD
 * 
 * Part of RBAC Security Hardening (PRD-0016), Task 8.19.
 * 
 * This script runs all security-related tests and outputs results
 * in a format suitable for CI/CD pipelines.
 * 
 * Usage:
 *   node scripts/run-security-tests.js
 *   npm run test:security
 * 
 * Exit Codes:
 *   0 - All tests passed
 *   1 - Some tests failed
 *   2 - Configuration or runtime error
 */

import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

// =============================================================================
// CONFIGURATION
// =============================================================================

const CONFIG = {
    // Test directories/patterns to include
    testPaths: [
        'src/__tests__/security/firebaseRules.test.ts',
        'src/__tests__/security/homeworkFirestoreRules.test.ts',
        'src/__tests__/security/materialCatalogFirebaseRules.test.ts',
        'src/__tests__/security/multiRoleSwitch.test.ts',
        'src/__tests__/security/ownership.test.ts',
        'src/__tests__/security/readingV2FirebaseRules.test.ts',
        'src/__tests__/security/routeAccess.test.ts',
        'src/__tests__/security/sessionManagement.test.ts',
        'src/services/auditService.test.ts',
        'src/hooks/useSecureService.test.ts',
        'src/hooks/useOwnershipCheck.test.ts',
        'src/services/securityMiddleware.test.ts',
        'src/config/roleHierarchy.test.ts',
        'src/components/PrivateRoute.test.tsx',
        'src/pages/AccessDeniedPage.test.tsx',
    ],
    emulatorTestPaths: [
        'src/__tests__/security/prd0040-security.emulator.test.ts',
        'src/__tests__/security/prd0055-live-session-rules.emulator.test.ts',
        'src/__tests__/security/prd0056a-upload-session-rules.emulator.test.ts',
        'src/__tests__/security/prd0057-listening-authoring-rules.emulator.test.ts',
        'src/__tests__/security/prd0058-media-asset-rules.emulator.test.ts',
        'src/__tests__/security/prd0062RetiredDataQuarantineFirebaseRules.emulator.test.ts',
        'src/__tests__/security/retired-material-rules.emulator.test.ts',
    ],
    requiredTestPaths: [
        'src/__tests__/security/prd0062RetiredDataQuarantineFirebaseRules.emulator.test.ts',
    ],
    // Output format for CI/CD
    outputFormat: process.env.CI ? 'junit' : 'verbose',
    // Timeout for tests (ms)
    timeout: 60000,
    // Coverage threshold
    coverageThreshold: {
        statements: 70,
        branches: 60,
        functions: 70,
        lines: 70,
    },
};

// =============================================================================
// HELPERS
// =============================================================================

const colors = {
    reset: '\x1b[0m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    cyan: '\x1b[36m',
    bold: '\x1b[1m',
};

function log(message, color = 'reset') {
    const timestamp = new Date().toISOString().substring(11, 19);
    console.log(`${colors.cyan}[${timestamp}]${colors.reset} ${colors[color]}${message}${colors.reset}`);
}

function printHeader() {
    console.log('\n');
    console.log(colors.bold + colors.blue + '═'.repeat(60) + colors.reset);
    console.log(colors.bold + colors.blue + '  🔒 SECURITY TEST RUNNER - PRD-0016 RBAC' + colors.reset);
    console.log(colors.bold + colors.blue + '═'.repeat(60) + colors.reset);
    console.log('');
}

function printSummary(passed, failed, skipped, duration) {
    console.log('\n');
    console.log(colors.bold + '─'.repeat(60) + colors.reset);
    console.log(colors.bold + '  TEST SUMMARY' + colors.reset);
    console.log('─'.repeat(60));
    console.log(`  ${colors.green}✓ Passed:${colors.reset}  ${passed}`);
    console.log(`  ${colors.red}✗ Failed:${colors.reset}  ${failed}`);
    console.log(`  ${colors.yellow}○ Skipped:${colors.reset} ${skipped}`);
    console.log(`  ⏱ Duration: ${(duration / 1000).toFixed(2)}s`);
    console.log('─'.repeat(60));

    if (failed > 0) {
        console.log(colors.bold + colors.red + '\n  ❌ SECURITY TESTS FAILED' + colors.reset);
        console.log(colors.red + '  Please fix failing tests before deployment.\n' + colors.reset);
    } else {
        console.log(colors.bold + colors.green + '\n  ✅ ALL SECURITY TESTS PASSED' + colors.reset);
        console.log(colors.green + '  Security validation complete.\n' + colors.reset);
    }
}

function resolveVitestCli() {
    return path.join(process.cwd(), 'node_modules', 'vitest', 'vitest.mjs');
}

function resolveFirebaseCli() {
    return path.join(process.cwd(), 'node_modules', 'firebase-tools', 'lib', 'bin', 'firebase.js');
}

function quoteShellArg(arg) {
    if (!/[\s"]/u.test(arg)) {
        return arg;
    }

    return `"${arg.replace(/"/g, '\\"')}"`;
}

function buildVitestCommandString(args) {
    return [
        quoteShellArg(process.execPath),
        quoteShellArg(resolveVitestCli()),
        ...args.map(quoteShellArg),
    ].join(' ');
}

export function collectExistingPaths(paths, requiredPaths = new Set()) {
    const existing = [];

    for (const testPath of paths) {
        const fullPath = path.join(process.cwd(), testPath);
        if (fs.existsSync(fullPath)) {
            existing.push(testPath);
        } else {
            if (requiredPaths.has(testPath)) {
                throw new Error(`Required security test path not found: ${testPath}`);
            }
            log(`Warning: Test path not found: ${testPath}`, 'yellow');
        }
    }

    return existing;
}

function parseVitestSummary(output) {
    const testsLine = output.match(/Tests\s+([^\n\r]+)/);
    const summaryText = testsLine?.[1] ?? output;
    const passedMatch = summaryText.match(/(\d+)\s+passed/);
    const failedMatch = summaryText.match(/(\d+)\s+failed/);
    const skippedMatch = summaryText.match(/(\d+)\s+skipped/);

    return {
        passed: passedMatch ? parseInt(passedMatch[1], 10) : 0,
        failed: failedMatch ? parseInt(failedMatch[1], 10) : 0,
        skipped: skippedMatch ? parseInt(skippedMatch[1], 10) : 0,
    };
}

function mergeSummary(left, right) {
    return {
        passed: left.passed + right.passed,
        failed: left.failed + right.failed,
        skipped: left.skipped + right.skipped,
    };
}

function runCommand(label, command, args) {
    log(label, 'blue');
    log(`Command: ${command} ${args.join(' ')}\n`, 'cyan');

    return new Promise((resolve) => {
        const child = spawn(command, args, {
            cwd: process.cwd(),
            stdio: 'pipe',
            shell: false,
        });

        let stdout = '';
        let stderr = '';

        child.stdout.on('data', (data) => {
            const text = data.toString();
            stdout += text;
            process.stdout.write(text);
        });

        child.stderr.on('data', (data) => {
            const text = data.toString();
            stderr += text;
            process.stderr.write(text);
        });

        child.on('close', (code) => {
            const exitCode = typeof code === 'number' ? code : 1;
            const summary = parseVitestSummary(`${stdout}\n${stderr}`);
            if (exitCode !== 0 && summary.passed === 0 && summary.failed === 0 && summary.skipped === 0) {
                summary.failed = 1;
            }

            resolve({
                code: exitCode,
                stdout,
                stderr,
                summary,
            });
        });

        child.on('error', (error) => {
            log(`Error running ${label}: ${error.message}`, 'red');
            resolve({
                code: 2,
                stdout,
                stderr,
                summary: { passed: 0, failed: 1, skipped: 0 },
            });
        });
    });
}

// =============================================================================
// MAIN
// =============================================================================

async function runSecurityTests() {
    printHeader();

    const startTime = Date.now();

    // Check if vitest is available
    const vitestPath = resolveVitestCli();
    if (!fs.existsSync(vitestPath)) {
        log('Error: vitest not found. Run npm install first.', 'red');
        process.exit(2);
    }

    // Build test command arguments
    const baseArgs = [
        'run',
        '--reporter=' + CONFIG.outputFormat,
        '--passWithNoTests=false',
    ];

    const regularTestPaths = collectExistingPaths(CONFIG.testPaths);
    const emulatorTestPaths = collectExistingPaths(
        CONFIG.emulatorTestPaths,
        new Set(CONFIG.requiredTestPaths),
    );

    let exitCode = 0;
    let totals = { passed: 0, failed: 0, skipped: 0 };

    if (regularTestPaths.length > 0) {
        const regularResult = await runCommand(
            'Running security unit tests...',
            process.execPath,
            [vitestPath, ...baseArgs, ...regularTestPaths],
        );
        exitCode = Math.max(exitCode, regularResult.code);
        totals = mergeSummary(totals, regularResult.summary);
    }

    if (emulatorTestPaths.length > 0) {
        const firebaseCli = resolveFirebaseCli();
        if (!fs.existsSync(firebaseCli)) {
            log('Error: firebase-tools CLI not found. Run npm install first.', 'red');
            exitCode = Math.max(exitCode, 2);
            totals.failed += emulatorTestPaths.length;
        } else {
            const emulatorCommand = buildVitestCommandString([
                ...baseArgs,
                ...emulatorTestPaths,
            ]);

            const emulatorResult = await runCommand(
                'Running security emulator tests...',
                process.execPath,
                [
                    firebaseCli,
                    'emulators:exec',
                    '--only',
                    'database,firestore',
                    emulatorCommand,
                ],
            );
            exitCode = Math.max(exitCode, emulatorResult.code);
            totals = mergeSummary(totals, emulatorResult.summary);
        }
    }

    const duration = Date.now() - startTime;
    printSummary(totals.passed, totals.failed, totals.skipped, duration);

    const results = {
        timestamp: new Date().toISOString(),
        passed: totals.passed,
        failed: totals.failed,
        skipped: totals.skipped,
        duration,
        success: exitCode === 0,
        regularTestPaths,
        emulatorTestPaths,
    };

    const resultsPath = path.join(process.cwd(), 'security-test-results.json');
    fs.writeFileSync(resultsPath, JSON.stringify(results, null, 2));
    log(`Results saved to: ${resultsPath}`, 'cyan');

    return exitCode;
}

// =============================================================================
// RUN
// =============================================================================

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    runSecurityTests()
        .then((exitCode) => {
            process.exit(exitCode);
        })
        .catch((error) => {
            log(`Unexpected error: ${error.message}`, 'red');
            process.exit(2);
        });
}
