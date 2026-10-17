export interface ListeningUploadAssetRecord {
  assetId: string;
  fileName: string;
  sanitizedFileName: string;
  declaredMimeType: string;
  sizeBytes: number;
  tempKey: string;
  issuedAt: number;
  grantExpiresAt: number;
}

export interface ListeningUploadSessionRecord {
  schemaVersion: 1;
  ownerId: string;
  uploadSessionId: string;
  purpose: 'listening-authoring';
  status: 'active';
  creationRequestIdHash: string;
  draftId?: string;
  testId?: string;
  revisionId?: string;
  createdAt: number;
  createdBy: string;
  expiresAt: number;
  maxEligibilityExpiresAt: number;
  lastGrantIssuedAt?: number;
  assetIds: Record<string, true>;
  assetRequests: Record<string, ListeningUploadAssetRecord>;
  bridgeVersion: '0056A-v1';
}

export interface ListeningUploadSessionRepository {
  findByCreationRequest(ownerId: string, creationRequestIdHash: string): Promise<ListeningUploadSessionRecord | null>;
  create(record: ListeningUploadSessionRecord): Promise<ListeningUploadSessionRecord>;
  get(ownerId: string, uploadSessionId: string): Promise<ListeningUploadSessionRecord | null>;
  issueAsset(input: {
    ownerId: string;
    uploadSessionId: string;
    assetRequestIdHash: string;
    asset: ListeningUploadAssetRecord;
  }): Promise<{ session: ListeningUploadSessionRecord; asset: ListeningUploadAssetRecord } | null>;
}
