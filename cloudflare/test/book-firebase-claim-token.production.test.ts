import {
  decodeJwt,
  decodeProtectedHeader,
  importSPKI,
  jwtVerify,
} from 'jose';
import { describe, expect, it, vi } from 'vitest';
import {
  createFirebaseClaimTokenProvider,
  type BookFirebaseClaimTuple,
} from '../src/upload-worker/book-activity-authoring/firebase-token.ts';

const privateKey = `-----BEGIN PRIVATE KEY-----
MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQClFZANZJnKeRMA
sTwvl9czA5NOc7KHkDI0Cw+wFN0ACKDb5bRRBRw0JQwLbEMMiXC2bTxZZKU2mHqm
la3b4c/MpAt2669Vh+iVzA4gBHMp1l1Y647g8WHCl1b/DSmD2DEBLKK8krGCtRdH
4KVrVuYZCeXPnLfVSRg4qgZuBf8RDGZuJzV5fEmeLDc5EvS7KTh0Q9VpeU90nk/B
dI2h3aDgnpFZXqiNQ5Hlq5vy9YMGQGAE+tOcaKDu61GSbW2gODxUFeUyg5kL4GhJ
tJOmhUb/zvQdGFTmv4uJAIv42vUVDyqWiZLNnXlw0HnMBQBz7S5Lx1A2pAfujhbE
wExx+4/RAgMBAAECggEAIK9Bu50Y4+EP1ZnBqEygU13YWvaGONfgULSF8R9YWCrd
Klxy1H22BU72cQaIyeEmW0AKbEqEeWg8FGJbL0conMQ37t4f80e60Xm6rDUlVfm2
tqXAvqGb8OqE02+YMh3qKejb+Yjzs0TGbLk6FyP336o5gV7ueMCFlqZ3Km5uf0HL
PZdm3tPDBw7j2Ci+rMncHOy42zqXD46PciCXlpqYd6ntwNAO5OtWwXzDmHcziLMe
is0zK6uCJh3kwsdvFQosrj0jh9vj4CfvseNDqUno3rmlRVqBGcgUcm6ejkskb/r7
R0jCHqKkJ3VxpSUUYIsiP9FvYeKXWEOHJLjdhsbIiQKBgQDYSKFmMfB/1/of1bDr
IcvCbNVWSnpbBut5us5yMWy2vtJWbJU20mKKxc6AU1yGDlA0SJFzIOf1YnMzPwTt
fnuhFK7SenS9kTeJPNKJZ1s2UkCED9M73jM7iQ5km/9IVVjn6SaH2HqHgRJXGBmZ
bp1Vp4S7Zj7IAtDhDpqgxK42dQKBgQDDZhMkhCcFzgKauflTlYHdKMmfHQis/DFD
NxL66UpaFPc9+m79hhQLem55IHb8APOW0cEQreDa3g9HQtdpnvbxM24uJyL6Dxac
EnoiOhUjjnFTsNJryHkXalX8N08Y/gd2QTqmCJCdl0ia3Q+bCP3BhQZQSYZ1skoS
AY2XPojgbQKBgGbt4cm12IOu8D04QDMWaVcE3l5roWEyoNvUuC0GMnuhwo4YrMZj
RzxNuOG/SlgN9cN8CaRls55HFRX9VsYDnKhjJHPMjUQuGOT6CiQUCQeIC2YN9fQW
4gDiT/Q3fT0aSO5NOeYKcv2LwoOqV3x6dOvvhi59EUG0fV2tyo7aKyKFAoGAO0f9
qMd7O1ScD6s6jHRAeQOF4AMj/a9plrXfyUX768aOmDwhbkM+U5kqaQ9DagMz497x
TwkhveU/B2StC/tRei4bUF9JSkpHlsQ4T6gFf8sYcMaloFOrAUKeoa16DuALDYKO
s47HqTgbq/hDYsrgidS87KDR7WVQ+ZOFDIzJZCUCgYEArcyEmt+8rsswGJy/WFLE
D1scwJlf+K601qNt51NtkJKyPpzWv7eheqXT2XwxtvwVP9e3XDyxBOb4npbMm5y7
PhLctyYlWBhU6wcyo5Id4tzKF53JnCxVsYFRkTigHQoNiKGdiyuvqaJ+6k1knPA2
rO6VMkOay+SbMM9Gakxxa+g=
-----END PRIVATE KEY-----`;

