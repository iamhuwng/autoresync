import React, { useEffect, useMemo, useState } from 'react';
import {
  DEFAULT_MATERIAL_TEST_TYPES,
  sortMaterialTestTypesByDisplayOrder,
} from '../../services/materialCatalog/testTypeConfig.service';
import { savePinnedTestTypesForTeacher } from '../../services/materialCatalog/teacherTestTypePreferences.service';
import { Button } from './Button';
import './TestTypePreferenceModal.css';

const EXPECTED_PINNED_LIMIT = 4;

const isActiveTeacherSelectable = (testType) =>
  testType?.active !== false && testType?.teacherSelectable !== false;

const toId = (value) => String(value ?? '');

const getDefaultPinnedIds = (activeTestTypes) =>
  [...activeTestTypes]
    .sort((left, right) => {
      const leftRank = Number.isFinite(left.defaultPinnedRank)
        ? left.defaultPinnedRank
        : Number.MAX_SAFE_INTEGER;
      const rightRank = Number.isFinite(right.defaultPinnedRank)
        ? right.defaultPinnedRank
        : Number.MAX_SAFE_INTEGER;

      return (
        leftRank - rightRank ||
        left.displayOrder - right.displayOrder ||
        left.label.localeCompare(right.label)
      );
    })
    .map((testType) => toId(testType.testTypeId));

const resolveInitialSelection = (pinnedTestTypeIds, activeTestTypes, expectedCount) => {
  const selected = Array.isArray(pinnedTestTypeIds)
    ? pinnedTestTypeIds.map(toId).slice(0, expectedCount)
    : [];

  getDefaultPinnedIds(activeTestTypes).forEach((id) => {
    if (selected.length < expectedCount && !selected.includes(id)) {
      selected.push(id);
    }
  });

  activeTestTypes.forEach((testType) => {
    const id = toId(testType.testTypeId);
    if (selected.length < expectedCount && !selected.includes(id)) {
      selected.push(id);
    }
  });

  return selected;
};

const moveItem = (items, fromIndex, toIndex) => {
  if (toIndex < 0 || toIndex >= items.length) {
    return items;
  }

  const next = [...items];
  const [item] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, item);
  return next;
};

