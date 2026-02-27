# Technology Stack

## Frontend
- **Framework:** React 19 (Vite-powered)
- **Language:** TypeScript (Strict Mode)
- **UI Library:** Mantine v8 (Primary UI framework)
- **Legacy UI:** Bootstrap 5 / React-Bootstrap (Selected components)
- **Icons:** Tabler Icons

## State Management & Logic
- **Global State:** Zustand (Stores for UI, Quiz, Materials)
- **Context API:** React Context for Auth and Theme management
- **Routing:** React Router DOM v7

## Backend & Infrastructure
- **Platform:** Firebase
- **Database:** Firebase Realtime Database (Live sessions, Tests, Quizzes)
- **Authentication:** Firebase Auth
- **Serverless:** Firebase Cloud Functions (Node.js/TypeScript)
- **Hosting:** Firebase Hosting

## AI & Content Processing
- **Primary AI:** Google Generative AI (Gemini 2.5 Flash)
- **Fallback AI:** Groq SDK (Llama 3.1 70B)
- **Parsing Utilities:** Mammoth (Docx), PDF.js (PDF extraction)

## Storage & Assets
- **Primary Media:** Cloudflare R2 (Audio/Image hosting via worker proxy)
- **Legacy Support:** Google Drive API (OAuth2 integration)

## Styling
- **Methodology:** CSS Modules + Mantine Style System
- **Utilities:** Tailwind CSS (PostCSS integration)
- **Design Pattern:** Glassmorphism

## Analytics & Exports
- **Visualization:** Recharts
- **PDF Generation:** jsPDF + html2canvas
- **Data Export:** CSV Export utilities

## Testing & Quality
- **Unit/Integration:** Vitest + Testing Library
- **End-to-End:** Playwright
- **Linting:** ESLint
