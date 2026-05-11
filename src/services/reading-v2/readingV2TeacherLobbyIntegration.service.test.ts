import { describe, expect, it } from 'vitest';
import { READING_V2_ENGINE } from '../../config/readingV2FeatureFlags';
import {
  resolveReadingV2TeacherLobbyCreateEntry,
  resolveReadingV2TeacherLobbyStudioEntry,
  shouldShowReadingV2TeacherLobbyCreateEntries,
  shouldShowReadingV2TeacherLobbyItem,
} from './readingV2TeacherLobbyIntegration.service';

describe('readingV2TeacherLobbyIntegration.service', () => {
  it('routes Reading V2 material cards to published revision Studio mode', () => {
    expect(
      resolveReadingV2TeacherLobbyStudioEntry(
        {
          id: 'material-card-1',
          deliveryEngine: READING_V2_ENGINE,
        },
        'teacher_lobby_test_card',
      ),
    ).toEqual({
      mode: 'revise-published',
      materialId: 'material-card-1',
      source: 'teacher_lobby_test_card',
    });
  });

  it('routes Reading V2 draft cards to draft resume Studio mode', () => {
    expect(
      resolveReadingV2TeacherLobbyStudioEntry(
        {
          draftId: 'draft-1',
          engine: READING_V2_ENGINE,
        },
        'teacher_lobby_draft_card',
      ),
    ).toEqual({
      mode: 'resume-draft',
      draftId: 'draft-1',
      source: 'teacher_lobby_draft_card',
    });
  });

  it('gates Teacher Lobby Reading V2 create and import entries through rollout mode', () => {
    expect(shouldShowReadingV2TeacherLobbyCreateEntries({ rolloutMode: 'off' })).toBe(false);
    expect(resolveReadingV2TeacherLobbyCreateEntry('blank', { rolloutMode: 'off' })).toBeNull();
    expect(resolveReadingV2TeacherLobbyCreateEntry('blank', { rolloutMode: 'teacher-preview' })).toEqual({
      mode: 'create-blank',
      source: 'teacher_lobby_create_button',
    });
    expect(resolveReadingV2TeacherLobbyCreateEntry('import', { rolloutMode: 'teacher-preview' })).toEqual({
      mode: 'create-from-import',
      source: 'teacher_lobby_import_button',
    });
  });


  it('hides standalone passage assets from Teacher Lobby while the visibility flag is default hidden', () => {
    expect(
      shouldShowReadingV2TeacherLobbyItem({
        id: 'passage-asset-1',
        deliveryEngine: READING_V2_ENGINE,
        materialKind: 'passage-asset',
      }),
    ).toBe(false);

    expect(
      resolveReadingV2TeacherLobbyStudioEntry(
        {
          id: 'passage-asset-1',
          deliveryEngine: READING_V2_ENGINE,
          materialKind: 'passage-asset',
        },
        'teacher_lobby_test_card',
      ),
    ).toBeNull();

    expect(
      shouldShowReadingV2TeacherLobbyItem(
        {
          id: 'passage-asset-1',
          deliveryEngine: READING_V2_ENGINE,
          materialKind: 'passage-asset',
        },
        { passageAssetLobbyVisibility: 'opt-in' },
      ),
    ).toBe(true);

    expect(
      resolveReadingV2TeacherLobbyStudioEntry(
        {
          id: 'passage-asset-1',
          deliveryEngine: READING_V2_ENGINE,
          materialKind: 'passage-asset',
        },
        'teacher_lobby_test_card',
        { passageAssetLobbyVisibility: 'opt-in' },
      ),
    ).toEqual({
      mode: 'revise-published',
      materialId: 'passage-asset-1',
      source: 'teacher_lobby_test_card',
    });
  });

  it('leaves legacy IELTS, Writing, and THCS cards on existing lobby behavior', () => {
    expect(
      resolveReadingV2TeacherLobbyStudioEntry(
        { id: 'ielts-reading-1', testType: 'IELTS', skill: 'Reading' },
        'teacher_lobby_test_card',
      ),
    ).toBeNull();
    expect(
      resolveReadingV2TeacherLobbyStudioEntry(
        { id: 'writing-1', testType: 'IELTS', skill: 'Writing' },
        'teacher_lobby_test_card',
      ),
    ).toBeNull();
    expect(
      resolveReadingV2TeacherLobbyStudioEntry(
        { id: 'thcs-1', testType: 'THCS-THPT' },
        'teacher_lobby_test_card',
      ),
    ).toBeNull();
  });
});