const publicKey = `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEApRWQDWSZynkTALE8L5fX
MwOTTnOyh5AyNAsPsBTdAAig2+W0UQUcNCUMC2xDDIlwtm08WWSlNph6ppWt2+HP
zKQLduuvVYfolcwOIARzKdZdWOuO4PFhwpdW/w0pg9gxASyivJKxgrUXR+Cla1bm
GQnlz5y31UkYOKoGbgX/EQxmbic1eXxJniw3ORL0uyk4dEPVaXlPdJ5PwXSNod2g
4J6RWV6ojUOR5aub8vWDBkBgBPrTnGig7utRkm1toDg8VBXlMoOZC+BoSbSTpoVG
/870HRhU5r+LiQCL+Nr1FQ8qlomSzZ15cNB5zAUAc+0uS8dQNqQH7o4WxMBMcfuP
0QIDAQAB
-----END PUBLIC KEY-----`;

const identity = 'book-activity-authoring@temp-a1437.iam.gserviceaccount.com';
const audience = 'https://identitytoolkit.googleapis.com/google.identity.identitytoolkit.v1.IdentityToolkit';

const verifyCustomToken = async (
  token: string,
  expected: BookFirebaseClaimTuple,
): Promise<void> => {
  const verified = await jwtVerify(token, await importSPKI(publicKey, 'RS256'), {
    issuer: identity,
    audience,
    currentDate: new Date(1_700_000_000_000),
  });
  expect(decodeProtectedHeader(token)).toMatchObject({ alg: 'RS256', typ: 'JWT' });
  expect(verified.payload.uid).toBe(
    expected.service === 'book_runtime' ? expected.recipientId
      : expected.service === 'book_homework_authority' ? expected.ownerId
      : expected.service === 'book_homework' ? (expected.ownerId ?? expected.assignmentId)
        : expected.service === 'book_delivery' ? (expected.recipientId ?? identity)
          : expected.ownerId,
  );
  expect(verified.payload.claims).toEqual(expected.service === 'book_activity_authoring'
    ? {
      book_activity_authoring_service: true,
      book_activity_authoring_ownerId: expected.ownerId,
    }
    : expected.service === 'book_assembly'
      ? {
        book_assembly_service: true,
        book_assembly_bookId: expected.bookId,
        book_assembly_unitKey: expected.unitKey,
        book_assembly_ownerId: expected.ownerId,
      }
    : expected.service === 'book_assembly_activity_binding'
      ? {
        book_assembly_activity_binding_service: true,
        book_assembly_activity_binding_bookId: expected.bookId,
        book_assembly_activity_binding_unitKey: expected.unitKey,
        book_assembly_activity_binding_activityKey: expected.activityKey,
        book_assembly_activity_binding_ownerId: expected.ownerId,
      }
    : expected.service === 'book_assembly_preview'
      ? {
        book_assembly_preview_service: true,
        book_assembly_preview_bookId: expected.bookId,
        book_assembly_preview_unitKey: expected.unitKey,
        book_assembly_preview_ownerId: expected.ownerId,
      }
    : expected.service === 'book_assembly_preview_approval'
      ? {
        book_assembly_preview_approval_service: true,
        book_assembly_preview_approval_bookId: expected.bookId,
        book_assembly_preview_approval_unitKey: expected.unitKey,
        book_assembly_preview_approval_approvalId: expected.approvalId,
        book_assembly_preview_approval_ownerId: expected.ownerId,
      }
    : expected.service === 'book_homework_authority'
      ? {
        book_homework_authority_service: true,
        book_homework_authority_authorityId: expected.authorityId,
        book_homework_authority_assignmentId: expected.assignmentId,
        book_homework_authority_ownerId: expected.ownerId,
      }
    : expected.service === 'book_homework_compatibility'
      ? {
        book_homework_compatibility_service: true,
        book_homework_compatibility_assignmentId: expected.assignmentId,
        book_homework_compatibility_ownerId: expected.ownerId,
      }
    : expected.service === 'book_homework'
      ? {
      book_homework_service: true,
      book_homework_ownerId: expected.ownerId,
    }
      : expected.service === 'book_delivery'
        ? expected.recipientId === undefined
          ? { book_delivery_service: true }
          : {
            book_delivery_service: true,
            book_delivery_recipientId: expected.recipientId,
            book_delivery_contextId: expected.contextId,
          }
        : expected.service === 'book_assembly_publication'
          ? {
            book_assembly_publication_service: true,
            book_assembly_publication_bookId: expected.bookId,
            book_assembly_publication_ownerId: expected.ownerId,
          }
        : expected.service === 'book_activity_publication_writer'
          ? {
            book_activity_publication_writer_service: true,
            book_activity_publication_writer_ownerId: expected.ownerId,
            book_activity_publication_writer_activityId: expected.activityId,
            book_activity_publication_writer_activityVersionId: expected.activityVersionId,
          }
        : expected.service === 'book_assembly_publication_approval'
          ? {
            book_assembly_publication_approval_service: true,
            book_assembly_publication_approval_bookId: expected.bookId,
            book_assembly_publication_approval_unitKey: expected.unitKey,
            book_assembly_publication_approval_approvalId: expected.approvalId,
            book_assembly_publication_approval_ownerId: expected.ownerId,
          }
      : expected.service === 'book_activity_runtime_reader'
        ? {
          book_activity_runtime_reader_service: true,
          book_activity_runtime_reader_ownerId: expected.ownerId,
          book_activity_runtime_reader_bookId: expected.bookId,
          book_activity_runtime_reader_manifestVersionId: expected.manifestVersionId,
          book_activity_runtime_reader_activityId: expected.activityId,
          book_activity_runtime_reader_activityVersionId: expected.activityVersionId,
        }
        : {
          book_runtime_service: true,
          book_runtime_recipientId: expected.recipientId,
          book_runtime_contextId: expected.contextId,
        });
};