const TestTypePreferenceModal = ({
  opened,
  teacherId,
  context,
  testTypes = DEFAULT_MATERIAL_TEST_TYPES,
  pinnedTestTypeIds,
  preferenceRepository,
  onClose,
  onSaved,
  onTrackAction,
}) => {
  const allById = useMemo(
    () => new Map((testTypes ?? []).map((testType) => [toId(testType.testTypeId), testType])),
    [testTypes],
  );
  const activeTestTypes = useMemo(
    () => sortMaterialTestTypesByDisplayOrder((testTypes ?? []).filter(isActiveTeacherSelectable)),
    [testTypes],
  );
  const activeById = useMemo(
    () => new Map(activeTestTypes.map((testType) => [toId(testType.testTypeId), testType])),
    [activeTestTypes],
  );
  const expectedCount = Math.min(EXPECTED_PINNED_LIMIT, activeTestTypes.length);
  const [selectedIds, setSelectedIds] = useState([]);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  useEffect(() => {
    if (!opened) {
      return;
    }

    setSelectedIds(resolveInitialSelection(pinnedTestTypeIds, activeTestTypes, expectedCount));
    setSaveError('');
    onTrackAction?.('openTestTypePreferenceModal', undefined);
  }, [activeTestTypes, expectedCount, onTrackAction, opened, pinnedTestTypeIds]);

  if (!opened) {
    return null;
  }

  const unavailableSelections = selectedIds
    .map((id) => allById.get(id))
    .filter((testType) => testType && !activeById.has(toId(testType.testTypeId)));
  const hasDuplicateSelections = new Set(selectedIds).size !== selectedIds.length;
  const hasWrongCount = selectedIds.length !== expectedCount;
  const unavailableMessage = unavailableSelections.length > 0
    ? `${unavailableSelections.map((testType) => testType.label).join(', ')} is unavailable. Replace before saving.`
    : '';
  const validationMessage =
    unavailableMessage ||
    (hasDuplicateSelections ? 'Choose each Test Type once.' : '') ||
    (hasWrongCount ? `Choose exactly ${expectedCount} Test Types.` : '');
  const canSave =
    Boolean(teacherId) &&
    Boolean(context?.uid) &&
    Boolean(preferenceRepository) &&
    expectedCount > 0 &&
    !validationMessage &&
    !saving;

  const handleSelect = (index, nextId) => {
    setSelectedIds((current) => current.map((id, currentIndex) => (currentIndex === index ? nextId : id)));
    setSaveError('');
  };

  const handleCancel = () => {
    onTrackAction?.('cancelTestTypePreferenceModal', undefined);
    onClose?.();
  };

  const handleSave = async () => {
    if (!canSave) {
      return;
    }

    setSaving(true);
    setSaveError('');

    try {
      const preference = await savePinnedTestTypesForTeacher(teacherId, selectedIds, context, {
        activeTestTypes,
        preferenceRepository,
      });
      onTrackAction?.('saveTestTypePreferences', { pinnedCount: preference.pinnedTestTypeIds.length });
      onSaved?.(preference);
      onClose?.();
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Failed to save Test Type preferences.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="test-type-preference-modal__backdrop">
      <section
        className="test-type-preference-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="test-type-preference-title"
      >
        <header className="test-type-preference-modal__header">
          <div>
            <h2 id="test-type-preference-title">Test Type preferences</h2>
            <p>Choose the Test Type blocks shown under Materials search.</p>
          </div>
          <button
            type="button"
            className="test-type-preference-modal__close"
            aria-label="Close Test Type preferences"
            onClick={handleCancel}
          >
            x
          </button>
        </header>

        {activeTestTypes.length < EXPECTED_PINNED_LIMIT && (
          <p className="test-type-preference-modal__microcopy">
            Only {activeTestTypes.length} active Test Types are available. All available types will be saved.
          </p>
        )}

        <div className="test-type-preference-modal__list">
          {selectedIds.map((selectedId, index) => {
            const selected = allById.get(selectedId);
            const selectedLabel = selected?.label ?? selectedId;
            const isUnavailable = selected && !activeById.has(selectedId);

            return (
              <div
                key={`${selectedId}-${index}`}
                className={`test-type-preference-modal__row${isUnavailable ? ' is-unavailable' : ''}`}
              >
                <span className="test-type-preference-modal__rank">{index + 1}</span>
                <label className="test-type-preference-modal__field">
                  <span>Pinned Test Type {index + 1}</span>
                  <select
                    value={selectedId}
                    aria-label={`Pinned Test Type ${index + 1}`}
                    onChange={(event) => handleSelect(index, event.target.value)}
                  >
                    {isUnavailable && (
                      <option value={selectedId} disabled>
                        {selectedLabel} (unavailable)
                      </option>
                    )}
                    {activeTestTypes.map((testType) => (
                      <option key={testType.testTypeId} value={testType.testTypeId}>
                        {testType.label}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="test-type-preference-modal__moves">
                  <button
                    type="button"
                    onClick={() => setSelectedIds((current) => moveItem(current, index, index - 1))}
                    disabled={index === 0}
                    aria-label={`Move ${selectedLabel} up`}
                  >
                    Up
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedIds((current) => moveItem(current, index, index + 1))}
                    disabled={index === selectedIds.length - 1}
                    aria-label={`Move ${selectedLabel} down`}
                  >
                    Down
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {(validationMessage || saveError) && (
          <p className="test-type-preference-modal__error" role="alert">
            {saveError || validationMessage}
          </p>
        )}

        <footer className="test-type-preference-modal__footer">
          <Button variant="glass" onClick={handleCancel}>
            Cancel
          </Button>
          <Button variant="primary" onClick={handleSave} disabled={!canSave} loading={saving}>
            Save preferences
          </Button>
        </footer>
      </section>
    </div>
  );
};

export default TestTypePreferenceModal;
