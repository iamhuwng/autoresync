import { createFirebaseVerifier } from '../firebase-verification.js';
import { createBookDocumentWorker } from './document-worker.ts';
import { authorizeTeacherAssemblyDocumentRequest } from './teacher-assembly-authority.ts';

const BOOK_ID = 'prd0062-ticket56-book';
const UNIT_KEY = 'unit-fixture';
const CANDIDATE_ID = 'candidate-ticket56';
const SOURCE_KEY = 'full';
const SOURCE_VERSION_ID = 'source-full-ready';
const PDF_BASE64 = 'JVBERi0xLjMKJbrfrOAKMyAwIG9iago8PC9UeXBlIC9QYWdlCi9QYXJlbnQgMSAwIFIKL1Jlc291cmNlcyAyIDAgUgovTWVkaWFCb3ggWzAgMCA2MTIuIDc5Mi5dCi9Db250ZW50cyA0IDAgUgo+PgplbmRvYmoKNCAwIG9iago8PAovTGVuZ3RoIDEwNwo+PgpzdHJlYW0KMC4yMDAwMjUgdwowIEcKQlQKL0YxIDE4IFRmCjIwLjY5OTk5OTk5OTk5OTk5OTMgVEwKMCBnCjcyLiA2OTYuIFRkCihQUkQwMDYyIHRlYWNoZXIgQXNzZW1ibHkgcHJldmlldykgVGoKRVQKZW5kc3RyZWFtCmVuZG9iagoxIDAgb2JqCjw8L1R5cGUgL1BhZ2VzCi9LaWRzIFszIDAgUiBdCi9Db3VudCAxCj4+CmVuZG9iago1IDAgb2JqCjw8Ci9UeXBlIC9Gb250Ci9CYXNlRm9udCAvSGVsdmV0aWNhCi9TdWJ0eXBlIC9UeXBlMQovRW5jb2RpbmcgL1dpbkFuc2lFbmNvZGluZwovRmlyc3RDaGFyIDMyCi9MYXN0Q2hhciAyNTUKPj4KZW5kb2JqCjYgMCBvYmoKPDwKL1R5cGUgL0ZvbnQKL0Jhc2VGb250IC9IZWx2ZXRpY2EtQm9sZAovU3VidHlwZSAvVHlwZTEKL0VuY29kaW5nIC9XaW5BbnNpRW5jb2RpbmcKL0ZpcnN0Q2hhciAzMgovTGFzdENoYXIgMjU1Cj4+CmVuZG9iago3IDAgb2JqCjw8Ci9UeXBlIC9Gb250Ci9CYXNlRm9udCAvSGVsdmV0aWNhLU9ibGlxdWUKL1N1YnR5cGUgL1R5cGUxCi9FbmNvZGluZyAvV2luQW5zaUVuY29kaW5nCi9GaXJzdENoYXIgMzIKL0xhc3RDaGFyIDI1NQo+PgplbmRvYmoKOCAwIG9iago8PAovVHlwZSAvRm9udAovQmFzZUZvbnQgL0hlbHZldGljYS1Cb2xkT2JsaXF1ZQovU3VidHlwZSAvVHlwZTEKL0VuY29kaW5nIC9XaW5BbnNpRW5jb2RpbmcKL0ZpcnN0Q2hhciAzMgovTGFzdENoYXIgMjU1Cj4+CmVuZG9iago5IDAgb2JqCjw8Ci9UeXBlIC9Gb250Ci9CYXNlRm9udCAvQ291cmllcgovU3VidHlwZSAvVHlwZTEKL0VuY29kaW5nIC9XaW5BbnNpRW5jb2RpbmcKL0ZpcnN0Q2hhciAzMgovTGFzdENoYXIgMjU1Cj4+CmVuZG9iagoxMCAwIG9iago8PAovVHlwZSAvRm9udAovQmFzZUZvbnQgL0NvdXJpZXItQm9sZAovU3VidHlwZSAvVHlwZTEKL0VuY29kaW5nIC9XaW5BbnNpRW5jb2RpbmcKL0ZpcnN0Q2hhciAzMgovTGFzdENoYXIgMjU1Cj4+CmVuZG9iagoxMSAwIG9iago8PAovVHlwZSAvRm9udAovQmFzZUZvbnQgL0NvdXJpZXItT2JsaXF1ZQovU3VidHlwZSAvVHlwZTEKL0VuY29kaW5nIC9XaW5BbnNpRW5jb2RpbmcKL0ZpcnN0Q2hhciAzMgovTGFzdENoYXIgMjU1Cj4+CmVuZG9iagoxMiAwIG9iago8PAovVHlwZSAvRm9udAovQmFzZUZvbnQgL0NvdXJpZXItQm9sZE9ibGlxdWUKL1N1YnR5cGUgL1R5cGUxCi9FbmNvZGluZyAvV2luQW5zaUVuY29kaW5nCi9GaXJzdENoYXIgMzIKL0xhc3RDaGFyIDI1NQo+PgplbmRvYmoKMTMgMCBvYmoKPDwKL1R5cGUgL0ZvbnQKL0Jhc2VGb250IC9UaW1lcy1Sb21hbgovU3VidHlwZSAvVHlwZTEKL0VuY29kaW5nIC9XaW5BbnNpRW5jb2RpbmcKL0ZpcnN0Q2hhciAzMgovTGFzdENoYXIgMjU1Cj4+CmVuZG9iagoxNCAwIG9iago8PAovVHlwZSAvRm9udAovQmFzZUZvbnQgL1RpbWVzLUJvbGQKL1N1YnR5cGUgL1R5cGUxCi9FbmNvZGluZyAvV2luQW5zaUVuY29kaW5nCi9GaXJzdENoYXIgMzIKL0xhc3RDaGFyIDI1NQo+PgplbmRvYmoKMTUgMCBvYmoKPDwKL1R5cGUgL0ZvbnQKL0Jhc2VGb250IC9UaW1lcy1JdGFsaWMKL1N1YnR5cGUgL1R5cGUxCi9FbmNvZGluZyAvV2luQW5zaUVuY29kaW5nCi9GaXJzdENoYXIgMzIKL0xhc3RDaGFyIDI1NQo+PgplbmRvYmoKMTYgMCBvYmoKPDwKL1R5cGUgL0ZvbnQKL0Jhc2VGb250IC9UaW1lcy1Cb2xkSXRhbGljCi9TdWJ0eXBlIC9UeXBlMQovRW5jb2RpbmcgL1dpbkFuc2lFbmNvZGluZwovRmlyc3RDaGFyIDMyCi9MYXN0Q2hhciAyNTUKPj4KZW5kb2JqCjE3IDAgb2JqCjw8Ci9UeXBlIC9Gb250Ci9CYXNlRm9udCAvWmFwZkRpbmdiYXRzCi9TdWJ0eXBlIC9UeXBlMQovRmlyc3RDaGFyIDMyCi9MYXN0Q2hhciAyNTUKPj4KZW5kb2JqCjE4IDAgb2JqCjw8Ci9UeXBlIC9Gb250Ci9CYXNlRm9udCAvU3ltYm9sCi9TdWJ0eXBlIC9UeXBlMQovRmlyc3RDaGFyIDMyCi9MYXN0Q2hhciAyNTUKPj4KZW5kb2JqCjIgMCBvYmoKPDwKL1Byb2NTZXQgWy9QREYgL1RleHQgL0ltYWdlQiAvSW1hZ2VDIC9JbWFnZUldCi9Gb250IDw8Ci9GMSA1IDAgUgovRjIgNiAwIFIKL0YzIDcgMCBSCi9GNCA4IDAgUgovRjUgOSAwIFIKL0Y2IDEwIDAgUgovRjcgMTEgMCBSCi9GOCAxMiAwIFIKL0Y5IDEzIDAgUgovRjEwIDE0IDAgUgovRjExIDE1IDAgUgovRjEyIDE2IDAgUgovRjEzIDE3IDAgUgovRjE0IDE4IDAgUgo+PgovWE9iamVjdCA8PAo+Pgo+PgplbmRvYmoKMTkgMCBvYmoKPDwKL1Byb2R1Y2VyIChqc1BERiA0LjIuMSkKL0NyZWF0aW9uRGF0ZSAoRDoyMDI2MDcyNzEyMDAzOSswNycwMCcpCj4+CmVuZG9iagoyMCAwIG9iago8PAovVHlwZSAvQ2F0YWxvZwovUGFnZXMgMSAwIFIKL09wZW5BY3Rpb24gWzMgMCBSIC9GaXRIIG51bGxdCi9QYWdlTGF5b3V0IC9PbmVDb2x1bW4KPj4KZW5kb2JqCnhyZWYKMCAyMQowMDAwMDAwMDAwIDY1NTM1IGYgCjAwMDAwMDAyNzggMDAwMDAgbiAKMDAwMDAwMjA5NSAwMDAwMCBuIAowMDAwMDAwMDE1IDAwMDAwIG4gCjAwMDAwMDAxMjAgMDAwMDAgbiAKMDAwMDAwMDMzNSAwMDAwMCBuIAowMDAwMDAwNDYwIDAwMDAwIG4gCjAwMDAwMDA1OTAgMDAwMDAgbiAKMDAwMDAwMDcyMyAwMDAwMCBuIAowMDAwMDAwODYwIDAwMDAwIG4gCjAwMDAwMDA5ODMgMDAwMDAgbiAKMDAwMDAwMTExMiAwMDAwMCBuIAowMDAwMDAxMjQ0IDAwMDAwIG4gCjAwMDAwMDEzODAgMDAwMDAgbiAKMDAwMDAwMTUwOCAwMDAwMCBuIAowMDAwMDAxNjM1IDAwMDAwIG4gCjAwMDAwMDE3NjQgMDAwMDAgbiAKMDAwMDAwMTg5NyAwMDAwMCBuIAowMDAwMDAxOTk5IDAwMDAwIG4gCjAwMDAwMDIzNDMgMDAwMDAgbiAKMDAwMDAwMjQyOSAwMDAwMCBuIAp0cmFpbGVyCjw8Ci9TaXplIDIxCi9Sb290IDIwIDAgUgovSW5mbyAxOSAwIFIKL0lEIFsgPDVGNEE1RTU0NjhERDkwQkFEQTk1NThGQjNFQUUyRDdDPiA8NUY0QTVFNTQ2OEREOTBCQURBOTU1OEZCM0VBRTJEN0M+IF0KPj4Kc3RhcnR4cmVmCjI1MzMKJSVFT0Y=';
const PDF_BYTES = Uint8Array.from(atob(PDF_BASE64), (character) => character.charCodeAt(0));
const PDF_SHA256 = '4fc231f164128516684c8b296e88191c9b43274edae438733e638521e0db78f0';
const STATUS_PATH = '/__ticket58/status';

