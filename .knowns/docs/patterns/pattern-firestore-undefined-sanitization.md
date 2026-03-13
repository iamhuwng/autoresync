---
title: 'Pattern: Firestore Undefined Sanitization'
createdAt: '2026-03-13T19:19:36.277Z'
updatedAt: '2026-03-13T19:19:36.277Z'
description: >-
  Firestore rejects undefined values in writes. Every write function must
  sanitize using conditional spreading: ...(val !== undefined && { key: val }).
  Prevents silent write failures.
tags:
  - pattern
  - firestore
  - safety
  - bug-prevention
---
# Content

Write your documentation here.
