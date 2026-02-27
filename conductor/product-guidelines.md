# Product Guidelines

## 1. Visual Aesthetics & UI Design
- **Primary Design System:** **Glassmorphism**. Continue to utilize transparency, background blur (ackdrop-filter: blur()), and subtle borders to maintain the modern, airy feel established in the current interface. Use gradient backgrounds to enhance depth.
- **Assessment Interface:** **High-Fidelity Simulation**. For "Test Mode" (student-facing assessments), prioritize strict visual parity with the official IELTS Computer-Based Test (Inspera) interface. This overrides standard design system rules to ensure authentic exam simulation.
  - *Key Elements:* Split-screen layouts (Reading), single-column layouts (Listening), specific font choices (Arial/Verdana), and official color palettes (IELTS Red/Black/White).
- **Responsive Design:** Mobile-first approach for student views to support "Quiz Mode" engagement on any device. Desktop-optimized views for complex "Test Mode" tasks and Teacher Dashboard management.

## 2. User Experience (UX) Core Principles
- **Teacher Efficiency:** Minimize clicks for content creation. Leverage AI to automate heavy lifting (parsing, question generation) but always provide manual override controls ("Human-in-the-loop").
- **Student Authenticity vs. Engagement:**
  - *Test Mode:* Focus on focus and realism. Remove distractions.
  - *Quiz Mode:* Focus on gamification and speed. Use animations, live scoreboards, and instant feedback.
- **Feedback Loops:** Provide immediate, actionable feedback. For students: instant auto-marking and explanations. For teachers: real-time class progress analytics.

## 3. Tone & Voice
- **Professional & Academic:** The platform is an educational tool. Language should be clear, concise, and encouraging.
- **Instructional Clarity:** Instructions for tests and quizzes must be unambiguous and follow standard examination formatting (e.g., "NO MORE THAN TWO WORDS").
- **System Feedback:** Error messages should be helpful and non-technical. Success messages should be affirmative.

## 4. Operational Standards
- **Data Integrity:** "Test Results" are permanent records. Ensure robust error handling during submission to prevent data loss. Use "Session Storage" for transient states but always sync critical progress to persistent databases.
- **Performance:** Optimize for low-latency updates, especially in "Live Quiz" scenarios where timing is critical. Use efficient state management to handle real-time student data streams.
