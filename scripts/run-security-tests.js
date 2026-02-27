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
        'src/__tests__/security',
        'src/services/auditService.test.ts',
        'src/hooks/useSecureService.test.ts',
        'src/hooks/useOwnershipCheck.test.ts',
        'src/services/securityMiddleware.test.ts',
        'src/config/roleHierarchy.test.ts',
        'src/components/PrivateRoute.test.tsx',
        'src/pages/AccessDeniedPage.test.tsx',
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

// =============================================================================
// MAIN
// =============================================================================

async function runSecurityTests() {
    printHeader();

    const startTime = Date.now();

    // Check if vitest is available
    const vitestPath = path.join(process.cwd(), 'node_modules', '.bin', 'vitest');
    if (!fs.existsSync(vitestPath + '.cmd') && !fs.existsSync(vitestPath)) {
        log('Error: vitest not found. Run npm install first.', 'red');
        process.exit(2);
    }

    // Build test command arguments
    const args = [
        'run',
        '--reporter=' + CONFIG.outputFormat,
        '--passWithNoTests=false',
    ];

    // Add test paths
    CONFIG.testPaths.forEach(testPath => {
        const fullPath = path.join(process.cwd(), testPath);
        if (fs.existsSync(fullPath)) {
            args.push(testPath);
        } else {
            log(`Warning: Test path not found: ${testPath}`, 'yellow');
        }
    });

    log('Running security tests...', 'blue');
    log(`Command: npx vitest ${args.join(' ')}\n`, 'cyan');

    // Run vitest
    return new Promise((resolve) => {
        const isWindows = process.platform === 'win32';
        const command = isWindows ? 'npx.cmd' : 'npx';

        const vitest = spawn(command, ['vitest', ...args], {
            cwd: process.cwd(),
            stdio: 'pipe',
            shell: isWindows,
        });

        let stdout = '';
        let stderr = '';

        vitest.stdout.on('data', (data) => {
            const text = data.toString();
            stdout += text;
            process.stdout.write(text);
        });

        vitest.stderr.on('data', (data) => {
            const text = data.toString();
            stderr += text;
            process.stderr.write(text);
        });

        vitest.on('close', (code) => {
            const duration = Date.now() - startTime;

            // Parse results from output
            const passedMatch = stdout.match(/(\d+) passed/);
            const failedMatch = stdout.match(/(\d+) failed/);
            const skippedMatch = stdout.match(/(\d+) skipped/);

            const passed = passedMatch ? parseInt(passedMatch[1]) : 0;
            const failed = failedMatch ? parseInt(failedMatch[1]) : 0;
            const skipped = skippedMatch ? parseInt(skippedMatch[1]) : 0;

            printSummary(passed, failed, skipped, duration);

            // Write results to file for CI/CD artifacts
            const results = {
                timestamp: new Date().toISOString(),
                passed,
                failed,
                skipped,
                duration,
                success: code === 0,
            };

            const resultsPath = path.join(process.cwd(), 'security-test-results.json');
            fs.writeFileSync(resultsPath, JSON.stringify(results, null, 2));
            log(`Results saved to: ${resultsPath}`, 'cyan');

            resolve(code);
        });

        vitest.on('error', (error) => {
            log(`Error running tests: ${error.message}`, 'red');
            resolve(2);
        });
    });
}

// =============================================================================
// RUN
// =============================================================================

runSecurityTests()
    .then((exitCode) => {
        process.exit(exitCode);
    })
    .catch((error) => {
        log(`Unexpected error: ${error.message}`, 'red');
        process.exit(2);
    });