const sourceSet = Object.freeze({
  sourceStrategy: 'full_pdf',
  sources: Object.freeze([{
    sourceKey: SOURCE_KEY,
    sourceVersionId: SOURCE_VERSION_ID,
    sourceOrder: 1,
  }]),
});

const manifest = Object.freeze({
  bookId: BOOK_ID,
  sourceSet,
  nodes: Object.freeze([{
    nodeKey: UNIT_KEY,
    parentNodeKey: null,
    nodeType: 'unit',
    order: 1,
  }]),
  units: Object.freeze([{
    unitKey: UNIT_KEY,
    activitySlots: Object.freeze([{
      activityKey: 'activity-ticket58-preview',
      order: 1,
      contextRequirement: 'none',
      pageGroupKeys: Object.freeze(['ticket58-pages']),
    }]),
    pageGroups: Object.freeze([{
      pageGroupKey: 'ticket58-pages',
      sourceKey: SOURCE_KEY,
      pages: Object.freeze([1]),
      activityKeys: Object.freeze(['activity-ticket58-preview']),
      mode: 'activity',
    }]),
  }]),
});

const storage = Object.freeze({
  bookId: BOOK_ID,
  sourceVersionId: SOURCE_VERSION_ID,
  storageLocationId: 'ticket58-location',
  providerKind: 'backblaze-b2-s3',
  privateBucketId: 'ticket58-private-bucket',
  providerObjectKey: 'ticket58/book/source-version.pdf',
  providerFileId: 'ticket58-file',
  providerFileVersionId: 'ticket58-file-version',
  checksum: Object.freeze({ algorithm: 'sha-256', value: PDF_SHA256 }),
  byteSize: PDF_BYTES.byteLength,
  provider: 'b2',
  bucket: 'ticket58-private-bucket',
  objectKey: 'ticket58/book/source-version.pdf',
});

