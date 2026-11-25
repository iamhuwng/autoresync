import {
  SourceProviderError,
  type SourceProviderPort,
} from '../../../src/services/book-source-delivery/sourceProvider.port.ts';
import {
  resolveBackblazeB2ProviderWiring,
} from './backblaze-b2-provider-wiring.ts';
import type { BackblazeB2SourceProviderConfig } from './backblaze-b2-source-provider.ts';
import {
  OCI_S3_PROVIDER_KIND,
  createOciS3SourceProviderFromEnv,
  type OciS3SourceProviderConfig,
} from './oci-s3-source-provider.ts';

export const SUPPORTED_BOOK_SOURCE_PROVIDER_KINDS = Object.freeze([
  'backblaze-b2-s3',
  OCI_S3_PROVIDER_KIND,
] as const);

export type SupportedBookSourceProviderKind = (typeof SUPPORTED_BOOK_SOURCE_PROVIDER_KINDS)[number];
export type BookDocumentProviderTag = 'b2' | 'oci';

export const isSupportedBookSourceProviderKind = (
  value: string,
): value is SupportedBookSourceProviderKind =>
  value === 'backblaze-b2-s3' || value === OCI_S3_PROVIDER_KIND;

export const bookDocumentProviderTagForKind = (providerKind: string): BookDocumentProviderTag =>
  providerKind === OCI_S3_PROVIDER_KIND ? 'oci' : 'b2';

export type BookSourceRuntimeProvider = Pick<SourceProviderPort,
  | 'authorizeUpload'
  | 'resolveCompletedObject'
  | 'verifyCompletedObject'
  | 'readObjectMetadata'
  | 'readAccountTotalsPage'
  | 'readBounded'
>;

export type BookSourceProviderWiring =
  | {
      readonly state: 'disabled';
      readonly provider: null;
    }
  | {
      readonly state: 'enabled';
      readonly provider: BookSourceRuntimeProvider;
      readonly providerKind: SupportedBookSourceProviderKind;
      readonly providerTag: BookDocumentProviderTag;
      readonly storageLocationId: string;
      readonly privateBucketId: string;
      readonly privateBucketName: string;
      readonly objectKeyPrefix: string;
    };

const requiredEnvString = (env: Record<string, unknown>, name: string): string => {
  const value = env[name];
  if (typeof value !== 'string' || !value.trim()) {
    throw new SourceProviderError('metadata_mismatch', false);
  }
  return value.trim();
};

export const resolveBookSourceProviderWiring = (
  env: Record<string, unknown>,
  options: Pick<BackblazeB2SourceProviderConfig & OciS3SourceProviderConfig, 'fetch' | 'now' | 'maxReadBytes'> = {},
): BookSourceProviderWiring => {
  const ociState = env.BOOK_SOURCE_OCI_PROVIDER_STATE;
  const b2State = env.BOOK_SOURCE_B2_PROVIDER_STATE;

  if (ociState !== undefined && ociState !== 'disabled' && ociState !== 'enabled') {
    throw new SourceProviderError('metadata_mismatch', false);
  }
  if (ociState === 'enabled' && b2State === 'enabled') {
    throw new SourceProviderError('metadata_mismatch', false);
  }

  if (ociState === 'enabled') {
    const provider = createOciS3SourceProviderFromEnv(env, options);
    const privateBucketName = requiredEnvString(env, 'BOOK_SOURCE_OCI_PRIVATE_BUCKET_NAME');
    return Object.freeze({
      state: 'enabled',
      provider,
      providerKind: OCI_S3_PROVIDER_KIND,
      providerTag: 'oci',
      storageLocationId: requiredEnvString(env, 'BOOK_SOURCE_OCI_STORAGE_LOCATION_ID'),
      privateBucketId: privateBucketName,
      privateBucketName,
      objectKeyPrefix: requiredEnvString(env, 'BOOK_SOURCE_OCI_OBJECT_KEY_PREFIX'),
    });
  }

  const b2Wiring = resolveBackblazeB2ProviderWiring(env, options);
  if (b2Wiring.state === 'disabled' || !b2Wiring.provider) {
    return Object.freeze({ state: 'disabled', provider: null });
  }
  return Object.freeze({
    state: 'enabled',
    provider: b2Wiring.provider,
    providerKind: 'backblaze-b2-s3',
    providerTag: 'b2',
    storageLocationId: requiredEnvString(env, 'BOOK_SOURCE_B2_STORAGE_LOCATION_ID'),
    privateBucketId: requiredEnvString(env, 'BOOK_SOURCE_B2_PRIVATE_BUCKET_ID'),
    privateBucketName: requiredEnvString(env, 'BOOK_SOURCE_B2_PRIVATE_BUCKET_NAME'),
    objectKeyPrefix: typeof env.BOOK_SOURCE_B2_OBJECT_KEY_PREFIX === 'string' && env.BOOK_SOURCE_B2_OBJECT_KEY_PREFIX.trim()
      ? env.BOOK_SOURCE_B2_OBJECT_KEY_PREFIX.trim()
      : 'book-source/',
  });
};
