---
title: Network Error Handling Fix
createdAt: '2026-02-27T15:26:57.951Z'
updatedAt: '2026-02-27T15:26:59.470Z'
description: Documentation of network error handling improvements
tags:
  - sop
  - bugfix
  - network
  - error-handling
---
# Network Error Handling Fix - Step 2 Question Parsing

**Date:** November 13, 2025  
**Issue:** Parsing failure due to network connectivity issues showing generic error message

## Problem Analysis

### Root Cause
The parsing failure was caused by **network/API connectivity issues**, not a bug in the parser code:

1. **503 Service Unavailable** - Google Gemini API temporarily overloaded
2. **Network DNS Failures** - `ERR_NAME_NOT_RESOLVED` 
3. **Connection Lost** - `ERR_INTERNET_DISCONNECTED`

### Code Issues Found
1. **Generic Error Message**: UI showed "Parsing Failed" without explaining WHY
2. **Error Details Hidden**: Actual error from AI parser wasn't displayed to user
3. **Missing Error Check**: Context didn't check if ALL parsing attempts failed before returning success
4. **No Guidance**: Users had no troubleshooting steps for network issues

## Solutions Implemented

### 1. Enhanced Error Propagation
**File:** `src/context/QuizCreationContext.jsx`

Added comprehensive error checking in `parseQuestionsWithAI()`:
- Check if all parsing attempts failed → return error immediately
- Check if no questions were extracted → return specific error
- Log partial failures for debugging
- Properly propagate first error message to UI

```javascript
// Check if any parsing succeeded
const failedResults = results.filter(r => !r.success);

if (failedResults.length === results.length) {
  // All passages failed to parse
  const firstError = failedResults[0]?.error || 'AI parsing failed for all passages';
  setIsParsing(false);
  setParsingStatus('');
  return { success: false, error: firstError };
}

// Check if we got any questions
if (allQuestions.length === 0) {
  setIsParsing(false);
  setParsingStatus('');
  return { success: false, error: 'No questions were parsed. Check your input format and try again.' };
}
```

### 2. User-Friendly Error Messages
**File:** `src/utils/parsers/aiParser.js`

Enhanced error messages in both `parseWithGemini()` and `parseWithGroq()`:

- **503 Errors**: "Google AI service is temporarily overloaded (503 error). The service is experiencing high demand. Please wait 2-3 minutes and try again."
- **DNS Errors**: "Network error: Cannot reach Google AI servers. Check your internet connection and DNS settings."
- **Connection Errors**: "Network error: No internet connection. Please check your network and try again."
- **Generic Network**: "Network error: Unable to connect to AI service. Check your internet connection."

### 3. Enhanced UI Error Display
**File:** `src/components/quiz-creation/QuestionSection.jsx`

Improved error state card with:
- Display actual error message from parser
- Detect network/API errors automatically
- Show contextual troubleshooting guidance
- Better retry button with icon

```jsx
{/* Error State */}
{!isParsing && parsedQuestions.length === 0 && hasStartedParsing && (
  <Card variant="rose" style={{ marginBottom: '1.5rem' }}>
    <CardBody>
      <Alert icon={<IconAlertCircle size={16} />} title="Parsing Failed" color="red">
        <Text size="sm" mb="md">
          {lastError || 'Failed to parse questions. Please check your input and try again.'}
        </Text>
        
        {/* Network/API Error Guidance */}
        {lastError && (lastError.includes('overloaded') || lastError.includes('503') || ...) && (
          <Alert color="orange" variant="light" mt="sm" mb="sm">
            <Text size="xs" fw={600} mb="xs">💡 Network/API Issue Detected</Text>
            <Text size="xs" component="div">
              <ul style={{ margin: 0, paddingLeft: '1.2rem' }}>
                <li>Check your internet connection</li>
                <li>Google AI service may be temporarily overloaded</li>
                <li>Wait 2-3 minutes and try again</li>
                <li>Try during off-peak hours if issue persists</li>
              </ul>
            </Text>
          </Alert>
        )}
        
        <Button size="sm" variant="light" color="red" onClick={handleStartParsing}>
          <IconRefresh size={16} style={{ marginRight: '0.5rem' }} />
          Retry Parsing
        </Button>
      </Alert>
    </CardBody>
  </Card>
)}
```

## Error Detection Patterns

The UI automatically detects and provides guidance for:
- `overloaded` - API service overload
- `503` - HTTP 503 Service Unavailable
- `network` - Generic network errors
- `NAME_NOT_RESOLVED` - DNS resolution failure
- `INTERNET_DISCONNECTED` - Connection lost

## User Experience Improvements

### Before Fix
```
❌ "Parsing Failed"
❌ "Failed to parse questions. Please check your input and try again."
❌ No indication if it's network vs. input issue
❌ No troubleshooting guidance
```

### After Fix
```
✅ "Google AI service is temporarily overloaded (503 error)..."
✅ Automatic detection of network/API issues
✅ Contextual troubleshooting steps:
   • Check internet connection
   • Wait 2-3 minutes for API recovery
   • Try during off-peak hours
✅ Clear retry button with icon
```

## Testing Instructions

### Test Network Errors
1. Disconnect internet → Try parsing → Should show "Network error: No internet connection"
2. Reconnect and retry → Should work normally

### Test API Overload (503)
1. If Google API returns 503 → Should show overload message
2. Wait 2-3 minutes → Retry → Should work after cooldown

### Test Partial Failures
1. If some passages parse but others fail → Should show warnings in console
2. Successfully parsed questions should still be available
3. Only fails if ALL passages fail

## Files Modified
1. `src/context/QuizCreationContext.jsx` - Error checking logic
2. `src/utils/parsers/aiParser.js` - User-friendly error messages (Gemini + Groq)
3. `src/components/quiz-creation/QuestionSection.jsx` - Enhanced error UI

## Impact
- **Transparency**: Users now see WHY parsing failed
- **Actionable**: Users get specific troubleshooting steps
- **Reduced Frustration**: Clear distinction between network issues vs. input problems
- **Better Support**: Error messages help users self-diagnose common issues

## Notes
- The retry logic (3 attempts with exponential backoff) was already working correctly
- The issue was error propagation and user communication, not the retry mechanism
- Firebase connection errors are unrelated to quiz parsing (separate WebSocket connection)
