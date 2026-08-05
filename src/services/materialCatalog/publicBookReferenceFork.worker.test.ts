/*
 * The Cloudflare package's x64 mirror intentionally contains only that
 * package, while its existing Worker tests import repository-level src/.
 * Keep the canonical Worker test beside the Worker and bridge it into the
 * root harness for deterministic local discovery.
 */
import '../../../cloudflare/test/book-reference-fork-worker.test';
