const BASE64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

const encodeLengthDelimited = (parts: readonly string[]): Uint8Array => {
  const encoded = parts.map((part) => new TextEncoder().encode(part));
  const totalLength = encoded.reduce((total, value) => total + 4 + value.byteLength, 0);
  const output = new Uint8Array(totalLength);
  const view = new DataView(output.buffer);
  let offset = 0;

  encoded.forEach((value) => {
    view.setUint32(offset, value.byteLength);
    offset += 4;
    output.set(value, offset);
    offset += value.byteLength;
  });

  return output;
};

const base64Url = (bytes: Uint8Array): string => {
  let output = '';
  for (let index = 0; index < bytes.length; index += 3) {
    const first = bytes[index] ?? 0;
    const second = bytes[index + 1];
    const third = bytes[index + 2];
    const block = (first << 16) | ((second ?? 0) << 8) | (third ?? 0);
    output += BASE64[(block >>> 18) & 63];
    output += BASE64[(block >>> 12) & 63];
    output += second === undefined ? '=' : BASE64[(block >>> 6) & 63];
    output += third === undefined ? '=' : BASE64[block & 63];
  }

  return output.replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
};

const digest = async (domain: string, parts: readonly string[]): Promise<string> => {
  const bytes = await crypto.subtle.digest(
    'SHA-256',
    encodeLengthDelimited([domain, ...parts]) as unknown as BufferSource,
  );
  return base64Url(new Uint8Array(bytes));
};

const stable = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) =>
      `${JSON.stringify(key)}:${stable(record[key])}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'undefined';
};

export const PUBLIC_BOOK_CANONICAL_FORK_ID_DOMAINS = Object.freeze({
  activityId: 'public-book-fork/activity-id/v1',
  activityVersionId: 'public-book-fork/activity-version-id/v1',
});

export const createPublicBookCanonicalForkIds = async (input: {
  readonly actorId: string;
  readonly operationId: string;
}): Promise<{
  readonly activityId: string;
  readonly activityVersionId: string;
}> => {
  const parts = [input.actorId, input.operationId] as const;
  const [activityDigest, versionDigest] = await Promise.all([
    digest(PUBLIC_BOOK_CANONICAL_FORK_ID_DOMAINS.activityId, parts),
    digest(PUBLIC_BOOK_CANONICAL_FORK_ID_DOMAINS.activityVersionId, parts),
  ]);
  return {
    activityId: `fork-${activityDigest}`,
    activityVersionId: `fork-version-${versionDigest}`,
  };
};

export const createPublicBookCanonicalForkFingerprint = async (
  domain: string,
  value: unknown,
): Promise<string> => `sha256:${await digest(domain, [stable(value)])}`;

export const encodePublicBookCanonicalForkParts = encodeLengthDelimited;
