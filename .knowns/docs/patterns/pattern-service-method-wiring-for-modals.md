---
title: 'Pattern: Service Method Wiring for Modals'
createdAt: '2026-03-19T15:46:59.022Z'
updatedAt: '2026-03-19T15:53:40.597Z'
tags:
  - pattern
  - firebase
  - homework
  - service-wiring
---
# Pattern: Service Method Wiring for Modal Components

## Problem
Modal components (e.g., `HomeworkCreateModal`) call service methods that don't exist. The component was written with `// TODO: Replace with actual service` stubs calling methods like `queryOptimizer.getClassesByTeacher()` and `queryOptimizer.getAssignedStudents()` which were never implemented. Since the service file is JavaScript (not TypeScript), the compiler doesn't catch missing methods.

## Solution

### 1. Use Existing Services — Don't Invent Methods
Before calling a service method, verify it exists:
```bash
grep -r "getClassesByTeacher" src/services/
```

If it doesn't exist, find the correct service. In this case:
- `getClassesByTeacher()` → Use `getClasses(teacherId)` from `classManager.ts`
- `getAssignedStudents()` → Derive from class roster data (see below)

### 2. Derive Student Lists from Class Roster
When no dedicated "get students for teacher" endpoint exists, derive from class data:
```typescript
import { getClasses, getClass } from '../../services/classManager';

const loadStudents = async () => {
    const teacherClasses = await getClasses(user?.uid);
    const studentMap = new Map<string, { id: string; name: string; email: string }>();

    for (const cls of teacherClasses) {
        const fullClass = await getClass(cls.id);
        if (fullClass?.students) {
            for (const [studentId, studentData] of Object.entries(fullClass.students)) {
                if (!studentMap.has(studentId)) {
                    studentMap.set(studentId, {
                        id: studentId,
                        name: studentData.name || studentData.uid || studentId,
                        email: studentData.email || '',
                    });
                }
            }
        }
    }
    setStudents(Array.from(studentMap.values()));
};
```

### 3. Null-Safe Firebase Data Filtering
Firebase doesn't enforce schemas. Always guard property access:
```typescript
// BAD:  m.title.toLowerCase()
// GOOD: (m.title || '').toLowerCase()
```

## Source
- HomeworkCreateModal.tsx fix — March 2026
- `classManager.ts` — service providing getClasses() and getClass()
- `firebaseQueryOptimizer.js` — does NOT have getClassesByTeacher/getAssignedStudents
