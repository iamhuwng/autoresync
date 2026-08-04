Post-review remediation complete:

- review/read-only choice and text-entry controls remain focusable while all
  changes are guarded;
- optional structured `book-pages` context is no longer treated as required;
  source-assisted and explicitly required context still fail closed without a
  valid description;
- focused renderer/codec/registry/dependency suite: 11 files, 40 tests PASS;
- TypeScript PASS;
- production build PASS: 9,346 modules, bundle budget PASS, 234 KB root entry;
- staged diff check PASS.

Browser-level 200% zoom and assembled student-runtime proof remain open and
destination-owned by #73. #38 claims only component CSS bounds and
narrow-viewport behavior.
