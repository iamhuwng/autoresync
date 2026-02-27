# Conversation Log — 2025-02-27

## 1. Fix Teacher Lobby Not Loading

**Time:** ~02:14 AM  
**Request:** Teacher lobby page is not loading. Console shows `SyntaxError: The requested module '/src/services/firebase.js' does not provide an export named 'db'`

**Root Cause:**  
`TeacherLobbyPage.jsx` line 5 imported `{ database, db }` from `../services/firebase`, but `firebase.js` exports `firestore` — not `db`.

**Fix:**  
Changed import to `{ database, firestore as db }` so the rest of the file (which uses `db` throughout for Firestore operations) continues to work.

**File Modified:**  
- `src/pages/TeacherLobbyPage.jsx` — line 5 import statement

**Verification:**  
Grep confirmed no other files have the same bad import — all other consumers use valid export names (`database`, `auth`, `firestore`, `googleProvider`).
