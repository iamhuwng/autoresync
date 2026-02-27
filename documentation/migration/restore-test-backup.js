/**
 * Firebase Tests Collection Restore Script
 * 
 * This script restores tests from a backup file created by backup-tests-collection.js
 * 
 * ⚠️ WARNING: This will OVERWRITE existing tests with the same IDs!
 * 
 * Usage:
 * 1. Open the app in browser and log in as admin
 * 2. Open browser DevTools (F12) → Console
 * 3. Load the backup file first (instructions below)
 * 4. Run the restore command
 */

const restoreScript = `
// PRD-0020: Firebase Tests Restore Script
// Run this in browser console when logged into the app

// Step 1: Load the backup file
// Replace the backupData variable with your backup JSON content
let backupData = null;

// Function to load backup from file input
async function loadBackupFromFile() {
  return new Promise((resolve) => {
    // Create file input
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.style.display = 'none';
    
    input.onchange = async (e) => {
      const file = e.target.files[0];
      if (!file) {
        console.log('❌ No file selected');
        resolve(null);
        return;
      }
      
      try {
        const text = await file.text();
        const data = JSON.parse(text);
        
        console.log('📂 Loaded backup file:', file.name);
        console.log('📊 Backup metadata:', data.metadata);
        console.log('');
        
        input.remove();
        resolve(data);
      } catch (error) {
        console.error('❌ Failed to parse backup file:', error);
        input.remove();
        resolve(null);
      }
    };
    
    document.body.appendChild(input);
    input.click();
  });
}

// Function to restore tests
async function restoreTestsCollection(backup) {
  if (!backup || !backup.tests) {
    console.error('❌ Invalid backup data. Run loadBackupFromFile() first.');
    return false;
  }
  
  console.log('⚠️ WARNING: This will restore', Object.keys(backup.tests).length, 'tests');
  console.log('⚠️ Existing tests with same IDs will be OVERWRITTEN');
  console.log('');
  console.log('To proceed, run: confirmRestore()');
  
  // Store backup in window for confirmation
  window._pendingRestore = backup;
  return true;
}

// Confirmation function
async function confirmRestore() {
  const backup = window._pendingRestore;
  if (!backup) {
    console.error('❌ No pending restore. Run restoreTestsCollection(backupData) first.');
    return;
  }
  
  console.log('🔄 Starting restore...');
  
  // Import Firebase functions
  const { ref, set } = await import('https://www.gstatic.com/firebasejs/9.0.0/firebase-database.js');
  const { database } = await import('/src/services/firebase.js');
  
  try {
    const testIds = Object.keys(backup.tests);
    let restored = 0;
    let failed = 0;
    
    for (const testId of testIds) {
      try {
        const testRef = ref(database, \`tests/\${testId}\`);
        await set(testRef, backup.tests[testId]);
        restored++;
        console.log(\`✅ [\${restored}/\${testIds.length}] Restored: \${testId}\`);
      } catch (error) {
        failed++;
        console.error(\`❌ Failed to restore \${testId}:\`, error.message);
      }
    }
    
    console.log('');
    console.log('📊 RESTORE COMPLETE');
    console.log('==================');
    console.log('Restored:', restored);
    console.log('Failed:', failed);
    console.log('');
    
    // Clear pending restore
    window._pendingRestore = null;
    
    return { restored, failed };
    
  } catch (error) {
    console.error('❌ Restore failed:', error);
    return null;
  }
}

// Function to restore only reading tests (for selective restore)
async function restoreReadingTestsOnly(backup) {
  if (!backup || !backup.tests) {
    console.error('❌ Invalid backup data');
    return false;
  }
  
  const readingTests = Object.entries(backup.tests)
    .filter(([_, test]) => test.skill === 'Reading')
    .reduce((acc, [id, test]) => ({ ...acc, [id]: test }), {});
  
  const count = Object.keys(readingTests).length;
  console.log('📚 Found', count, 'reading tests in backup');
  
  if (count === 0) {
    console.log('⚠️ No reading tests to restore');
    return false;
  }
  
  // Create filtered backup
  window._pendingRestore = {
    metadata: { ...backup.metadata, restoringReadingOnly: true },
    tests: readingTests,
  };
  
  console.log('');
  console.log('To proceed, run: confirmRestore()');
  return true;
}

// Instructions
console.log('');
console.log('📦 RESTORE SCRIPT LOADED');
console.log('========================');
console.log('');
console.log('STEP 1: Load backup file');
console.log('  > const backup = await loadBackupFromFile()');
console.log('');
console.log('STEP 2: Start restore');
console.log('  > await restoreTestsCollection(backup)');
console.log('');
console.log('STEP 3: Confirm restore');
console.log('  > await confirmRestore()');
console.log('');
console.log('OR: Restore only reading tests');
console.log('  > await restoreReadingTestsOnly(backup)');
console.log('  > await confirmRestore()');
console.log('');
`;

console.log("=".repeat(60));
console.log("PRD-0020 FIREBASE TESTS RESTORE SCRIPT");
console.log("=".repeat(60));
console.log("");
console.log("⚠️ WARNING: Use this only if you need to rollback after migration!");
console.log("");
console.log("INSTRUCTIONS:");
console.log("1. Open the app in your browser");
console.log("2. Log in as admin");
console.log("3. Open browser DevTools (F12)");
console.log("4. Go to Console tab");
console.log("5. Paste the script below and press Enter");
console.log("6. Follow the on-screen instructions");
console.log("");
console.log("=".repeat(60));
console.log("SCRIPT TO RUN IN BROWSER CONSOLE:");
console.log("=".repeat(60));
console.log(restoreScript);
