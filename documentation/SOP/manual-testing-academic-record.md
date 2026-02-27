# Manual Testing Checklist: Academic Record Page

**Date Created**: 2026-01-31  
**Purpose**: Verify Academic Record UI implementation before E2E testing

---

## Prerequisites

- [ ] Development server is running (`npm run dev`)
- [ ] Firebase emulator is running (if testing locally)
- [ ] Logged in as a student account with test results

---

## Test Scenarios

### 1. Navigation & Access

- [ ] **Navigate from Student Dashboard**
  - Go to Student Dashboard
  - Click "📈 Academic Record" button
  - Verify page loads at `/student/academic-record`
  - Verify URL is correct

- [ ] **Direct URL Access**
  - Navigate directly to `/student/academic-record`
  - Verify page loads correctly
  - Verify authentication is required (redirect if not logged in)

### 2. Page Loading States

- [ ] **Initial Load**
  - Verify loading spinner appears
  - Verify "Loading your academic records..." message shows
  - Verify page loads without errors

- [ ] **Empty State** (if no results)
  - Verify appropriate empty message appears
  - Verify no errors in console

- [ ] **Error State** (simulate by breaking service)
  - Verify error alert appears
  - Verify error message is user-friendly

### 3. Date Range Filtering

- [ ] **Filter Options**
  - Verify dropdown shows: All Time, Last 7 Days, Last 30 Days, Last 3 Months, Last Year
  - Select each option and verify results update
  - Verify result count updates correctly

- [ ] **Filter Persistence**
  - Select a filter
  - Switch tabs
  - Verify filter selection persists

### 4. Tab Navigation

#### Timeline Tab
- [ ] Results display in chronological order (newest first)
- [ ] ResultCard shows: title, score %, date, course, skill badges
- [ ] Score color-coding works (green >80%, yellow 60-80%, red <60%)
- [ ] "Load More" button appears if >10 results
- [ ] Clicking a result card navigates to detail page
- [ ] Empty state shows if no results

#### By Course Tab
- [ ] Results grouped by course
- [ ] Course headers show: name, average score, test count
- [ ] Sections are collapsible
- [ ] Progress bars display correctly (if applicable)
- [ ] Uncategorized results section appears if needed
- [ ] Clicking a result navigates to detail page

#### By Skill Tab
- [ ] Results grouped by: Reading, Listening, Writing, Speaking
- [ ] Each skill shows: icon, average score, best/worst scores
- [ ] Ring progress indicators display correctly
- [ ] Color-coding matches skill type
- [ ] Statistics calculate correctly
- [ ] Clicking a result navigates to detail page

#### By Type Tab
- [ ] Results grouped by: Quiz, Test
- [ ] Each type shows: icon, average score, best score, pass rate
- [ ] Pass rate calculates correctly (>60% = pass)
- [ ] Pass rate color-coding works
- [ ] Clicking a result navigates to detail page

#### Statistics Tab
- [ ] **Overview Cards Display**:
  - Total Tests count is correct
  - Average Score calculates correctly
  - Best Score shows highest percentage
  - Study Streak calculates consecutive days

- [ ] **Score Progression Chart**:
  - Line chart renders
  - X-axis shows dates
  - Y-axis shows scores (0-100)
  - Data points are visible
  - Tooltip shows on hover

- [ ] **Skill Breakdown Radar Chart**:
  - Radar chart renders
  - All 4 skills visible
  - Scores display correctly
  - Chart is interactive

- [ ] **Score Distribution Chart**:
  - Bar chart renders
  - 5 ranges visible (0-20%, 21-40%, etc.)
  - Counts are correct
  - Bars are color-coded

- [ ] **Test Frequency Chart**:
  - Bar chart renders
  - Months display on X-axis
  - Test counts are correct
  - Data sorted chronologically

- [ ] **Export Buttons**:
  - PDF button is visible
  - CSV button is visible
  - Clicking logs to console (placeholder)

### 5. Responsive Design

- [ ] **Desktop (>1200px)**
  - All components display correctly
  - Charts are readable
  - No horizontal scroll

- [ ] **Tablet (768px-1200px)**
  - Layout adjusts appropriately
  - Tabs remain usable
  - Charts resize correctly

- [ ] **Mobile (<768px)**
  - Navigation tabs scroll/wrap
  - Cards stack vertically
  - Charts remain readable

### 6. Performance

- [ ] **Large Dataset** (if available)
  - Page loads in <3 seconds
  - Filtering is responsive
  - Tab switching is smooth
  - No lag when scrolling

- [ ] **Console Errors**
  - No errors in browser console
  - No warnings (except known AuthContext issue)
  - No network errors

### 7. Data Accuracy

- [ ] **Score Calculations**
  - Average scores match manual calculation
  - Best scores are correct
  - Pass rates calculate correctly
  - Study streak logic is accurate

- [ ] **Date Formatting**
  - Dates display in readable format
  - Relative dates work ("2 days ago")
  - Date ranges filter correctly

### 8. Edge Cases

- [ ] **No Results in Filter**
  - Select date range with no results
  - Verify appropriate message shows

- [ ] **Single Result**
  - Verify singular text ("1 result" not "1 results")
  - Verify components handle single item

- [ ] **All Same Score**
  - Verify charts handle uniform data
  - Verify statistics calculate correctly

---

## Known Issues to Ignore

- `@/contexts/AuthContext` TypeScript warning (pre-existing)
- Any other pre-existing lint warnings not related to Academic Record

---

## Post-Testing Actions

After completing manual testing:

1. **Document Issues**: Create GitHub issues or task list items for any bugs found
2. **Fix Critical Bugs**: Address any blocking issues before E2E tests
3. **Update Task List**: Mark manual testing complete
4. **Proceed to E2E**: Begin writing Playwright tests (Tasks 4.21-4.27)

---

## Testing Notes

**Tester**: _________________  
**Date**: _________________  
**Environment**: [ ] Local [ ] Staging [ ] Production  
**Browser**: _________________  
**Issues Found**: _________________

---

*Generated as part of PRD-0015: Academic Record & Enhanced Profile System - Phase 4*