describe('Book production Firebase claim tokens', () => {
  it('exchanges exact bounded claims for authoring, homework, delivery, assembly, runtime, and canonical reader tuples', async () => {
    const customTokens: string[] = [];
    const fetchImpl = vi.fn<typeof fetch>(async (input, init) => {
      expect(String(input)).toContain('identitytoolkit.googleapis.com');
      expect(new Headers(init?.headers).get('Referer'))
        .toBe('https://r2-upload-signer.iamhuwng.workers.dev/');
      const body = JSON.parse(String(init?.body)) as { token: string; returnSecureToken: boolean };
      expect(body.returnSecureToken).toBe(true);
      expect(body.token).toMatch(/^.+\..+\..+$/u);
      customTokens.push(body.token);
      return new Response(JSON.stringify({
        idToken: 'firebase-id-token',
        expiresIn: '3600',
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    });

    const provider = createFirebaseClaimTokenProvider({
      serviceAccountJson: JSON.stringify({
        client_email: identity,
        private_key: privateKey,
      }),
      serviceIdentity: identity,
      firebaseProjectId: 'temp-a1437',
      firebaseWebApiKey: 'web-key',
      fetchImpl,
      now: () => 1_700_000_000_000,
    });

    const authoring = {
      service: 'book_activity_authoring',
      ownerId: 'teacher-1',
    } as const;
    const homework = {
      service: 'book_homework',
      ownerId: 'teacher-1',
    } as const;
    const authority = {
      service: 'book_homework_authority',
      authorityId: 'assignment_1:@root--student_1:@recipient--authority',
      assignmentId: 'assignment_1:@root',
      ownerId: 'teacher-1',
    } as const;
    const runtime = {
      service: 'book_runtime',
      recipientId: 'student-1',
      contextId: 'assignment-1',
    } as const;
    const delivery = {
      service: 'book_delivery',
      recipientId: 'student-1',
      contextId: 'assignment-1',
    } as const;
    const assembly = {
      service: 'book_assembly',
      bookId: 'book-1',
      unitKey: 'unit-1',
      ownerId: 'teacher-1',
    } as const;
    const assemblyPreview = {
      service: 'book_assembly_preview',
      bookId: 'book-1',
      unitKey: 'unit-1',
      ownerId: 'teacher-1',
    } as const;
    const binding = {
      service: 'book_assembly_activity_binding',
      bookId: 'book-1',
      unitKey: 'unit-1',
      activityKey: 'activity-1',
      ownerId: 'teacher-1',
    } as const;
    const previewApproval = {
      service: 'book_assembly_preview_approval',
      bookId: 'book-1', unitKey: 'unit-1', approvalId: 'approval-1', ownerId: 'teacher-1',
    } as const;
    const publication = {
      service: 'book_assembly_publication',
      bookId: 'book-1',
      ownerId: 'teacher-1',
    } as const;
    const publicationWriter = {
      service: 'book_activity_publication_writer',
      ownerId: 'teacher-1',
      activityId: 'activity-1',
      activityVersionId: 'activity-version-1',
    } as const;
    const publicationApproval = {
      service: 'book_assembly_publication_approval',
      bookId: 'book-1', unitKey: 'unit-1', approvalId: 'approval-1', ownerId: 'teacher-1',
    } as const;
    const runtimeReader = {
      service: 'book_activity_runtime_reader',
      ownerId: 'teacher-1',
      bookId: 'book-1',
      manifestVersionId: 'manifest-1',
      activityId: 'activity-1',
      activityVersionId: 'activity-version-1',
    } as const;
    await expect(provider(authoring)).resolves.toBe('firebase-id-token');
    await expect(provider(authoring)).resolves.toBe('firebase-id-token');
    await expect(provider(homework)).resolves.toBe('firebase-id-token');
    await expect(provider(authority)).resolves.toBe('firebase-id-token');
    await expect(provider(delivery)).resolves.toBe('firebase-id-token');
    await expect(provider(assembly)).resolves.toBe('firebase-id-token');
    await expect(provider(binding)).resolves.toBe('firebase-id-token');
    await expect(provider(assemblyPreview)).resolves.toBe('firebase-id-token');
    await expect(provider(previewApproval)).resolves.toBe('firebase-id-token');
    await expect(provider(publication)).resolves.toBe('firebase-id-token');
    await expect(provider(publicationWriter)).resolves.toBe('firebase-id-token');
    await expect(provider(publicationApproval)).resolves.toBe('firebase-id-token');
    await expect(provider(runtime)).resolves.toBe('firebase-id-token');
    await expect(provider(runtimeReader)).resolves.toBe('firebase-id-token');
    expect(fetchImpl).toHaveBeenCalledTimes(13);
    expect(customTokens).toHaveLength(13);
    await verifyCustomToken(customTokens[0], authoring);
    await verifyCustomToken(customTokens[1], homework);
    await verifyCustomToken(customTokens[2], authority);
    await verifyCustomToken(customTokens[3], delivery);
    await verifyCustomToken(customTokens[4], assembly);
    await verifyCustomToken(customTokens[5], binding);
    await verifyCustomToken(customTokens[6], assemblyPreview);
    await verifyCustomToken(customTokens[7], previewApproval);
    await verifyCustomToken(customTokens[8], publication);
    await verifyCustomToken(customTokens[9], publicationWriter);
    await verifyCustomToken(customTokens[10], publicationApproval);
    await verifyCustomToken(customTokens[11], runtime);
    await verifyCustomToken(customTokens[12], runtimeReader);
  });

  it('isolates Assembly and exact Binding tokens by the full scope and rejects extra claim keys', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async (_input, init) => {
      return new Response(JSON.stringify({
        idToken: 'firebase-id-token',
        expiresIn: '3600',
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    });
    const provider = createFirebaseClaimTokenProvider({
      serviceAccountJson: JSON.stringify({ client_email: identity, private_key: privateKey }),
      serviceIdentity: identity,
      firebaseProjectId: 'temp-a1437',
      firebaseWebApiKey: 'web-key',
      fetchImpl,
      now: () => 1_700_000_000_000,
    });
    const assembly = {
      service: 'book_assembly',
      bookId: 'book-1',
      unitKey: 'unit-1',
      ownerId: 'teacher-1',
    } as const;
    const binding = {
      service: 'book_assembly_activity_binding',
      bookId: 'book-1',
      unitKey: 'unit-1',
      activityKey: 'activity-1',
      ownerId: 'teacher-1',
    } as const;
    await expect(provider(assembly)).resolves.toBe('firebase-id-token');
    await expect(provider(assembly)).resolves.toBe('firebase-id-token');
    await expect(provider({ ...assembly, unitKey: 'unit-2' })).resolves.toBe('firebase-id-token');
    await expect(provider({ ...assembly, ownerId: 'teacher-2' })).resolves.toBe('firebase-id-token');
    await expect(provider(binding)).resolves.toBe('firebase-id-token');
    await expect(provider({ ...binding, activityKey: 'activity-2' })).resolves.toBe('firebase-id-token');
    await expect(provider({ ...binding, activityKey: 'activity-2' })).resolves.toBe('firebase-id-token');
    await expect(provider({ ...binding, extra: 'unexpected' } as BookFirebaseClaimTuple))
      .rejects.toThrowError('invalid_book_firebase_claims');
    await expect(provider({ ...assembly, extra: 'unexpected' } as BookFirebaseClaimTuple))
      .rejects.toThrowError('invalid_book_firebase_claims');
    expect(fetchImpl).toHaveBeenCalledTimes(5);
  });

  it('isolates authority tokens by authority, root assignment, and owner while retaining the owner UID', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({
      idToken: `firebase-id-token-${fetchImpl.mock.calls.length - 1}`,
      expiresIn: '3600',
    }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }));
    const provider = createFirebaseClaimTokenProvider({
      serviceAccountJson: JSON.stringify({ client_email: identity, private_key: privateKey }),
      serviceIdentity: identity,
      firebaseProjectId: 'temp-a1437',
      firebaseWebApiKey: 'web-key',
      fetchImpl,
      now: () => 1_700_000_000_000,
    });
    const authority = {
      service: 'book_homework_authority',
      authorityId: 'assignment_1:@root--student_1:@recipient--authority',
      assignmentId: 'assignment_1:@root',
      ownerId: 'teacher-1',
    } as const;
    await expect(provider(authority)).resolves.toBe('firebase-id-token-0');
    await expect(provider(authority)).resolves.toBe('firebase-id-token-0');
    await expect(provider({ ...authority, authorityId: 'assignment_1:@root--student_2:@recipient--authority' })).resolves.toBe('firebase-id-token-1');
    await expect(provider({
      ...authority,
      authorityId: 'assignment_2:@root--student_1:@recipient--authority',
      assignmentId: 'assignment_2:@root',
    })).resolves.toBe('firebase-id-token-2');
    await expect(provider({ ...authority, ownerId: 'teacher-2' })).resolves.toBe('firebase-id-token-3');
    await expect(provider({ ...authority, authorityId: 'not-an-authority' }))
      .rejects.toThrowError('invalid_book_firebase_claims');
    await expect(provider({
      ...authority,
      authorityId: 'assignment_1:@root--student.1--authority',
    }))
      .rejects.toThrowError('invalid_book_firebase_claims');
    await expect(provider({
      ...authority,
      authorityId: 'assignment.1--student_1:@recipient--authority',
      assignmentId: 'assignment.1',
    }))
      .rejects.toThrowError('invalid_book_firebase_claims');
    await expect(provider({
      ...authority,
      authorityId: `${authority.authorityId}${'x'.repeat(200)}`,
    }))
      .rejects.toThrowError('invalid_book_firebase_claims');
    await expect(provider({ ...authority, extra: 'unexpected' } as BookFirebaseClaimTuple))
      .rejects.toThrowError('invalid_book_firebase_claims');
    expect(fetchImpl).toHaveBeenCalledTimes(4);
  });

  it('mints an owner-bound compatibility projection token with an exact assignment tuple', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async (_input, init) => new Response(JSON.stringify({
      idToken: 'compatibility-id-token',
      expiresIn: '3600',
    }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }));
    const provider = createFirebaseClaimTokenProvider({
      serviceAccountJson: JSON.stringify({ client_email: identity, private_key: privateKey }),
      serviceIdentity: identity,
      firebaseProjectId: 'temp-a1437',
      firebaseWebApiKey: 'web-key',
      fetchImpl,
      now: () => 1_700_000_000_000,
    });
    const compatibility = {
      service: 'book_homework_compatibility',
      assignmentId: 'assignment-1',
      ownerId: 'teacher-1',
    } as const;
    await expect(provider(compatibility)).resolves.toBe('compatibility-id-token');
    const customToken = JSON.parse(String(fetchImpl.mock.calls[0]?.[1]?.body)).token as string;
    await verifyCustomToken(customToken, compatibility);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('encodes the corrected production assignment, owner UID, project, and Identity Toolkit audience without exposing token bytes', async () => {
    const compatibilityIdentity = 'book-homework-runtime@temp-a1437.iam.gserviceaccount.com';
    let nonSecretMetadata: Record<string, unknown> | undefined;
    const fetchImpl = vi.fn<typeof fetch>(async (input, init) => {
      const body = JSON.parse(String(init?.body)) as { token: string; returnSecureToken: boolean };
      const decoded = decodeJwt(body.token);
      nonSecretMetadata = {
        endpointHost: new URL(String(input)).host,
        issuer: decoded.iss,
        subject: decoded.sub,
        audience: decoded.aud,
        uid: decoded.uid,
        claims: decoded.claims,
        returnSecureToken: body.returnSecureToken,
      };
      return new Response(JSON.stringify({ idToken: 'redacted', expiresIn: '3600' }), { status: 200 });
    });
    const provider = createFirebaseClaimTokenProvider({
      serviceAccountJson: JSON.stringify({ client_email: compatibilityIdentity, private_key: privateKey }),
      serviceIdentity: compatibilityIdentity,
      firebaseProjectId: 'temp-a1437',
      firebaseWebApiKey: 'redacted-web-key',
      fetchImpl,
      now: () => 1_700_000_000_000,
    });

    await provider({
      service: 'book_homework_compatibility',
      assignmentId: 'assignment-vocab-u1-ac994b46-0f53-47f5-a697-659c54b54fb4',
      ownerId: 'glMHCrzMnyS6AqFcb9I0nlOqQ6X2',
    });

    expect(nonSecretMetadata).toEqual({
      endpointHost: 'identitytoolkit.googleapis.com',
      issuer: compatibilityIdentity,
      subject: compatibilityIdentity,
      audience,
      uid: 'glMHCrzMnyS6AqFcb9I0nlOqQ6X2',
      claims: {
        book_homework_compatibility_service: true,
        book_homework_compatibility_assignmentId: 'assignment-vocab-u1-ac994b46-0f53-47f5-a697-659c54b54fb4',
        book_homework_compatibility_ownerId: 'glMHCrzMnyS6AqFcb9I0nlOqQ6X2',
      },
      returnSecureToken: true,
    });
  });

  it('fails closed when service-account identity does not match the configured identity', () => {
    expect(() => createFirebaseClaimTokenProvider({
      serviceAccountJson: JSON.stringify({
        client_email: 'other-runtime@temp-a1437.iam.gserviceaccount.com',
        private_key: privateKey,
      }),
      serviceIdentity: identity,
      firebaseProjectId: 'temp-a1437',
      firebaseWebApiKey: 'web-key',
    })).toThrowError('book_firebase_service_identity_mismatch');
  });
});
