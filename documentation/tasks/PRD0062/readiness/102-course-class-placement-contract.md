# #102 Course/Class Book placement contract

Status: frozen definition; no Course/Class product behaviour is implemented by this packet.

The authoritative machine-readable contract is [`102-course-class-placement-contract.json`](../supporting/102-course-class-placement-contract.json). It is derived from the canonical PRD and the provenance-selected decision records, particularly the Course/Class amendment: Book delivery is never resolved by bare `materialId`.

## Frozen decisions

- `courseMaterialId` is the immutable placement identity. A copy has its own immutable `copyId`; a Book may not infer either identity from `materialId`.
- The context is exactly `course` or `class-course`. Every new Book placement pins Book, unit, source, activity, activity version, and binding revision before issuing the immutable per-student delivery binding.
- Existing Mode 1 bare-`materialId` readers remain available only to legacy non-Book material. New Book reads require the explicit placement record and are denied if any context, copy, or pin differs.
- Migration is additive dual-read. Rollback stops new Book writes/entitlements without deleting bindings, pins, legacy records, or already-readable material.
- Existing Course access remains the enrolment/module-lock seam; Book Delivery remains the entitlement/pinned-projection seam. The shared contract does not introduce another Class binding schema.

## Current implementation trace

`src/services/courseMaterialAccessService.ts` is the existing Course access reader. `bookDelivery.types.ts`, `bookDelivery.binding.ts`, `bookDelivery.bindingRepository.ts`, `bookDelivery.entitlement.ts`, and `bookDelivery.service.ts` own immutable Book Delivery parsing, binding paths, entitlement resolution, and projection. The Worker registers the current launch route in `cloudflare/worker.js` and delegates to `createBookDeliveryWorkerHandlers`; it presently admits only Solo/preview/Homework, which is intentional baseline evidence rather than #102 product delivery.

Rules are represented by `database.rules.json`; notification production remains at the accepted Book Homework emitter. `StudentPracticePage.tsx` is the current runtime launch seam. The fixture/test handoff is frozen in the JSON contract, so #102 can add Course fixtures, #103 can add Class/copy fixtures, and #130/#134 can own browser/deployed proof without redefining identity or authority.

## Ownership and proof boundary

#102 owns this shared identity/authority contract and the Course vertical. #103 consumes it for Class/copy, #104 only dispatches an already-resolved binding, #107 exposes read-only adapters, #118 implements generated/active rules, and #130/#134 own browser and canary proof. Static and unit evidence here is not emulator, browser, or deployed evidence.

The validator reads Git tree objects, not working-tree path presence. It rejects duplicate ownership/handoffs, stale baseline ancestry, missing code evidence, incomplete state/failure/proof classes, compatibility or rollback omissions, and unlabeled baseline findings.

## Trusted Course authority adapter

The existing `course_materials/{courseMaterialId}` record is the sole Course material/Book placement identity; no nested Course material path is introduced. The client reader scans legacy `course_enrollments` and `course_materials`; the Worker must not reuse those scans. #102 therefore requires the additive `course_book_authority` projection: exact keyed enrollment and module-release records, together with direct reads of Course, Module, CourseMaterial, and accepted Book publication. These are direct-child point reads, not queries, so the fragment declares child ownership and browser-write denial rather than unused indexes. Six bounded reads establish all authority facts. Course/archive, enrollment expiry, release lock, and binding revoke invalidate resolution without deleting immutable placement history. Browser writes are denied. #103 owns all Class locks/copies and is explicitly excluded.

The enrollment fact is produced only by the future trusted `CourseEnrollmentAuthorityPort.transitionDirectCourseEnrollment` contribution through #59. It uses the accepted limited-privilege Firebase Auth service-identity pattern and one root multi-location PATCH for the legacy `course_enrollments/{legacyEnrollmentId}` row, exact `course_book_authority/enrollments/{courseId}/{studentId}` projection, and immutable operation receipt. The #102 fragment validates scoped claims, `data`/`newData` revisions, exact receipt replay, and the three-path all-or-nothing shape; browser writes are denied. A transport-uncertain caller reads only its scoped receipt before retrying. #118 must compose and activate that fragment before the producer is enabled. Class rows remain untouched; rollback is deny-only and restore/replay is side-effect suppressed outside its approved phase.
