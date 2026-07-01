import type {
  ListeningAuthoringDocumentV1,
  ListeningAuthoringIssue,
} from '../types/listeningAuthoring.types';

type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

interface ListeningPublishReadinessAuthoritySection {
  readonly number: number;
  readonly assetId?: string;
  readonly uploadSessionId?: string;
}

interface ListeningAuthoringAssetProbe {
  readonly status: 'ready';
  readonly range: {
    readonly requestRange: 'bytes=0-0';
    readonly status: 206;
    readonly acceptRanges: 'bytes';
    readonly contentLength: number;
    readonly contentRange: string;
  };
}

export type ListeningPublishReadinessResult =
  | {
      readonly status: 'ready';
      readonly blockers: readonly [];
      readonly checkedSections: number;
    }
  | {
      readonly status: 'blocked';
      readonly blockers: readonly ListeningAuthoringIssue[];
      readonly checkedSections: number;
    };

interface ListeningPublishReadinessDependencies {
  readonly fetchImpl?: FetchLike;
  readonly authoritySections?: readonly ListeningPublishReadinessAuthoritySection[];
  readonly probeListeningAuthoringAsset?: (input: {
    readonly uploadSessionId: string;
    readonly assetId: string;
  }) => Promise<ListeningAuthoringAssetProbe>;
}

const deliveryUrlForSection = (
  section: ListeningAuthoringDocumentV1['audioSections'][number],
): string => section.streamUrl?.trim() || section.audioUrl.trim();

const hasValidByteRange = (response: Response): boolean => {
  if (response.status !== 206) return false;

  const acceptRanges = response.headers.get('accept-ranges')?.toLowerCase();
  const contentRange = response.headers.get('content-range')?.toLowerCase();

  return acceptRanges === 'bytes' || /^bytes\s+0-0\/[1-9]\d*$/.test(contentRange ?? '');
};

const blocker = (
  sectionNumber: number,
  field: string,
  guidance: string,
): ListeningAuthoringIssue => ({
  sectionNumber,
  field,
  severity: 'blocker',
  guidance,
});

const trustedAuthorityForSection = (
  section: ListeningAuthoringDocumentV1['audioSections'][number],
  authoritySections: readonly ListeningPublishReadinessAuthoritySection[] | undefined,
): ListeningPublishReadinessAuthoritySection | undefined =>
  authoritySections?.find((candidate) =>
    candidate.number === section.number
    && candidate.assetId === section.assetId
    && Boolean(candidate.uploadSessionId),
  );

const probeTrustedAuthoringAsset = async (
  section: ListeningAuthoringDocumentV1['audioSections'][number],
  dependencies: ListeningPublishReadinessDependencies,
): Promise<ListeningAuthoringIssue | null | undefined> => {
  const authority = trustedAuthorityForSection(section, dependencies.authoritySections);
  if (!section.assetId || !authority?.uploadSessionId || !dependencies.probeListeningAuthoringAsset) {
    return undefined;
  }

  try {
    const result = await dependencies.probeListeningAuthoringAsset({
      uploadSessionId: authority.uploadSessionId,
      assetId: section.assetId,
    });
    if (
      result.status === 'ready'
      && result.range.status === 206
      && result.range.acceptRanges === 'bytes'
      && result.range.contentLength === 1
      && /^bytes\s+0-0\/[1-9]\d*$/.test(result.range.contentRange)
    ) {
      return null;
    }
    return blocker(
      section.number,
      'byteRange',
      'Audio delivery must support byte-range playback. Re-upload or wait for asset delivery before publishing.',
    );
  } catch {
    return blocker(
      section.number,
      'audioUrl',
      'Audio delivery path is not reachable. Re-upload the audio before publishing.',
    );
  }
};

export async function validateListeningPublishReadiness(
  document: ListeningAuthoringDocumentV1,
  dependencies: ListeningPublishReadinessDependencies = {},
): Promise<ListeningPublishReadinessResult> {
  const blockers: ListeningAuthoringIssue[] = [];
  const fetchImpl = dependencies.fetchImpl ?? globalThis.fetch?.bind(globalThis);

  for (const section of document.audioSections) {
    if (!section.assetId?.trim()) {
      blockers.push(blocker(
        section.number,
        'assetId',
        'Publish requires a canonical audio asset reference for every section.',
      ));
      continue;
    }

    const deliveryUrl = deliveryUrlForSection(section);
    if (!deliveryUrl) {
      blockers.push(blocker(
        section.number,
        'audioUrl',
        'Publish requires a reachable audio delivery path for every section.',
      ));
      continue;
    }

    const trustedProbeBlocker = await probeTrustedAuthoringAsset(section, dependencies);
    if (trustedProbeBlocker === null) continue;
    if (trustedProbeBlocker) {
      blockers.push(trustedProbeBlocker);
      continue;
    }

    if (!fetchImpl) {
      blockers.push(blocker(
        section.number,
        'byteRange',
        'Audio delivery could not be checked in this browser. Try again before publishing.',
      ));
      continue;
    }

    try {
      const response = await fetchImpl(deliveryUrl, {
        method: 'GET',
        headers: { Range: 'bytes=0-0' },
      });

      if (!hasValidByteRange(response)) {
        blockers.push(blocker(
          section.number,
          'byteRange',
          'Audio delivery must support byte-range playback. Re-upload or wait for asset delivery before publishing.',
        ));
      }
    } catch {
      blockers.push(blocker(
        section.number,
        'audioUrl',
        'Audio delivery path is not reachable. Re-upload the audio before publishing.',
      ));
    }
  }

  if (blockers.length > 0) {
    return {
      status: 'blocked',
      blockers,
      checkedSections: document.audioSections.length,
    };
  }

  return {
    status: 'ready',
    blockers: [],
    checkedSections: document.audioSections.length,
  };
}
