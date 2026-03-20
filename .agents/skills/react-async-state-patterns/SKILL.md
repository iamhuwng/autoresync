---
name: react-async-state-patterns
description: Use this skill when working with React state updates in async callbacks, Firebase real-time subscriptions, or pagination handlers. Covers stale closure prevention, Firebase undefined-field safety, and consistent pattern propagation across similar functions.
---

# React Async State & Firebase Patterns

## Overview

Common pitfalls when combining React state management with async operations (Firebase, REST APIs, subscriptions). Lessons learned from production bugs.

---

## Pattern 1: Stale Closures in Async State Updates

### The Problem
When you read state inside an async callback, the callback captures the state value from when it was created — not the current value.

### ❌ WRONG — Stale Closure Bug
```jsx
const [items, setItems] = useState([]);

const handleLoadMore = async () => {
    const result = await fetchMore(cursor);
    setItems(prev => [...prev, ...result]);
    // BUG: `items.length` is stale — it's the value from when handleLoadMore was defined
    console.log(`Total: ${items.length + result.length}`);
};
```

### ✅ CORRECT — Compute Inside Updater
```jsx
const handleLoadMore = async () => {
    const result = await fetchMore(cursor);
    setItems(prev => {
        const updated = [...prev, ...result];
        // CORRECT: `updated.length` is computed from the actual current state
        console.log(`Total: ${updated.length}`);
        return updated;
    });
};
```

### Rule
> When you need to know the *new* state after an update, compute it inside the `setState(prev => ...)` updater function. Never rely on the outer closure's variable.

---

## Pattern 2: Firebase Undefined Field Safety

### The Problem
Firebase Realtime Database rejects writes containing `undefined` values. Optional fields must be conditionally included.

### ❌ WRONG — Writes undefined to Firebase
```ts
const data = {
    id: notificationId,
    title: payload.title,
    message: payload.message,
    link: payload.link,         // undefined if not provided → Firebase rejects
    metadata: payload.metadata  // undefined if not provided → Firebase rejects
};
await set(ref(database, path), data);
```

### ✅ CORRECT — Spread-Conditional Pattern
```ts
const data = {
    id: notificationId,
    title: payload.title,
    message: payload.message,
    ...(payload.link !== undefined && { link: payload.link }),
    ...(payload.metadata !== undefined && { metadata: payload.metadata }),
};
await set(ref(database, path), data);
```

### Rule
> When writing to Firebase, never assign optional fields directly. Use the spread-conditional pattern: `...(value !== undefined && { key: value })`.

### Propagation Rule
> When you fix this pattern in one function (e.g., `createNotification`), **grep for all similar functions** (e.g., `createBulkNotifications`) and apply the same fix. Inconsistency across similar functions is a common source of bugs.

---

## Pattern 3: Client-Side Navigation vs Hard Reload

### The Problem
Using `window.location.href` for navigation causes a full page reload, destroying all in-memory React state, losing authentication context temporarily, and creating a jarring UX.

### ❌ WRONG — Full Page Reload
```tsx
<Button onClick={() => window.location.href = '/teacher-invite'}>
    Redeem Invite
</Button>
```

### ✅ CORRECT — React Router Navigation
```tsx
import { useNavigate } from 'react-router-dom';
// ...
const navigate = useNavigate();
// ...
<Button onClick={() => navigate('/teacher-invite')}>
    Redeem Invite
</Button>
```

### Rule
> Always use `useNavigate()` from react-router-dom for internal navigation. Reserve `window.location.href` for external URLs or forced full-page refreshes only.

---

## Pattern 4: CSS Transform vs Position for Animations

### The Problem
Animating `left`/`right`/`top`/`bottom` triggers layout recalculation on every frame. `transform` uses GPU compositing for smooth 60fps animations.

### ❌ WRONG — Layout-Triggering Animation
```jsx
<aside style={{
    position: 'fixed',
    left: showSidebar ? 0 : '-100%',
    transition: 'left 0.3s ease-in-out',
}}>
```

### ✅ CORRECT — GPU-Composited Animation
```jsx
<aside style={{
    position: 'fixed',
    left: 0,
    transform: showSidebar ? 'translateX(0)' : 'translateX(-100%)',
    transition: 'transform 0.3s ease-in-out',
}}>
```

### Rule
> For slide-in/slide-out animations, use `transform: translateX()` instead of animating `left`/`right`. Set the element's position to its final location, then use `transform` to move it off-screen. This triggers GPU compositing, not layout recalculation.

---

## Pattern 5: Subscription Cleanup Functions

### The Problem
Firebase `onValue()` and similar subscription APIs return an unsubscribe function. If your subscription setup returns `undefined` (e.g., due to an error or mock), React's useEffect cleanup will crash with `unsubscribe is not a function`.

### ✅ Defensive Pattern
```tsx
useEffect(() => {
    if (!userId) return;

    const unsubscribe = subscribeToNotifications(userId, (notifications) => {
        setNotifications(notifications);
    });

    // Defensive: ensure unsubscribe is callable
    return () => {
        if (typeof unsubscribe === 'function') {
            unsubscribe();
        }
    };
}, [userId]);
```

### For Tests
Always mock subscription services to return a function:
```js
subscribeToNotifications: vi.fn((_userId, cb) => {
    cb([]); // fire with initial data
    return () => {}; // return unsubscribe
}),
```
