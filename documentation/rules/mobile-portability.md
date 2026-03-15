# Mobile Portability Rules

> Rules to keep the codebase portable across web, Android (Capacitor), and React Native.
> **Load this file when:** writing `localStorage`, `sessionStorage`, `window.*`, `document.*`, `dangerouslySetInnerHTML`, `useNavigate`, or `window.innerWidth`.

---

## Rule 18 — Storage Abstraction Layer

**Trigger:** Writing any `localStorage.*`, `sessionStorage.*`, or `IndexedDB` call in new code.

**Why it exists:**
The codebase has 75+ files with direct `localStorage`/`sessionStorage` calls. React Native has no `localStorage` (uses `AsyncStorage`). Capacitor uses `@capacitor/preferences`. Every direct usage needs manual replacement during mobile migration.

**The rule:**
All persistent/session storage must go through the platform abstraction layer. Never use browser storage APIs directly in new code.

```typescript
// ❌ BANNED — direct browser storage
localStorage.setItem('answers', JSON.stringify(answers));
const saved = sessionStorage.getItem('playerData');
const parsed = JSON.parse(saved);

// ✅ CORRECT — use platform storage abstraction
import { storage, sessionStore } from '@/core/platform/storage';
await storage.set('answers', answers);           // persistent
const saved = await sessionStore.get('playerData');  // session-scoped
```

**Abstraction location:** `src/core/platform/storage.ts`

**Why async:** React Native's AsyncStorage and Capacitor's Preferences are async. Making the web version async now means zero changes later.

**Scope:**
- **New files:** ❌ ZERO direct `localStorage`/`sessionStorage`
- **Modifying existing files:** ⚠️ Do NOT add new direct calls. Existing usage may remain temporarily.
- **Refactors:** ❌ Replace direct calls with platform abstraction

**Self-check:** *"Am I about to write `localStorage.` or `sessionStorage.`?"*
If yes → import from `@/core/platform/storage` instead.

---

## Rule 19 — Platform Hook Abstraction

**Trigger:** Writing any hook that directly uses `window.*`, `document.*`, `navigator.*`, or browser-specific events (online/offline, resize, beforeunload, matchMedia).

**Why it exists:**
React Native has no `window`, `document`, or `navigator` objects. Hooks like `useMediaQuery` (uses `window.matchMedia`) and `useOnlineStatus` (uses `window` events) crash at runtime in React Native.

**The rule:**
Platform-dependent hooks must be isolated in `src/core/platform/hooks/` with a platform-agnostic interface. Feature hooks must import from the platform layer, never from browser APIs directly.

```typescript
// ❌ BANNED — direct window usage in feature hooks
const [isOnline, setIsOnline] = useState(navigator.onLine);
window.addEventListener('online', handler);

// ❌ BANNED — direct matchMedia
const media = window.matchMedia('(max-width: 768px)');

// ✅ CORRECT — use platform hooks
import { useOnlineStatus } from '@/core/platform/hooks/useOnlineStatus';
import { useScreenSize } from '@/core/platform/hooks/useScreenSize';
const isOnline = useOnlineStatus();
const { isMobile, isTablet } = useScreenSize();
```

**Platform hooks to use (in `src/core/platform/hooks/`):**

| Hook | Web API it abstracts | Mobile Equivalent |
|------|---------------------|-------------------|
| `useOnlineStatus` | `window` online/offline | `@react-native-community/netinfo` |
| `useScreenSize` | `window.matchMedia()` | `Dimensions` / `useWindowDimensions` |
| `useAppLifecycle` | `window.onbeforeunload` | `AppState` + `BackHandler` |
| `useClipboard` | `navigator.clipboard` | `@react-native-clipboard/clipboard` |

**Self-check:** *"Am I using `window.*` or `document.*` in my hook?"*
If yes → create or use a platform hook from `src/core/platform/hooks/`.

---

