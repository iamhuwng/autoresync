/**
 * Test Data Export Utility
 * 
 * This script exports test count and metadata from Firebase for PRD-0020 migration.
 * 
 * Usage:
 * 1. Run the app in browser
 * 2. Open browser console (F12)
 * 3. Copy-paste this entire script into the console
 * 4. Results will be logged and can be copied
 * 
 * This is a documentation/reference script, not meant to be imported.
 */

// Export script to run in browser console
const exportTestsScript = `
// PRD-0020: Test Export Script
// Run this in browser console when logged into the app

async function exportTestMetadata() {
  console.log('📊 Starting test export...');
  
  // Import from existing service
  const { getAllTestsFromFirebase } = await import('/src/services/testStorage.ts');
  
  const result = await getAllTestsFromFirebase();
  
  if (!result.success) {
    console.error('❌ Failed to fetch tests:', result.error);
    return null;
  }
  
  const tests = result.data || [];
  console.log('📋 Total tests found:', tests.length);
  
  // Group by skill type
  const bySkill = {
    Reading: tests.filter(t => t.skill === 'Reading'),
    Listening: tests.filter(t => t.skill === 'Listening'),
    Writing: tests.filter(t => t.skill === 'Writing'),
    Speaking: tests.filter(t => t.skill === 'Speaking'),
    Mixed: tests.filter(t => t.skill === 'Mixed'),
  };
  
  // Group by test type
  const byType = {
    IELTS: tests.filter(t => t.type === 'IELTS'),
    TOEFL: tests.filter(t => t.type === 'TOEFL'),
    Custom: tests.filter(t => t.type === 'Custom'),
    'College Entrance': tests.filter(t => t.type === 'College Entrance'),
  };
  
  // Completion status
  const complete = tests.filter(t => t.isComplete !== false);
  const incomplete = tests.filter(t => t.isComplete === false);
  
  // Extract metadata only (no questions/passages for smaller output)
  const metadata = tests.map(t => ({
    id: t.id,
    title: t.title,
    type: t.type,
    skill: t.skill,
    questionCount: t.questionCount,
    isComplete: t.isComplete,
    isPublished: t.isPublished,
    createdAt: new Date(t.createdAt).toISOString(),
    createdBy: t.createdBy,
  }));
  
  // Summary report
  const report = {
    exportDate: new Date().toISOString(),
    summary: {
      totalTests: tests.length,
      bySkill: {
        Reading: bySkill.Reading.length,
        Listening: bySkill.Listening.length,
        Writing: bySkill.Writing.length,
        Speaking: bySkill.Speaking.length,
        Mixed: bySkill.Mixed.length,
      },
      byType: {
        IELTS: byType.IELTS.length,
        TOEFL: byType.TOEFL.length,
        Custom: byType.Custom.length,
        'College Entrance': byType['College Entrance'].length,
      },
      completionStatus: {
        complete: complete.length,
        incomplete: incomplete.length,
      },
      totalQuestions: tests.reduce((sum, t) => sum + (t.questionCount || 0), 0),
    },
    readingTestsToDelete: bySkill.Reading.map(t => ({
      id: t.id,
      title: t.title,
      questionCount: t.questionCount,
      createdAt: new Date(t.createdAt).toISOString(),
    })),
    allTestsMetadata: metadata,
  };
  
  // Log summary
  console.log('\\n📊 EXPORT SUMMARY');
  console.log('================');
  console.log('Total tests:', report.summary.totalTests);
  console.log('');
  console.log('By Skill:');
  Object.entries(report.summary.bySkill).forEach(([skill, count]) => {
    console.log(\`  \${skill}: \${count}\`);
  });
  console.log('');
  console.log('By Type:');
  Object.entries(report.summary.byType).forEach(([type, count]) => {
    console.log(\`  \${type}: \${count}\`);
  });
  console.log('');
  console.log('Completion Status:');
  console.log(\`  Complete: \${report.summary.completionStatus.complete}\`);
  console.log(\`  Incomplete: \${report.summary.completionStatus.incomplete}\`);
  console.log('');
  console.log('Total Questions:', report.summary.totalQuestions);
  console.log('');
  console.log('🔴 READING TESTS TO DELETE:', bySkill.Reading.length);
  bySkill.Reading.forEach(t => {
    console.log(\`  - \${t.id}: "\${t.title}" (\${t.questionCount} questions)\`);
  });
  
  // Copy to clipboard
  const jsonOutput = JSON.stringify(report, null, 2);
  
  // Try to copy to clipboard
  try {
    await navigator.clipboard.writeText(jsonOutput);
    console.log('\\n✅ Full report copied to clipboard!');
  } catch (e) {
    console.log('\\n⚠️ Could not copy to clipboard. Report logged below:');
  }
  
  // Log full report for manual copy
  console.log('\\n📄 FULL REPORT (JSON):');
  console.log(jsonOutput);
  
  return report;
}

// Run the export
exportTestMetadata();
`;

console.log("=".repeat(60));
console.log("PRD-0020 TEST EXPORT SCRIPT");
console.log("=".repeat(60));
console.log("");
console.log("INSTRUCTIONS:");
console.log("1. Open the app in your browser");
console.log("2. Log in as a teacher/admin");
console.log("3. Open browser DevTools (F12)");
console.log("4. Go to Console tab");
console.log("5. Paste the script below and press Enter");
console.log("");
console.log("=".repeat(60));
console.log("SCRIPT TO RUN IN BROWSER CONSOLE:");
console.log("=".repeat(60));
console.log(exportTestsScript);
