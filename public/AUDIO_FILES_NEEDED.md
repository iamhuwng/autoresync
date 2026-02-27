# Audio Files Required for Production

This application requires the following audio files to be placed in the `/public` directory before production deployment.

## Required Audio Files

### 1. click.wav
- **Purpose:** Button click feedback sound
- **Triggered by:** `SoundButton.jsx` (line 7)
- **Usage:** Plays on every button click throughout the app
- **Recommended specs:**
  - Duration: 50-100ms
  - Format: WAV or MP3
  - Volume: -12dB (normalized)
  - Sample rate: 44.1kHz

### 2. correct.wav
- **Purpose:** Correct answer feedback
- **Triggered by:** `StudentFeedbackPage.jsx` (line 33)
- **Usage:** Plays when student answers correctly
- **Recommended specs:**
  - Duration: 500-1000ms
  - Format: WAV or MP3
  - Volume: -12dB (normalized)
  - Upbeat, celebratory tone

### 3. incorrect.wav
- **Purpose:** Incorrect answer feedback
- **Triggered by:** `StudentFeedbackPage.jsx` (line 33)
- **Usage:** Plays when student answers incorrectly
- **Recommended specs:**
  - Duration: 500-1000ms
  - Format: WAV or MP3
  - Volume: -12dB (normalized)
  - Gentle, non-harsh tone

## Where to Find Free Sound Effects

### Free Sound Libraries
1. **Freesound.org** - https://freesound.org/
   - License: Creative Commons (attribution required)
   - Search terms: "click", "correct", "wrong", "buzzer"

2. **Zapsplat** - https://www.zapsplat.com/
   - Free for commercial use with attribution
   - Large sound effects library

3. **Pixabay Audio** - https://pixabay.com/sound-effects/
   - License: Free for commercial use, no attribution required
   - Search: "button click", "success", "error"

4. **BBC Sound Effects** - https://sound-effects.bbcrewind.co.uk/
   - License: Free for educational/research use
   - Professional quality

### Recommended Search Terms
- **Click:** "button click", "UI click", "interface click", "soft click"
- **Correct:** "success", "correct", "achievement", "ding", "chime", "positive"
- **Incorrect:** "wrong", "error", "buzzer", "negative", "oops"

## Implementation Status

- [ ] click.wav - **MISSING** (high priority)
- [ ] correct.wav - **MISSING** (high priority)
- [ ] incorrect.wav - **MISSING** (high priority)

## Testing Audio Files

After adding audio files, test with:
```bash
npm run dev
```

Then:
1. Click any button to test `click.wav`
2. Start a quiz, answer correctly to test `correct.wav`
3. Answer incorrectly to test `incorrect.wav`

## Fallback Behavior

**Current behavior:** If audio files are missing, the app will log an error to console but will **not crash**. The `SoundService.js` uses native `Audio()` API which fails silently if files are not found.

## Production Checklist

Before deploying to production:
- [ ] All 3 audio files added to `/public` directory
- [ ] Audio files tested in development environment
- [ ] Volume levels normalized
- [ ] File formats compatible with all browsers (WAV recommended)
- [ ] Licenses/attributions documented if required

## Alternative: Disable Sound Temporarily

If you need to launch without sounds, you can temporarily disable audio by modifying `SoundService.js`:

```javascript
const SoundService = {
  play: (sound) => {
    // Temporarily disabled for launch
    // const audio = new Audio(`/${sound}.wav`);
    // audio.play();
    console.log(`Sound would play: ${sound}`);
  },
};
```

**Not recommended for production** - better to add proper audio files.
