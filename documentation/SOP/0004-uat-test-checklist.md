# User Acceptance Testing (UAT) Checklist

**Project:** Interactive Learning Environment (Kahoot-Style)
**Date:** _____________
**Tester Name:** _____________
**Environment:** Production / Staging / Development (circle one)
**Device:** Desktop / Tablet / Mobile (circle one)
**Browser:** Chrome / Firefox / Safari / Edge (circle one)

---

## Pre-Test Setup

### Prerequisites
- [ ] Development server running (`npm run dev`)
- [ ] Firebase database is accessible
- [ ] Admin credentials available from `.env` file
- [ ] At least 5 test users ready to participate (can use multiple devices/browsers)
- [ ] Audio files present in `/public` directory

### Test Quiz JSON
Create a simple test quiz with 3-5 questions. Save as `test-quiz.json`:

```json
{
  "title": "UAT Test Quiz",
  "questions": [
    {
      "question": "What is 2 + 2?",
      "options": ["3", "4", "5", "6"],
      "answer": "4",
      "type": "multiple-choice",
      "timer": 10
    },
    {
      "question": "What is the capital of France?",
      "options": ["London", "Berlin", "Paris", "Madrid"],
      "answer": "Paris",
      "type": "multiple-choice",
      "timer": 15
    },
    {
      "question": "What color is the sky?",
      "options": ["Red", "Blue", "Green", "Yellow"],
      "answer": "Blue",
      "type": "multiple-choice",
      "timer": 10
    }
  ]
}
```

---

## Test Scenario 1: Teacher Setup Flow

**Objective:** Verify teacher can log in and set up a quiz

### Steps
1. [ ] Navigate to application URL (e.g., `http://localhost:5175`)
2. [ ] Click "Admin Login" button
3. [ ] Enter admin username from `.env`
4. [ ] Enter admin password from `.env`
5. [ ] Click "Login"

**Expected Result:** Redirected to Teacher Lobby page

6. [ ] Verify search box is visible
7. [ ] Click "Upload Quiz" button
8. [ ] Select `test-quiz.json` file
9. [ ] Click "Upload"

**Expected Result:** Quiz appears in lobby list

10. [ ] Find uploaded quiz in list
11. [ ] Click "Edit Timers" button
12. [ ] Change timer for question 1 to 20 seconds
13. [ ] Change "Apply to all" field to 15
14. [ ] Click "Apply" button
15. [ ] Verify all timers changed to 15
16. [ ] Click "Save"

**Expected Result:** Timer changes saved successfully

17. [ ] Click "Start" button on test quiz

**Expected Result:** Redirected to Teacher Waiting Room

---

## Test Scenario 2: Student Join Flow (Repeat for 5+ Students)

**Objective:** Verify multiple students can join the waiting room

### Student 1
**Device/Browser:** _____________

1. [ ] Navigate to application URL
2. [ ] Enter name: "Test Student 1"
3. [ ] Click "Join"

**Expected Result:**
- Redirected to Student Waiting Room
- Quiz title visible
- Student sees their name in player list

### Student 2
**Device/Browser:** _____________

1. [ ] Navigate to application URL
2. [ ] Enter name: "Test Student 2"
3. [ ] Click "Join"

**Expected Result:**
- Both students visible in waiting room
- Teacher sees both students

### Students 3-5
Repeat above steps with names:
- [ ] Test Student 3
- [ ] Test Student 4
- [ ] Test Student 5

**Verify on Teacher Screen:**
- [ ] All 5 students visible in Teacher Waiting Room
- [ ] Each student has unique avatar
- [ ] Player count shows "5 Players Joined"

---

## Test Scenario 3: Quiz Gameplay Flow

**Objective:** Complete a full quiz with all students

### Teacher Actions

1. [ ] Click "Start Quiz" button in waiting room

**Expected Result:**
- Teacher redirected to Teacher Quiz Page
- All students redirected to Student Quiz Page

