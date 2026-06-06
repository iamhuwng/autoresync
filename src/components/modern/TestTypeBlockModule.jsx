import React, { useMemo } from 'react';
import { DEFAULT_MATERIAL_TEST_TYPES } from '../../services/materialCatalog/testTypeConfig.service';
import { SettingsIcon } from './icons.jsx';
import './TestTypeBlockModule.css';

const MAX_TEST_TYPE_BLOCKS = 4;

const isActiveTeacherType = (testType) =>
  testType?.active !== false && testType?.teacherSelectable !== false;

const hasPinnedPreferences = (pinnedTestTypeIds) =>
  Array.isArray(pinnedTestTypeIds) && pinnedTestTypeIds.length > 0;

export const resolveVisibleTestTypeBlocks = ({
  testTypes = DEFAULT_MATERIAL_TEST_TYPES,
  pinnedTestTypeIds,
  maxBlocks = MAX_TEST_TYPE_BLOCKS,
} = {}) => {
  const activeTypes = (testTypes ?? []).filter(isActiveTeacherType);
  const byId = new Map(activeTypes.map((testType) => [String(testType.testTypeId), testType]));

  if (hasPinnedPreferences(pinnedTestTypeIds)) {
    const seen = new Set();
    return pinnedTestTypeIds
      .flatMap((id) => {
        const key = String(id);
        const testType = byId.get(key);

        if (!testType || seen.has(key)) {
          return [];
        }

        seen.add(key);
        return [testType];
      })
      .slice(0, maxBlocks);
  }

  return [...activeTypes]
    .sort((left, right) => {
      const leftPinnedRank = Number.isFinite(left.defaultPinnedRank)
        ? left.defaultPinnedRank
        : Number.MAX_SAFE_INTEGER;
      const rightPinnedRank = Number.isFinite(right.defaultPinnedRank)
        ? right.defaultPinnedRank
        : Number.MAX_SAFE_INTEGER;

      return (
        leftPinnedRank - rightPinnedRank ||
        left.displayOrder - right.displayOrder ||
        left.label.localeCompare(right.label)
      );
    })
    .slice(0, maxBlocks);
};

const normalizeCountLabel = (count) => {
  if (!Number.isFinite(count)) {
    return null;
  }

  return `${count} ${count === 1 ? 'material' : 'materials'}`;
};

const getSummaryForTestType = (summariesByTestTypeId, testTypeId) => {
  if (!summariesByTestTypeId) {
    return null;
  }

  if (summariesByTestTypeId instanceof Map) {
    return summariesByTestTypeId.get(testTypeId) ?? null;
  }

  return summariesByTestTypeId[testTypeId] ?? null;
};

const TestTypeLogo = ({ testType }) => {
  if (testType.logoUrl) {
    return (
      <img
        className="test-type-block__logo"
        src={testType.logoUrl}
        alt={testType.logoAlt}
        loading="lazy"
      />
    );
  }

  return (
    <span
      className="test-type-block__fallback-logo"
      title={testType.label}
      aria-hidden="true"
    >
      {testType.shortLabel || testType.label}
    </span>
  );
};

const TestTypeBlockModule = ({
  testTypes = DEFAULT_MATERIAL_TEST_TYPES,
  pinnedTestTypeIds,
  activeTestTypeId = null,
  onActiveTestTypeChange,
  onOpenPreferences,
  summariesByTestTypeId,
}) => {
  const visibleTestTypes = useMemo(
    () => resolveVisibleTestTypeBlocks({ testTypes, pinnedTestTypeIds }),
    [pinnedTestTypeIds, testTypes],
  );

  if (visibleTestTypes.length === 0) {
    return null;
  }

  return (
    <section
      className="test-type-block-module"
      aria-label="Test Type filters"
      style={{ '--test-type-block-count': visibleTestTypes.length }}
    >
      {visibleTestTypes.map((testType) => {
        const testTypeId = String(testType.testTypeId);
        const isActive = String(activeTestTypeId ?? '') === testTypeId;
        const summary = getSummaryForTestType(summariesByTestTypeId, testTypeId);
        const countLabel = normalizeCountLabel(summary?.materialCount);
        const skillLabel = summary?.skillLabel || summary?.primarySkillLabel || null;

        return (
          <article
            key={testTypeId}
            className={`test-type-block-card${isActive ? ' is-active' : ''}`}
          >
            <button
              type="button"
              className="test-type-block"
              data-test-type-id={testTypeId}
              aria-label={`Filter materials by ${testType.label}`}
              aria-pressed={isActive}
              onClick={() => onActiveTestTypeChange?.(isActive ? null : testTypeId)}
            >
              <span className="test-type-block__media">
                <TestTypeLogo testType={testType} />
              </span>

              {(countLabel || skillLabel) && (
                <span className="test-type-block__meta" aria-label={`${testType.label} indexed summary`}>
                  {countLabel && <span className="test-type-block__chip">{countLabel}</span>}
                  {skillLabel && (
                    <span
                      className="test-type-block__chip test-type-block__chip--muted"
                      title={skillLabel}
                    >
                      {skillLabel}
                    </span>
                  )}
                </span>
              )}
            </button>

            <button
              type="button"
              className="test-type-block__settings"
              aria-label="Edit pinned Test Types"
              title="Edit pinned Test Types"
              onClick={(event) => {
                event.stopPropagation();
                onOpenPreferences?.({
                  source: 'settings-icon',
                  testType,
                  testTypeId,
                });
              }}
            >
              <SettingsIcon size={15} aria-hidden="true" />
            </button>
          </article>
        );
      })}
    </section>
  );
};

export default TestTypeBlockModule;
