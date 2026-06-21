import { describe, expect, it } from 'vitest';
import {
  createCanonicalUploadPath,
  deriveCanonicalMove,
  generateNonce,
  parseLegacyUploadHint,
  validateCanonicalUploadKey,
} from '../src/upload-worker/path-authority.js';

const UID = 'owner-a';
const NONCE = '00112233445566778899aabbccddeeff';

describe('upload-worker path authority', () => {
  it.each([
    ['listening_audio_temp', 'temp/listening-audio/owner-a/00112233445566778899aabbccddeeff-lesson-one.mp3'],
    ['test_audio_temp', 'temp/audio/owner-a/00112233445566778899aabbccddeeff-lesson-one.mp3'],
    ['test_image_temp', 'temp/images/owner-a/00112233445566778899aabbccddeeff-lesson-one.mp3'],
    ['avatar_permanent', 'avatars/owner-a/avatar'],
    ['announcement_attachment_permanent', 'announcements/owner-a/00112233445566778899aabbccddeeff-lesson-one.mp3'],
    ['book_cover_permanent', 'book-covers/owner-a/00112233445566778899aabbccddeeff-lesson-one.mp3'],
  ])('maps %s to its canonical prefix', (operationKind, expectedKey) => {
    expect(
      createCanonicalUploadPath({
        operationKind,
        uid: UID,
        nonce: NONCE,
        fileName: 'Lesson One.MP3',
      }),
    ).toEqual({
      key: expectedKey,
      operationKind,
      allowsOverwrite: operationKind === 'avatar_permanent',
    });
  });

  it('rejects unknown operation kinds', () => {
    expect(() =>
      createCanonicalUploadPath({
        operationKind: 'private_audio',
        uid: UID,
        nonce: NONCE,
        fileName: 'lesson.mp3',
      }),
    ).toThrow('unsupported_operation_kind');
  });

  it.each([
    ['', 'empty_file_name'],
    ['../private.mp3', 'path_traversal'],
    ['%2e%2e%2fprivate.mp3', 'path_traversal'],
    ['%252e%252e%252fprivate.mp3', 'path_traversal'],
    ['folder/file.mp3', 'path_separator'],
    ['folder\\file.mp3', 'path_separator'],
    ['folder//file.mp3', 'duplicate_separator'],
    ['https://example.test/file.mp3', 'absolute_url'],
    ['C:\\file.mp3', 'absolute_path'],
    ["bad\u0000name.mp3", 'control_character'],
  ])('rejects unsafe fileName %j', (fileName, reason) => {
    expect(() =>
      createCanonicalUploadPath({
        operationKind: 'test_audio_temp',
        uid: UID,
        nonce: NONCE,
        fileName,
      }),
    ).toThrow(reason);
  });

  it.each([
    'assessment-assets/owner-a/file.mp3',
    'reading_v2/owner-a/file.mp3',
    'backups/owner-a/file.mp3',
    'private/owner-a/file.mp3',
    'media_assets/owner-a/file.mp3',
    'unlisted/owner-a/file.mp3',
  ])('rejects forbidden or unlisted legacy prefix %s', (filename) => {
    expect(() => parseLegacyUploadHint({ filename, uid: UID })).toThrow(
      'unsupported_prefix',
    );
  });

  it('accepts an allowed legacy hint but derives only operation kind and basename', () => {
    expect(
      parseLegacyUploadHint({
        filename: 'temp/listening-audio/owner-a/Legacy Name.MP3',
        uid: UID,
      }),
    ).toEqual({
      operationKind: 'listening_audio_temp',
      fileName: 'Legacy Name.MP3',
    });
  });

  it('accepts a legacy temp hint without owner and injects no browser identity', () => {
    expect(
      parseLegacyUploadHint({
        filename: 'temp/audio/Legacy Name.MP3',
        uid: UID,
      }),
    ).toEqual({
      operationKind: 'test_audio_temp',
      fileName: 'Legacy Name.MP3',
    });
  });

  it('rejects cross-owner canonical upload keys', () => {
    expect(
      validateCanonicalUploadKey({
        key: `temp/audio/owner-b/${NONCE}-lesson.mp3`,
        uid: UID,
      }),
    ).toEqual({ valid: false, reason: 'owner_mismatch' });
  });

  it.each([
    [
      `temp/audio/${UID}/${NONCE}-lesson.mp3`,
      `images/${UID}/${NONCE}-lesson.mp3`,
      'destination_mismatch',
    ],
    [
      `temp/audio/${UID}/${NONCE}-lesson.mp3`,
      `audio/${UID}/${NONCE}-different.mp3`,
      'destination_mismatch',
    ],
    [
      `temp/audio/owner-b/${NONCE}-lesson.mp3`,
      `audio/owner-b/${NONCE}-lesson.mp3`,
      'owner_mismatch',
    ],
    [
      `audio/${UID}/${NONCE}-lesson.mp3`,
      `audio/${UID}/${NONCE}-lesson.mp3`,
      'source_not_temporary',
    ],
  ])('rejects noncanonical movement', (sourceKey, destKey, reason) => {
    expect(() => deriveCanonicalMove({ sourceKey, destKey, uid: UID })).toThrow(
      reason,
    );
  });

  it('derives exact same-family temp-to-durable movement', () => {
    const sourceKey = `temp/listening-audio/${UID}/${NONCE}-lesson.mp3`;
    expect(
      deriveCanonicalMove({
        sourceKey,
        destKey: sourceKey.slice('temp/'.length),
        uid: UID,
      }),
    ).toEqual({
      sourceKey,
      destKey: `listening-audio/${UID}/${NONCE}-lesson.mp3`,
    });
  });

  it('generates nonce bytes through Web Crypto', () => {
    const crypto = {
      getRandomValues(bytes) {
        bytes.set([
          0, 1, 2, 3, 4, 5, 6, 7,
          8, 9, 10, 11, 12, 13, 14, 15,
        ]);
        return bytes;
      },
    };

    expect(generateNonce(crypto)).toBe('000102030405060708090a0b0c0d0e0f');
  });
});
