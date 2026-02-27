#!/bin/sh
#
# Pre-commit hook for security tests
# Part of RBAC Security Hardening (PRD-0016), Task 8.20
#
# This hook runs security tests before each commit to ensure
# no security vulnerabilities are introduced.
#
# Installation:
#   Copy this file to .git/hooks/pre-commit
#   chmod +x .git/hooks/pre-commit
#
# Or use the install script:
#   npm run security:install-hooks
#

echo "🔒 Running security pre-commit checks..."

# Get list of staged files
STAGED_FILES=$(git diff --cached --name-only --diff-filter=ACM)

# Check if any security-related files are being changed
SECURITY_FILES=$(echo "$STAGED_FILES" | grep -E "(security|auth|role|permission|access|private|protected)" || true)

# Check if any service files are being changed
SERVICE_FILES=$(echo "$STAGED_FILES" | grep -E "src/services/.*\.tsx?$" || true)

# Check if any hook files are being changed
HOOK_FILES=$(echo "$STAGED_FILES" | grep -E "src/hooks/.*\.tsx?$" || true)

# Count relevant files
SECURITY_COUNT=$(echo "$SECURITY_FILES" | grep -c "." 2>/dev/null || echo "0")
SERVICE_COUNT=$(echo "$SERVICE_FILES" | grep -c "." 2>/dev/null || echo "0")
HOOK_COUNT=$(echo "$HOOK_FILES" | grep -c "." 2>/dev/null || echo "0")

# If security-related files are changed, run full security tests
if [ "$SECURITY_COUNT" -gt 0 ]; then
    echo "⚠️  Security-related files changed ($SECURITY_COUNT files). Running full security test suite..."
    npm run test:security
    
    if [ $? -ne 0 ]; then
        echo "❌ Security tests failed. Commit aborted."
        echo "   Please fix the failing tests before committing."
        exit 1
    fi
    
    echo "✅ Security tests passed."
elif [ "$SERVICE_COUNT" -gt 0 ] || [ "$HOOK_COUNT" -gt 0 ]; then
    echo "📦 Service/Hook files changed. Running quick security validation..."
    
    # Run a subset of security tests (faster)
    npx vitest run src/__tests__/security/ownership.test.ts --reporter=dot 2>/dev/null
    
    if [ $? -ne 0 ]; then
        echo "⚠️  Quick security validation failed. Running full suite..."
        npm run test:security
        
        if [ $? -ne 0 ]; then
            echo "❌ Security tests failed. Commit aborted."
            exit 1
        fi
    fi
    
    echo "✅ Security validation passed."
else
    echo "✅ No security-sensitive files changed. Skipping security tests."
fi

echo "🎉 Pre-commit checks passed!"
exit 0