## Rule 20 — No Raw HTML Injection in New Code

**Trigger:** Writing `dangerouslySetInnerHTML` or any string-to-HTML injection in new code.

**Why it exists:**
React Native has no DOM. `dangerouslySetInnerHTML` doesn't exist. Each instance requires either a WebView wrapper or HTML-to-native conversion during migration — adding per-instance work.

**The rule:**
Render rich content through the `<RichContent>` component, not raw HTML injection.

```tsx
// ❌ BANNED in new code
<div dangerouslySetInnerHTML={{ __html: feedback.overall }} />
<div dangerouslySetInnerHTML={{ __html: announcement.content }} />

// ✅ CORRECT — use RichContent component
import { RichContent } from '@/core/components/RichContent';
<RichContent content={feedback.overall} format="html" />
<RichContent content={announcement.content} format="html" />
```

**The `RichContent` component** (`src/core/components/RichContent.tsx`):
- **Web:** renders via `dangerouslySetInnerHTML` (same behavior as today)
- **React Native (future):** uses `react-native-render-html` or WebView
- **Single swap point** — change one file, all instances migrate

**Self-check:** *"Am I about to write `dangerouslySetInnerHTML`?"*
If yes → use `<RichContent>` instead.

---

## Rule 21 — Navigation Abstraction Enforcement

**Trigger:** Writing `useNavigate()`, `navigate()`, or `<Link>` from `react-router-dom` directly in new component/page code.

**Why it exists:**
React Native uses `@react-navigation/native` instead of `react-router-dom`. Direct coupling to `react-router-dom` throughout components means every file needs rework during migration.

**The rule:**
All navigation in new code must go through the existing `useNavigation` hook and `navigation.service.ts`. Do not import `useNavigate` from `react-router-dom` directly.

```typescript
// ❌ AVOID in new code — direct router coupling
import { useNavigate } from 'react-router-dom';
const navigate = useNavigate();
navigate('/student/homework');

// ✅ CORRECT — use navigation abstraction
import { useNavigation } from '@/hooks/useNavigation';
const { navigateTo } = useNavigation();
navigateTo('STUDENT_HOMEWORK');
```

**Good news:** The project already has `navigation.service.ts` and `useNavigation.ts`. This rule just enforces using them consistently in new code.

**Scope:**
- **New files:** ❌ No direct `useNavigate()` imports from react-router-dom
- **Existing files:** ⚠️ Do not add new direct `useNavigate()` imports
- **Refactors:** ❌ Replace with `useNavigation()` hook

**Self-check:** *"Am I importing `useNavigate` from `react-router-dom`?"*
If yes → use `useNavigation` from `@/hooks/useNavigation` instead.

---

## Rule 22 — Responsive Layout via Abstraction, Not Direct Window Measurement

**Trigger:** Writing `window.innerWidth`, `window.innerHeight`, or direct `window.matchMedia()` calls for layout decisions in component code.

**Why it exists:**
React Native has no `window.innerWidth` or `matchMedia`. Native equivalents (`Dimensions`, `useWindowDimensions`) have different APIs. Direct usage in dozens of components means dozens of manual replacements.

**The rule:**
Use the platform `useScreenSize` hook for breakpoint logic. Prefer CSS flexbox/grid for intrinsic responsiveness.

```css
/* ✅ BEST — intrinsic responsiveness (works everywhere including Capacitor) */
.card-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
}
.card {
  flex: 1 1 300px;
  max-width: 100%;
}
```

```typescript
// ❌ BANNED in component code
const isMobile = window.innerWidth < 768;

// ✅ CORRECT — platform hook
import { useScreenSize } from '@/core/platform/hooks/useScreenSize';
const { isMobile, isTablet, isDesktop } = useScreenSize();
```

**Self-check:** *"Am I using `window.innerWidth` or `window.matchMedia()` in a component?"*
If yes → use `useScreenSize()` from platform hooks.