2. [ ] Verify teacher sees:
   - [ ] Question text
   - [ ] Answer options
   - [ ] Rocket Race chart
   - [ ] Teacher control panel (Pause, Next Question buttons)
   - [ ] List of players

### Student Actions - Question 1

**Each student should:**
1. [ ] See answer buttons (A, B, C, D format)
2. [ ] Click an answer button
3. [ ] See feedback screen (Correct/Incorrect)
4. [ ] See correct answer displayed
5. [ ] See updated score

**Have at least 2 students answer correctly and 2 incorrectly**

### Teacher Monitors - Question 1

1. [ ] Verify Rocket Race chart updates as students answer
2. [ ] Click "Next Question" button

**Expected Result:** All students see Question 2

### Complete Remaining Questions

1. [ ] Repeat for Question 2
2. [ ] Repeat for Question 3
3. [ ] After last question, click "Next Question"

**Expected Result:**
- Teacher redirected to Teacher Results Page
- Students redirected to Student Results Page

---

## Test Scenario 4: Results Display

**Objective:** Verify results are accurate and well-presented

### Teacher Results Page

1. [ ] Verify confetti animation plays
2. [ ] Verify table shows:
   - [ ] Rank column
   - [ ] Student names
   - [ ] Final scores
3. [ ] Verify students are sorted by score (highest to lowest)
4. [ ] Click "Return to Waiting Room"

**Expected Result:** Redirected to Teacher Waiting Room (players should still be there)

5. [ ] Click "Return to Lobby"

**Expected Result:** Redirected to Teacher Lobby

### Student Results Page (Check on at least 2 student devices)

**Student with highest score:**
1. [ ] Verify shows "You finished 1st out of 5!"
2. [ ] Verify final score is correct
3. [ ] Verify top 5 ladder shows all students
4. [ ] Verify their name is in the list

**Student with middle/lower score:**
1. [ ] Verify shows correct rank (e.g., "3rd out of 5")
2. [ ] Verify final score is correct
3. [ ] Verify top 5 ladder displays

---

## Test Scenario 5: Kick/Ban Functionality

**Objective:** Verify teacher can remove disruptive players

### Setup
1. [ ] Start new quiz session from Teacher Lobby
2. [ ] Have 2 students join (e.g., "Good Student" and "Bad Student")
3. [ ] Teacher starts quiz

### Test Kick Feature

1. [ ] On Teacher Quiz Page, locate "Bad Student" in player list
2. [ ] Click "Kick" button next to their name
3. [ ] Verify confirmation dialog appears
4. [ ] Click "Confirm"

**Expected Result:**
- "Bad Student" removed from player list
- Their Rocket Race bar disappears

### Test Ban Feature

1. [ ] Have "Bad Student" try to rejoin (same browser/IP)
2. [ ] Enter name and click "Join"

**Expected Result:** Alert message: "You have been banned from this game session"

---

## Test Scenario 6: Responsive Design

**Objective:** Verify application works on different screen sizes

### Desktop (1920x1080)
- [ ] Teacher quiz page: Verify two-column layout is visible
- [ ] Teacher quiz page: Verify resize handle works
- [ ] All pages render correctly
- [ ] No horizontal scrolling

### Tablet (iPad - 768x1024)
- [ ] Student quiz page: Large buttons visible
- [ ] Waiting room: Avatars display in grid
- [ ] All text is readable
- [ ] No layout breaking

### Mobile (375x667)
- [ ] Login page: Form fits on screen
- [ ] Student quiz page: Buttons are large and touch-friendly
- [ ] Results page: Ladder displays correctly
- [ ] No horizontal scrolling

---

## Test Scenario 7: Sound Effects

**Objective:** Verify audio plays correctly

**Note:** Requires audio files in `/public` directory

1. [ ] Click any button
   - **Expected:** Hear click sound

2. [ ] Answer a question correctly
   - **Expected:** Hear success/correct sound on feedback page

3. [ ] Answer a question incorrectly
   - **Expected:** Hear error/incorrect sound on feedback page

