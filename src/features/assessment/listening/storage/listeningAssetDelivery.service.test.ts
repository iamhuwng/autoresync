import { describe, expect, it, vi } from 'vitest';

import {
  assertListeningDeliveryUrlUsable,
  issueListeningAssetDeliveryUrl,
  refreshListeningAssetDeliveryUrl,
  type ListeningAssetDeliveryDependencies,
  type ListeningDeliveryAssetGraph,
  type ListeningDeliveryIssuedUrl,
} from './listeningAssetDelivery.service';

const now = 1_700_000_000_000;
const hourMs = 60 * 60 * 1000;
const refreshThresholdMs = 10 * 60 * 1000;

const graph = (overrides: Partial<ListeningDeliveryAssetGraph> = {}): ListeningDeliveryAssetGraph => ({
  assetId: 'asset-1',
  canonicalAssetId: 'asset-1',
  ownerId: 'teacher-1',
  state: 'committed',
  durableKey: 'assessment-assets/listening/teacher-1/asset-1/audio.mp3',
  contentType: 'audio/mpeg',
  sizeBytes: 4096,
  references: {
    versions: { 'version-1': true },
    results: { 'result-1': true },
  },
  retainedVersions: [{
    versionId: 'version-1',
    ownerId: 'teacher-1',
    immutable: true,
    active: true,
  }],
  retainedResults: [{
    resultId: 'result-1',
    versionId: 'version-1',
    active: true,
    viewerUserIds: ['student-1', 'teacher-1'],
  }],
  ...overrides,
});

const makeDependencies = (
  resolvedGraph: ListeningDeliveryAssetGraph | null = graph(),
): ListeningAssetDeliveryDependencies => ({
  referenceGraph: {
    resolveCanonicalAssetGraph: vi.fn(async () => resolvedGraph),
  },
  signer: {
    createAuthorizedUrl: vi.fn(async (input) => ({
      url: `https://authorized.example/${input.assetId}?exp=${input.expiresAt}`,
      tokenId: `token-${input.expiresAt}`,
    })),
  },
  rangeProbe: {
    probe: vi.fn(async () => ({
      requestRange: 'bytes=0-0',
      status: 206,
      headers: {
        'accept-ranges': 'bytes',
        'content-length': '1',
        'content-range': 'bytes 0-0/4096',
      },
      bodyLengthBytes: 1,
    })),
  },
});

const trustedStudentContext = {
  runtime: 'trusted-server' as const,
  callerUserId: 'student-1',
};

const trustedOwnerContext = {
  runtime: 'trusted-server' as const,
  callerUserId: 'teacher-1',
};

const soloScope = {
  testId: 'listening-material',
  versionId: 'version-1',
  studentId: 'student-1',
  mode: 'self_study' as const,
};

