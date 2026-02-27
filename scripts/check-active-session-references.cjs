/**
 * Migration Helper: Check for 'active_session' References
 * 
 * This script scans the codebase for hardcoded 'active_session' references
 * and reports which files need to be updated for the session code migration.
 * 
 * Usage: node scripts/check-active-session-references.js
 */

const fs = require('fs');
const path = require('path');

// Directories to scan
const SCAN_DIRS = [
  'src/pages',
  'src/components',
  'src/services',
  'src/hooks',
];

// File extensions to check
const FILE_EXTENSIONS = ['.js', '.jsx', '.ts', '.tsx'];

// Patterns to search for
const PATTERNS = [
  /active_session/g,
  /['"]active_session['"]/g,
  /game_sessions\/active_session/g,
];

// Results storage
const results = {
  totalFiles: 0,
  filesWithReferences: 0,
  references: [],
};

/**
 * Scan a directory recursively
 */
function scanDirectory(dir) {
  const files = fs.readdirSync(dir);

  files.forEach((file) => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);

    if (stat.isDirectory()) {
      // Recursively scan subdirectories
      scanDirectory(filePath);
    } else if (stat.isFile()) {
      const ext = path.extname(file);
      if (FILE_EXTENSIONS.includes(ext)) {
        scanFile(filePath);
      }
    }
  });
}

/**
 * Scan a single file for references
 */
function scanFile(filePath) {
  results.totalFiles++;

  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  const fileReferences = [];

  lines.forEach((line, index) => {
    PATTERNS.forEach((pattern) => {
      if (pattern.test(line)) {
        fileReferences.push({
          line: index + 1,
          content: line.trim(),
        });
      }
    });
  });

  if (fileReferences.length > 0) {
    results.filesWithReferences++;
    results.references.push({
      file: filePath.replace(/\\/g, '/'),
      count: fileReferences.length,
      references: fileReferences,
    });
  }
}

/**
 * Generate report
 */
function generateReport() {
  console.log('\n' + '='.repeat(80));
  console.log('ACTIVE_SESSION REFERENCE SCAN REPORT');
  console.log('='.repeat(80) + '\n');

  console.log(`📊 Summary:`);
  console.log(`   Total files scanned: ${results.totalFiles}`);
  console.log(`   Files with references: ${results.filesWithReferences}`);
  console.log(`   Total references found: ${results.references.reduce((sum, f) => sum + f.count, 0)}\n`);

  if (results.filesWithReferences === 0) {
    console.log('✅ No active_session references found! Migration complete.\n');
    return;
  }

  console.log('⚠️  Files requiring updates:\n');

  results.references
    .sort((a, b) => b.count - a.count) // Sort by reference count (most first)
    .forEach((fileData, index) => {
      console.log(`${index + 1}. ${fileData.file}`);
      console.log(`   References: ${fileData.count}`);
      
      fileData.references.forEach((ref) => {
        console.log(`   Line ${ref.line}: ${ref.content.substring(0, 80)}${ref.content.length > 80 ? '...' : ''}`);
      });
      
      console.log('');
    });

  console.log('='.repeat(80));
  console.log('\n💡 Next Steps:');
  console.log('   1. Review each file listed above');
  console.log('   2. Replace "active_session" with dynamic session codes');
  console.log('   3. Update imports to use sessionManager.js');
  console.log('   4. Test each updated file');
  console.log('   5. Re-run this script to verify all references removed\n');
  console.log('📖 See documentation/FIREBASE_STRUCTURE_MIGRATION.md for details\n');
}

/**
 * Main execution
 */
function main() {
  console.log('\n🔍 Scanning codebase for active_session references...\n');

  SCAN_DIRS.forEach((dir) => {
    const fullPath = path.join(process.cwd(), dir);
    if (fs.existsSync(fullPath)) {
      console.log(`   Scanning ${dir}...`);
      scanDirectory(fullPath);
    } else {
      console.log(`   ⚠️  Directory not found: ${dir}`);
    }
  });

  generateReport();
}

// Run the script
main();
