# Initial Concept
A Kahoot-style real-time quiz platform specifically designed for IELTS preparation, built using React, Firebase, and Mantine UI, and featuring AI-powered quiz generation.
# Product Definition

## Vision
To build the definitive "Operating System" for IELTS educationa unified platform that seamlessly blends high-fidelity assessment tools (Test Mode) with gamified engagement (Quiz Mode). It empowers teachers with AI-driven content creation and workload automation while providing students with an authentic, Inspera-style testing environment that mirrors the real IELTS Computer-Based Test.

## Target Audience
- **IELTS Education Centers:** Institutions needing to manage classes, assign teachers, and track student progress at scale.
- **IELTS Teachers:** Instructors requiring efficient tools to create materials, host live sessions, and analyze performance without manual grading.
- **IELTS Students:** Learners practicing for high-stakes exams who need realistic simulation (Reading/Listening) and instant feedback.

## Core Value Proposition
- **High-Fidelity Simulation:** "Test Mode" replicates the actual IELTS Computer-Based Test (Inspera) UI for Reading and Listening, ensuring students practice in a realistic environment.
- **AI-Powered Content Engine:** Reduces content creation time by 90% using Gemini-powered parsing to convert raw text/documents into interactive quizzes and structured tests.
- **Hybrid Learning Model:** Supports both synchronous "Live Quizzes" (Kahoot-style for engagement) and asynchronous "Standard Tests" (for assessment) in a single platform.
- **Reusable Material Ecosystem:** A centralized "Material Library" allows content to be parsed once, stored, and reused across multiple quizzes, tests, and courses without duplication.

## Key Features

### 1. Dual-Mode Assessment Engine
- **Live Quiz Mode:** Gamified, teacher-paced sessions with leaderboards and instant feedback (Kahoot-style).
- **Standard Test Mode:** Student-paced, high-fidelity assessments with strict timing, compliant with IELTS standards (Single-column Listening, Split-screen Reading).

### 2. AI-Driven Content Creation
- **Intelligent Parser:** Extracts questions, passages, and answer keys from raw text using Google Gemini.
- **Hybrid Parsing:** Combines AI extraction with rule-based detection for 100% accuracy on standard IELTS question types (T/F/NG, Matching, Completion).
- **Multi-Draft Editor:** Robust editor with auto-save, versioning, and "Context & Resources" management for complex assets.

### 3. Material Library & Resource Management
- **Central Repository:** Stores parsed content (Passages, Questions) independently from tests.
- **Smart Linking:** Quizzes/Tests link to materials rather than duplicating them; updates to materials can propagate to linked assessments.
- **Cloud Asset Storage:** Integrated Cloudflare R2 storage for high-performance audio and image delivery.

### 4. Advanced Student & Course Management (In Progress)
- **Class/Session Architecture:** Persistent classes with student rostering and multi-session management.
- **Course System:** Structured courses with modules, time-bound access, and public/private visibility settings.
- **Teacher-Student Assignment:** Strict data isolation where teachers manage only their assigned students.

### 5. Analytics & Results
- **Permanent History:** Comprehensive result tracking stored permanently (firebase 	est_results/).
- **Performance Insights:** Band score calculation, skill breakdown (Reading/Listening), and progress tracking over time.
- **Feedback Loop:** Detailed question-level analytics for teachers to identify common pitfalls.