describe('Listening asset authorized delivery service', () => {
  it('issues a 60-minute URL for a result viewer authorized by retained immutable version references', async () => {
    const dependencies = makeDependencies();

    await expect(issueListeningAssetDeliveryUrl({
      assetId: 'asset-1',
      context: trustedStudentContext,
      now,
      resultScope: {
        resultId: 'result-1',
        versionId: 'version-1',
      },
    }, dependencies)).resolves.toMatchObject({
      assetId: 'asset-1',
      url: `https://authorized.example/asset-1?exp=${now + hourMs}`,
      expiresAt: now + hourMs,
      refreshAfter: now + hourMs - refreshThresholdMs,
      ttlMs: hourMs,
      deliveryReady: true,
      range: {
        requestRange: 'bytes=0-0',
        status: 206,
        acceptRanges: 'bytes',
        contentLength: 1,
        contentRange: 'bytes 0-0/4096',
      },
    });

    expect(dependencies.referenceGraph.resolveCanonicalAssetGraph).toHaveBeenCalledWith('asset-1');
    expect(dependencies.rangeProbe.probe).toHaveBeenCalledWith({
      durableKey: 'assessment-assets/listening/teacher-1/asset-1/audio.mp3',
      rangeHeader: 'bytes=0-0',
    });
  });

  it('issues a URL for a solo student only when the retained graph matches test, version, and student scope', async () => {
    const dependencies = makeDependencies(graph({
      references: {
        tests: { 'listening-material': true },
        versions: { 'version-1': true },
      },
      retainedSoloAccess: [{
        testId: 'listening-material',
        versionId: 'version-1',
        active: true,
        studentUserIds: ['student-1'],
        modes: ['self_study'],
      }],
    }));

    await expect(issueListeningAssetDeliveryUrl({
      assetId: 'asset-1',
      context: trustedStudentContext,
      now,
      soloScope,
    }, dependencies)).resolves.toMatchObject({
      assetId: 'asset-1',
      url: `https://authorized.example/asset-1?exp=${now + hourMs}`,
      deliveryReady: true,
    });

    expect(dependencies.signer.createAuthorizedUrl).toHaveBeenCalledTimes(1);
  });

  it('issues a URL for a live-session student only when session, test, version, and student scope match', async () => {
    const dependencies = makeDependencies(graph({
      references: {
        tests: { 'listening-material': true },
        versions: { 'version-1': true },
        sessions: { LIVE123: true },
      },
      retainedLiveSessions: [{
        sessionCode: 'LIVE123',
        testId: 'listening-material',
        versionId: 'version-1',
        active: true,
        studentUserIds: ['student-1'],
        classIds: ['class-1'],
        sectionNumbers: [1],
      }],
    }));

    await expect(issueListeningAssetDeliveryUrl({
      assetId: 'asset-1',
      context: trustedStudentContext,
      now,
      liveScope: {
        sessionCode: 'LIVE123',
        testId: 'listening-material',
        versionId: 'version-1',
        studentId: 'student-1',
        classId: 'class-1',
        sectionNumber: 1,
      },
    }, dependencies)).resolves.toMatchObject({
      assetId: 'asset-1',
      url: `https://authorized.example/asset-1?exp=${now + hourMs}`,
      deliveryReady: true,
    });

    expect(dependencies.signer.createAuthorizedUrl).toHaveBeenCalledTimes(1);
  });

  it('denies live-session asset access when the trusted caller is not the scoped student', async () => {
    const dependencies = makeDependencies(graph({
      references: {
        tests: { 'listening-material': true },
        versions: { 'version-1': true },
        sessions: { LIVE123: true },
      },
      retainedLiveSessions: [{
        sessionCode: 'LIVE123',
        testId: 'listening-material',
        versionId: 'version-1',
        active: true,
        studentUserIds: ['student-1'],
      }],
    }));

    await expect(issueListeningAssetDeliveryUrl({
      assetId: 'asset-1',
      context: {
        runtime: 'trusted-server',
        callerUserId: 'student-2',
      },
      now,
      liveScope: {
        sessionCode: 'LIVE123',
        testId: 'listening-material',
        versionId: 'version-1',
        studentId: 'student-1',
      },
    }, dependencies)).rejects.toThrow('delivery_not_authorized');

    expect(dependencies.signer.createAuthorizedUrl).not.toHaveBeenCalled();
  });

  it('denies solo possession of a known asset ID when no retained test/version/student access exists', async () => {
    const dependencies = makeDependencies(graph({
      references: {
        tests: { 'listening-material': true },
        versions: { 'version-1': true },
      },
      retainedSoloAccess: [],
    }));

    await expect(issueListeningAssetDeliveryUrl({
      assetId: 'asset-1',
      context: trustedStudentContext,
      now,
      soloScope,
    }, dependencies)).rejects.toThrow('delivery_not_authorized');

    expect(dependencies.signer.createAuthorizedUrl).not.toHaveBeenCalled();
  });

  it('denies solo issuance when the trusted caller does not match the scoped student', async () => {
    const dependencies = makeDependencies(graph({
      references: {
        tests: { 'listening-material': true },
        versions: { 'version-1': true },
      },
      retainedSoloAccess: [{
        testId: 'listening-material',
        versionId: 'version-1',
        active: true,
        studentUserIds: ['student-1'],
      }],
    }));

    await expect(issueListeningAssetDeliveryUrl({
      assetId: 'asset-1',
      context: {
        runtime: 'trusted-server',
        callerUserId: 'student-2',
      },
      now,
      soloScope,
    }, dependencies)).rejects.toThrow('delivery_not_authorized');

    expect(dependencies.signer.createAuthorizedUrl).not.toHaveBeenCalled();
  });

  it('allows the asset owner through the trusted graph without granting other teachers by known asset ID', async () => {
    const ownerDependencies = makeDependencies();

    await expect(issueListeningAssetDeliveryUrl({
      assetId: 'asset-1',
      context: trustedOwnerContext,
      now,
    }, ownerDependencies)).resolves.toMatchObject({
      assetId: 'asset-1',
      deliveryReady: true,
    });

    const crossOwnerDependencies = makeDependencies();
    await expect(issueListeningAssetDeliveryUrl({
      assetId: 'asset-1',
      context: {
        runtime: 'trusted-server',
        callerUserId: 'teacher-2',
      },
      now,
    }, crossOwnerDependencies)).rejects.toThrow('delivery_not_authorized');
  });

  it('denies known asset ID access when no active retained result/version authorization exists', async () => {
    const dependencies = makeDependencies(graph({
      references: {},
      retainedVersions: [],
      retainedResults: [],
    }));

    await expect(issueListeningAssetDeliveryUrl({
      assetId: 'asset-1',
      context: trustedStudentContext,
      now,
      resultScope: {
        resultId: 'result-1',
        versionId: 'version-1',
      },
    }, dependencies)).rejects.toThrow('delivery_not_authorized');

    expect(dependencies.signer.createAuthorizedUrl).not.toHaveBeenCalled();
  });

  it('denies cross-user result review issuance even when the asset ID and result ID are valid', async () => {
    const dependencies = makeDependencies();

    await expect(issueListeningAssetDeliveryUrl({
      assetId: 'asset-1',
      context: {
        runtime: 'trusted-server',
        callerUserId: 'student-2',
      },
      now,
      resultScope: {
        resultId: 'result-1',
        versionId: 'version-1',
      },
    }, dependencies)).rejects.toThrow('delivery_not_authorized');

    expect(dependencies.signer.createAuthorizedUrl).not.toHaveBeenCalled();
  });

  it('rejects browser-side issuance before graph resolution or signing', async () => {
    const dependencies = makeDependencies();

    await expect(issueListeningAssetDeliveryUrl({
      assetId: 'asset-1',
      context: {
        runtime: 'browser',
        callerUserId: 'student-1',
      } as any,
      now,
    }, dependencies)).rejects.toThrow('trusted_server_required');

    expect(dependencies.referenceGraph.resolveCanonicalAssetGraph).not.toHaveBeenCalled();
    expect(dependencies.signer.createAuthorizedUrl).not.toHaveBeenCalled();
  });

  it.each([
    ['non-206 range response', { status: 200, headers: { 'accept-ranges': 'bytes', 'content-length': '4096' }, bodyLengthBytes: 4096 }, 'range_status_not_partial'],
    ['missing Accept-Ranges', { status: 206, headers: { 'content-length': '1', 'content-range': 'bytes 0-0/4096' }, bodyLengthBytes: 1 }, 'range_accept_ranges_missing'],
    ['unstable Content-Length', { status: 206, headers: { 'accept-ranges': 'bytes', 'content-length': '2', 'content-range': 'bytes 0-0/4096' }, bodyLengthBytes: 1 }, 'range_content_length_mismatch'],
    ['malformed Content-Range', { status: 206, headers: { 'accept-ranges': 'bytes', 'content-length': '1', 'content-range': 'items 0-0/4096' }, bodyLengthBytes: 1 }, 'range_content_range_invalid'],
  ])('fails closed for %s and never signs a URL', async (_label, probeResult, errorCode) => {
    const dependencies = makeDependencies();
    vi.mocked(dependencies.rangeProbe.probe).mockResolvedValueOnce({
      requestRange: 'bytes=0-0',
      ...probeResult,
    } as any);

    await expect(issueListeningAssetDeliveryUrl({
      assetId: 'asset-1',
      context: trustedStudentContext,
      now,
      resultScope: {
        resultId: 'result-1',
        versionId: 'version-1',
      },
    }, dependencies)).rejects.toThrow(errorCode);

    expect(dependencies.signer.createAuthorizedUrl).not.toHaveBeenCalled();
  });

  it('refreshes only below the 10-minute threshold and preserves the previous URL until the new one is ready', async () => {
    const previous: ListeningDeliveryIssuedUrl = {
      assetId: 'asset-1',
      url: 'https://authorized.example/asset-1?exp=previous',
      tokenId: 'token-previous',
      issuedAt: now,
      expiresAt: now + hourMs,
      refreshAfter: now + hourMs - refreshThresholdMs,
      ttlMs: hourMs,
      deliveryReady: true,
      range: {
        requestRange: 'bytes=0-0',
        status: 206,
        acceptRanges: 'bytes',
        contentLength: 1,
        contentRange: 'bytes 0-0/4096',
      },
    };

    const tooEarlyDependencies = makeDependencies();
    await expect(refreshListeningAssetDeliveryUrl({
      previous,
      context: trustedStudentContext,
      now: previous.refreshAfter - 1,
      resultScope: {
        resultId: 'result-1',
        versionId: 'version-1',
      },
    }, tooEarlyDependencies)).rejects.toThrow('refresh_not_due');

    const refreshDependencies = makeDependencies();
    await expect(refreshListeningAssetDeliveryUrl({
      previous,
      context: trustedStudentContext,
      now: previous.refreshAfter,
      resultScope: {
        resultId: 'result-1',
        versionId: 'version-1',
      },
    }, refreshDependencies)).resolves.toMatchObject({
      assetId: 'asset-1',
      issuedAt: previous.refreshAfter,
      expiresAt: previous.refreshAfter + hourMs,
      previousUrlValidUntil: previous.expiresAt,
    });
  });

  it('rejects expired delivery URLs instead of accepting prior signed URLs as authorization', async () => {
    const delivery: ListeningDeliveryIssuedUrl = {
      assetId: 'asset-1',
      url: 'https://authorized.example/asset-1?exp=expired',
      tokenId: 'token-expired',
      issuedAt: now,
      expiresAt: now + hourMs,
      refreshAfter: now + hourMs - refreshThresholdMs,
      ttlMs: hourMs,
      deliveryReady: true,
      range: {
        requestRange: 'bytes=0-0',
        status: 206,
        acceptRanges: 'bytes',
        contentLength: 1,
        contentRange: 'bytes 0-0/4096',
      },
    };

    expect(() => assertListeningDeliveryUrlUsable(delivery, now + hourMs - 1)).not.toThrow();
    expect(() => assertListeningDeliveryUrlUsable(delivery, now + hourMs)).toThrow('delivery_url_expired');
  });
});
