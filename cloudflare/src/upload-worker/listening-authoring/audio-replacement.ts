import type { ListeningPublishedVersionRecord } from '../../../../functions/src/listening-authoring/repository.shared.ts';
import type { FirebaseRtdbRestClient } from './rtdb.ts';
import type { ListeningAssetBucket } from './assets.ts';

type Row = Record<string, any>;
type Reader = (path: string) => Promise<unknown>;
const row = (value: unknown): value is Row => Boolean(value && typeof value === 'object' && !Array.isArray(value));
export class ListeningAudioReplacementError extends Error {
  constructor() { super('listening_audio_replacement_invalid'); }
}
const fail = (): never => { throw new ListeningAudioReplacementError(); };
const key = (value: unknown): value is string => typeof value === 'string' && /^[A-Za-z0-9_-]{1,160}$/u.test(value);
const section = (version: Row, number: number): Row | undefined =>
  version.document?.audioSections?.find((audio: Row) => audio.number === number);
const validVersion = (version: unknown, testId: string, ownerId: string): version is Row => row(version)
  && version.recordType === 'published-version' && version.testId === testId && version.ownerId === ownerId
  && Array.isArray(version.document?.audioSections);

export interface ListeningAudioReplacement {
  assetId: string;
  testId: string;
  sectionNumber: number;
  sourceVersionId: string;
  targetVersionId: string;
  replacedAt: number;
  cleanupCompletedAt?: number;
}

export interface ResolvedListeningAudio {
  original: Row;
  physical: Row;
  audioReplaced?: true;
  audioReplacedAt?: number;
}

export async function readListeningAudioReplacementWarning(read: Reader, version: Row): Promise<{ audioReplaced?: true; audioReplacedAt?: number }> {
  const replaced = await Promise.all((version.document?.audioSections ?? []).map(async (audio: Row) => {
    const asset = audio.assetId ? await read(`media_assets/${audio.assetId}`) : null;
    return row(asset) && asset.replacement?.testId === version.testId
      && asset.replacement.sectionNumber === audio.number ? Number(asset.replacement.replacedAt) : 0;
  }));
  const at = Math.max(0, ...replaced);
  return at ? { audioReplaced: true, audioReplacedAt: at } : {};
}

export function assertListeningPhysicalAsset(asset: unknown, assetId: string, ownerId: string): asserts asset is Row {
  if (!key(assetId) || !key(ownerId) || !row(asset) || !key(asset.uploadSessionId)
    || asset.assetId !== assetId || asset.canonicalAssetId !== assetId || asset.ownerId !== ownerId
    || asset.state !== 'committed' || !Number.isSafeInteger(asset.sizeBytes) || asset.sizeBytes <= 0
    || typeof asset.checksum !== 'string' || !/^[a-f0-9]{64}$/u.test(asset.checksum)
    || typeof asset.contentType !== 'string' || !asset.contentType.startsWith('audio/')) fail();
  const prefix = `temp/listening/${ownerId}/${asset.uploadSessionId}/${assetId}-`;
  const fileName = typeof asset.tempKey === 'string' && asset.tempKey.startsWith(prefix) ? asset.tempKey.slice(prefix.length) : '';
  if (!fileName || /[\\/]|\.\./u.test(fileName)
    || asset.durableKey !== `assessment-assets/listening/${ownerId}/${assetId}/${fileName}`) fail();
}

/** Original logical identity retains authorization; current section selects physical bytes. */
export async function resolveListeningAudioReplacement(read: Reader, assetId: string, existing?: unknown): Promise<ResolvedListeningAudio | null> {
  const original = existing ?? await read(`media_assets/${assetId}`);
  if (!row(original)) return null;
  if (!original.replacement) return { original, physical: original };
  assertListeningPhysicalAsset(original, assetId, original.ownerId);
  const receipt = original.replacement as ListeningAudioReplacement;
  if (!row(receipt) || original.assetId !== assetId || !Number.isSafeInteger(receipt.sectionNumber)
    || receipt.sectionNumber < 1 || !Number.isSafeInteger(receipt.replacedAt) || !key(receipt.testId)
    || !key(receipt.sourceVersionId) || !key(receipt.targetVersionId) || !key(receipt.assetId) || receipt.assetId === assetId) fail();
  const [source, runtime] = await Promise.all([
    read(`listening_authoring/versions/${receipt.sourceVersionId}`), read(`tests/${receipt.testId}`),
  ]);
  if (!validVersion(source, receipt.testId, original.ownerId) || source.versionId !== receipt.sourceVersionId
    || source.assetIds?.[assetId] !== true || section(source, receipt.sectionNumber)?.assetId !== assetId
    || original.references?.versions?.[source.versionId] !== true || !row(runtime) || runtime.ownerId !== original.ownerId) fail();
  const targetVersionId = runtime.versionId;
  if (!key(targetVersionId)) fail();
  const target = await read(`listening_authoring/versions/${targetVersionId}`);
  if (!validVersion(target, receipt.testId, original.ownerId) || target.versionId !== targetVersionId) fail();
  const firstTarget = receipt.targetVersionId === targetVersionId ? target
    : await read(`listening_authoring/versions/${receipt.targetVersionId}`);
  if (!validVersion(firstTarget, receipt.testId, original.ownerId) || firstTarget.versionId !== receipt.targetVersionId
    || section(firstTarget, receipt.sectionNumber)?.assetId !== receipt.assetId) fail();
  const targetAssetId = section(target, receipt.sectionNumber)?.assetId;
  if (!targetAssetId || targetAssetId === assetId || target.assetIds?.[targetAssetId] !== true) fail();
  const physical = await read(`media_assets/${targetAssetId}`);
  assertListeningPhysicalAsset(physical, targetAssetId, original.ownerId);
  if (physical.replacement || physical.references?.versions?.[target.versionId] !== true) fail();
  return { original, physical, audioReplaced: true, audioReplacedAt: receipt.replacedAt };
}