4. [ ] Verify sounds are at appropriate volume (not too loud)

---

## Test Scenario 8: Edge Cases & Error Handling

**Objective:** Test error conditions and edge cases

### Empty Name
1. [ ] Try to join with empty name field
   - **Expected:** Validation error, cannot proceed

### Invalid Quiz Upload
1. [ ] Login as teacher
2. [ ] Try to upload a `.txt` file instead of `.json`
   - **Expected:** File type validation or error message

3. [ ] Try to upload invalid JSON (missing required fields)
   - **Expected:** Clear error message explaining what's wrong

### Network Disconnection (if possible)
1. [ ] Start a quiz with a student
2. [ ] Disable student's internet connection for 5 seconds
3. [ ] Re-enable connection
   - **Expected:** Student reconnects and can continue (Firebase handles this)

### Delete Quiz
1. [ ] In Teacher Lobby, click "Delete" on a quiz
2. [ ] Verify confirmation dialog
3. [ ] Confirm deletion
   - **Expected:** Quiz removed from list

---

## Performance Checklist

- [ ] Page load time < 3 seconds on first load
- [ ] No visible lag when students join waiting room
- [ ] Quiz transitions are smooth (< 1 second)
- [ ] Rocket Race chart updates in real-time (< 2 second delay)
- [ ] No console errors in browser developer tools
- [ ] No memory leaks (check after 10+ minutes of use)

---

## Accessibility Checklist (Optional but Recommended)

- [ ] Can navigate login page with keyboard only
- [ ] All buttons have clear focus indicators
- [ ] Text has sufficient contrast ratio
- [ ] Works with screen reader (test with at least one page)

---

## Browser Compatibility Matrix

Test on at least 3 different browsers:

| Browser | Version | Login | Join Quiz | Complete Quiz | Results | Status |
|---------|---------|-------|-----------|---------------|---------|--------|
| Chrome  | _____   | [ ]   | [ ]       | [ ]           | [ ]     | Pass/Fail |
| Firefox | _____   | [ ]   | [ ]       | [ ]           | [ ]     | Pass/Fail |
| Safari  | _____   | [ ]   | [ ]       | [ ]           | [ ]     | Pass/Fail |
| Edge    | _____   | [ ]   | [ ]       | [ ]           | [ ]     | Pass/Fail |

---

## Known Limitations (Document During Testing)

**These are expected based on current MVP scope:**

1. Only multiple-choice questions supported
2. Timer countdown not visible to students
3. No prevention of duplicate student names
4. Case-sensitive answer matching
5. Feedback screen doesn't auto-advance after 5 seconds

---

## Bug Report Template

If you encounter issues, document them here:

### Bug #1
- **Severity:** Critical / High / Medium / Low
- **Page/Component:** _____________
- **Steps to Reproduce:**
  1.
  2.
  3.
- **Expected Behavior:** _____________
- **Actual Behavior:** _____________
- **Screenshot/Error Message:** _____________

### Bug #2
(Repeat as needed)

---

## UAT Sign-Off

### Test Summary

**Total Test Scenarios:** 8
**Scenarios Passed:** ___ / 8
**Scenarios Failed:** ___ / 8
**Critical Bugs Found:** ___
**Medium/Low Bugs Found:** ___

### Recommendation

- [ ] **APPROVE** - Ready for production deployment
- [ ] **APPROVE WITH CONDITIONS** - Can deploy with documented limitations
- [ ] **REJECT** - Critical issues must be fixed before deployment

**Conditions (if any):**
_____________________________________________
_____________________________________________

### Tester Sign-Off

**Name:** _____________
**Date:** _____________
**Signature:** _____________

---

## Post-UAT Actions

After successful UAT:
- [ ] Document all findings in bug tracking system
- [ ] Update production environment variables
- [ ] Prepare production Firebase database
- [ ] Create user documentation/guide
- [ ] Schedule production deployment
- [ ] Plan Phase 2 enhancements

---

**End of UAT Checklist**
