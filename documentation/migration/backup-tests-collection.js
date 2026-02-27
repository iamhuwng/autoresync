/**
 * Firebase Tests Collection Backup Script
 * 
 * This script creates a full backup of the tests collection for PRD-0020 migration.
 * 
 * Usage:
 * 1. Open the app in browser and log in
 * 2. Open browser DevTools (F12) → Console
 * 3. Paste this script and press Enter
 * 4. Click "Download Backup" button that appears
 * 
 * Restore:
 * - Use the restore script in restore-test-backup.js
 */

const backupScript = `
// PRD-0020: Firebase Tests Backup Script
// Run this in browser console when logged into the app

async function backupTestsCollection() {
  console.log('🔄 Starting backup...');
  console.log('');
  
  // Import Firebase functions
  const { ref, get } = await import('https://www.gstatic.com/firebasejs/9.0.0/firebase-database.js');
  
  // Get database reference from app
  const { database } = await import('/src/services/firebase.js');
  
  try {
    // Get ALL data from tests collection
    const testsRef = ref(database, 'tests');
    const snapshot = await get(testsRef);
    
    if (!snapshot.exists()) {
      console.log('⚠️ No tests found in database');
      return null;
    }
    
    const testsData = snapshot.val();
    const testIds = Object.keys(testsData);
    
    console.log('📊 Found', testIds.length, 'tests to backup');
    
    // Create backup object with metadata
    const backup = {
      metadata: {
        backupDate: new Date().toISOString(),
        backupVersion: '1.0',
        projectVersion: 'PRD-0020-pre-migration',
        totalTests: testIds.length,
        totalQuestions: Object.values(testsData).reduce(
          (sum, test) => sum + (test.questionCount || test.questions?.length || 0), 
          0
        ),
        bySkill: {
          Reading: Object.values(testsData).filter(t => t.skill === 'Reading').length,
          Listening: Object.values(testsData).filter(t => t.skill === 'Listening').length,
          Writing: Object.values(testsData).filter(t => t.skill === 'Writing').length,
          Speaking: Object.values(testsData).filter(t => t.skill === 'Speaking').length,
          Mixed: Object.values(testsData).filter(t => t.skill === 'Mixed').length,
        },
        note: 'This backup contains FULL test data including questions, passages, and answers.',
      },
      tests: testsData,
    };
    
    // Create downloadable file
    const jsonString = JSON.stringify(backup, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    // Create download link
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const filename = \`tests-backup-\${timestamp}.json\`;
    
    const downloadLink = document.createElement('a');
    downloadLink.href = url;
    downloadLink.download = filename;
    downloadLink.textContent = '📥 Download Backup: ' + filename;
    downloadLink.style.cssText = \`
      display: block;
      position: fixed;
      top: 20px;
      right: 20px;
      z-index: 99999;
      background: #4CAF50;
      color: white;
      padding: 15px 25px;
      border-radius: 8px;
      font-size: 16px;
      font-weight: bold;
      text-decoration: none;
      box-shadow: 0 4px 12px rgba(0,0,0,0.3);
      cursor: pointer;
    \`;
    
    // Add click handler to remove link after download
    downloadLink.onclick = () => {
      setTimeout(() => {
        downloadLink.remove();
        URL.revokeObjectURL(url);
      }, 1000);
    };
    
    document.body.appendChild(downloadLink);
    
    // Log summary
    console.log('');
    console.log('✅ BACKUP READY');
    console.log('================');
    console.log('Total tests:', backup.metadata.totalTests);
    console.log('Total questions:', backup.metadata.totalQuestions);
    console.log('');
    console.log('By Skill:');
    Object.entries(backup.metadata.bySkill).forEach(([skill, count]) => {
      console.log(\`  \${skill}: \${count}\`);
    });
    console.log('');
    console.log('📥 Click the green button in the top-right corner to download');
    console.log('');
    console.log('File:', filename);
    console.log('Size:', (jsonString.length / 1024).toFixed(2), 'KB');
    
    return backup;
    
  } catch (error) {
    console.error('❌ Backup failed:', error);
    return null;
  }
}

// Run backup
backupTestsCollection();
`;

console.log("=".repeat(60));
console.log("PRD-0020 FIREBASE TESTS BACKUP SCRIPT");
console.log("=".repeat(60));
console.log("");
console.log("INSTRUCTIONS:");
console.log("1. Open the app in your browser");
console.log("2. Log in as a teacher/admin");
console.log("3. Open browser DevTools (F12)");
console.log("4. Go to Console tab");
console.log("5. Paste the script below and press Enter");
console.log("6. Click the green 'Download Backup' button");
console.log("7. Save the JSON file in a safe location");
console.log("");
console.log("=".repeat(60));
console.log("SCRIPT TO RUN IN BROWSER CONSOLE:");
console.log("=".repeat(60));
console.log(backupScript);