const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: {
    'cache-control': 'no-store',
    'content-type': 'application/json; charset=utf-8',
  },
});

const statusFor = (code) => {
  if (code === 'unauthorized') return 401;
  if (code === 'not-found') return 404;
  if (code === 'authorization-unavailable') return 503;
  return 403;
};

const activeState = (env) => env.TICKET58_ASSEMBLY_STATE === 'active';

const portsFor = (uid, env) => ({
  verifyFirebaseIdentity: async () => ({
    uid,
    role: 'super_admin',
    status: 'active',
  }),
  readBookAuthority: async (bookId) => bookId === BOOK_ID
    ? {
        bookId: BOOK_ID,
        ownerId: uid,
        bookMode: 'pdf',
        status: activeState(env) ? 'active' : 'archived',
        bookRevision: 7,
        sourceSetRevision: 4,
        sourceSet,
      }
    : null,
  readCandidate: async ({ bookId, unitKey, candidateId }) =>
    bookId === BOOK_ID && unitKey === UNIT_KEY && candidateId === CANDIDATE_ID
      ? {
          current: { candidateId: CANDIDATE_ID, candidateRevision: 1 },
          candidate: {
            candidateId: CANDIDATE_ID,
            ownerId: uid,
            bookId: BOOK_ID,
            bookRevision: 7,
            sourceSetRevision: 4,
            unitKey: UNIT_KEY,
            revision: 1,
            lifecycle: 'validated',
            manifest,
            validation: { valid: true, errors: [] },
            updatedAt: '2026-07-27T00:00:00.000Z',
          },
        }
      : null,
  readSourceVersion: async ({ bookId, sourceVersionId }) =>
    bookId === BOOK_ID && sourceVersionId === SOURCE_VERSION_ID
      ? {
          sourceVersionId: SOURCE_VERSION_ID,
          sourceKey: SOURCE_KEY,
          bookId: BOOK_ID,
          ownerId: uid,
          bookRevision: 7,
          sourceSetRevision: 4,
          lifecycle: activeState(env) ? 'verified-usable' : 'unusable',
          storage,
        }
      : null,
});

