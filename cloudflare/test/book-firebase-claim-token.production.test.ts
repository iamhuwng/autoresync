import {
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
      : expected.service === 'book_homework' ? (expected.ownerId ?? expected.assignmentId)
        : expected.service === 'book_delivery' ? (expected.recipientId ?? identity)
          : expected.ownerId,
  );
  expect(verified.payload.claims).toEqual(expected.service === 'book_activity_authoring'
    ? {
      book_activity_authoring_service: true,
      book_activity_authoring_ownerId: expected.ownerId,
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
      const body = JSON.parse(String(init?.body)) as { token: string; returnSecureToken: boolean };
      expect(body.returnSecureToken).toBe(true);
      expect(body.token).toMatch(/^.+\..+\..+$/u);
      customTokens.push(body.token);
      return new Response(JSON.stringify({ idToken: 'firebase-id-token', expiresIn: '3600' }), {
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
      service: 'book_assembly_publication',
      bookId: 'book-1',
      ownerId: 'teacher-1',
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
    await expect(provider(delivery)).resolves.toBe('firebase-id-token');
    await expect(provider(assembly)).resolves.toBe('firebase-id-token');
    await expect(provider(runtime)).resolves.toBe('firebase-id-token');
    await expect(provider(runtimeReader)).resolves.toBe('firebase-id-token');
    expect(fetchImpl).toHaveBeenCalledTimes(6);
    expect(customTokens).toHaveLength(6);
    await verifyCustomToken(customTokens[0], authoring);
    await verifyCustomToken(customTokens[1], homework);
    await verifyCustomToken(customTokens[2], delivery);
    await verifyCustomToken(customTokens[3], assembly);
    await verifyCustomToken(customTokens[4], runtime);
    await verifyCustomToken(customTokens[5], runtimeReader);
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