/** Called after publication projections commit; explicit versions also form the bounded recovery seam. */
export async function replaceListeningPublishedAudio(input: {
  rtdb: FirebaseRtdbRestClient;
  bucket?: ListeningAssetBucket;
  previous: ListeningPublishedVersionRecord;
  current: ListeningPublishedVersionRecord;
  versions: Record<string, ListeningPublishedVersionRecord>;
  verify: (asset: Row) => Promise<void>;
  now: number;
}): Promise<void> {
  const { previous, current, rtdb } = input;
  if (previous.testId !== current.testId || previous.ownerId !== current.ownerId
    || current.versionNumber <= previous.versionNumber || current.archive.state !== 'active') fail();
  const replacements = previous.document.audioSections.flatMap(old => {
    const next = current.document.audioSections.find(audio => audio.number === old.number);
    return old.assetId && next?.assetId && old.assetId !== next.assetId ? [{ old, next }] : [];
  });
  if (!replacements.length) return;
  if (!input.bucket) fail();
  const pending: { original: Row; receipt: ListeningAudioReplacement }[] = [];
  for (const { old, next } of replacements) {
    const [original, physical] = await Promise.all([
      rtdb.readValue(`media_assets/${old.assetId}`), rtdb.readValue(`media_assets/${next.assetId}`),
    ]);
    assertListeningPhysicalAsset(original, old.assetId!, current.ownerId);
    assertListeningPhysicalAsset(physical, next.assetId!, current.ownerId);
    if (physical.replacement || physical.references?.versions?.[current.versionId] !== true
      || original.references?.versions?.[previous.versionId] !== true
      || previous.assetIds[old.assetId!] !== true || current.assetIds[next.assetId!] !== true) fail();
    // Cross-test/section reuse needs a distinct mapping; never delete ambiguous shared bytes.
    if (Object.keys(original.references?.tests ?? {}).some(id => id !== current.testId)
      || Object.keys(original.references?.versions ?? {}).some(id => {
        const version = input.versions[id];
        return !validVersion(version, current.testId, current.ownerId)
          || version.document.audioSections.some(audio => audio.assetId === old.assetId && audio.number !== old.number);
      }) || Object.values(input.versions).some(version => version.document.audioSections.some(audio =>
        audio.assetId === old.assetId && (version.testId !== current.testId || audio.number !== old.number)))) fail();
    await input.verify(physical);
    const existing = original.replacement as ListeningAudioReplacement | undefined;
    if (existing) {
      const source = input.versions[existing.sourceVersionId];
      const target = input.versions[existing.targetVersionId];
      if (existing.testId !== current.testId || existing.sectionNumber !== old.number
        || !validVersion(source, current.testId, current.ownerId) || section(source, old.number)?.assetId !== old.assetId
        || !validVersion(target, current.testId, current.ownerId) || section(target, old.number)?.assetId !== existing.assetId) fail();
    }
    const receipt = existing ?? { assetId: next.assetId!, testId: current.testId, sectionNumber: old.number,
      sourceVersionId: previous.versionId, targetVersionId: current.versionId, replacedAt: input.now };
    if (!receipt.cleanupCompletedAt) pending.push({ original, receipt });
  }
  if (!pending.length) return;
  const runtime = await rtdb.readValue(`tests/${current.testId}`);
  if (!row(runtime) || runtime.versionId !== current.versionId || runtime.ownerId !== current.ownerId
    || pending.some(({ original }) => runtime.audioSections?.some((audio: Row) => audio.assetId === original.assetId))) fail();
  await rtdb.patchAdminMultiLocation(Object.fromEntries(pending.flatMap(({ original, receipt }) => [
    [`media_assets/${original.assetId}/replacement`, receipt], [`media_assets/${original.assetId}/updatedAt`, input.now],
  ]).concat([[`tests/${current.testId}/audioReplacedAt`, input.now]])));
  for (const { original } of pending) {
    await input.bucket!.delete(original.durableKey);
    await input.bucket!.delete(original.tempKey);
    if (await input.bucket!.get(original.durableKey) || await input.bucket!.get(original.tempKey)) {
      throw new Error('listening_audio_replacement_cleanup_pending');
    }
  }
  await rtdb.patchAdminMultiLocation(Object.fromEntries(pending.flatMap(({ original }) => [
    [`media_assets/${original.assetId}/replacement/cleanupCompletedAt`, input.now],
    [`media_assets/${original.assetId}/updatedAt`, input.now],
  ])));
}