export const createTeacherAssemblyPreviewWorker = ({
  verifier = createFirebaseVerifier(),
} = {}) => ({
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === STATUS_PATH) {
      if (request.method !== 'GET') return json({ code: 'method_not_allowed' }, 405);
      return json({
        status: 'available',
        assemblyState: env.TICKET58_ASSEMBLY_STATE ?? 'disabled',
        ownerAuthorityConfigured: typeof env.TICKET58_ALLOWED_OWNER_EMAIL === 'string'
          && env.TICKET58_ALLOWED_OWNER_EMAIL.length > 0,
        pdfByteLength: PDF_BYTES.byteLength,
        versionId: env.CF_VERSION_METADATA?.id ?? null,
      });
    }

    let providerCalls = 0;
    const worker = createBookDocumentWorker({
      authorize: async (documentRequest) => {
        if (env.TICKET58_ASSEMBLY_STATE === 'disabled') {
          return { ok: false, code: 'teacher-assembly-disabled', status: 503 };
        }
        const verified = await verifier.verifyAuthorizationHeader(
          documentRequest.headers.get('authorization'),
          env,
        );
        if (!verified.valid || !verified.uid) {
          return { ok: false, code: 'unauthorized', status: 401 };
        }
        if (
          typeof env.TICKET58_ALLOWED_OWNER_EMAIL !== 'string'
          || env.TICKET58_ALLOWED_OWNER_EMAIL.length === 0
          || verified.email !== env.TICKET58_ALLOWED_OWNER_EMAIL
        ) {
          return { ok: false, code: 'forbidden', status: 403 };
        }
        const result = await authorizeTeacherAssemblyDocumentRequest({
          request: documentRequest,
          ports: portsFor(verified.uid, env),
        });
        if (result.ok === false) {
          return { ok: false, code: result.code, status: statusFor(result.code) };
        }
        return {
          ok: true,
          decision: result.decision,
          source: result.decision.sourceLocations[0],
        };
      },
      provider: {
        async readObjectMetadata({ identity }) {
          providerCalls += 1;
          return { identity, contentType: 'application/pdf' };
        },
        async readBounded({ identity, range }) {
          providerCalls += 1;
          const offset = range.offset ?? Math.max(0, PDF_BYTES.byteLength - range.suffixLength);
          const length = range.length ?? PDF_BYTES.byteLength - offset;
          return {
            bytes: PDF_BYTES.slice(offset, offset + length),
            totalByteSize: identity.byteSize,
            offset,
          };
        },
      },
    });
    const response = await worker.fetch(request, env);
    const headers = new Headers(response.headers);
    headers.set('x-ticket58-provider-calls', String(providerCalls));
    const exposed = headers.get('access-control-expose-headers');
    headers.set(
      'access-control-expose-headers',
      [exposed, 'X-Ticket58-Provider-Calls'].filter(Boolean).join(', '),
    );
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  },
});

export default createTeacherAssemblyPreviewWorker();
