import React, { useEffect, useMemo, useState } from 'react';

import {
  MATERIAL_CATALOG_MATERIAL_KINDS,
  type MaterialCatalogMaterialKind,
  type MaterialTestTypeConfig,
  type MaterialTestTypeId,
} from '../../types/materialCatalog.types';
import {
  DEFAULT_MATERIAL_TEST_TYPES,
  createTestType,
  deactivateTestType,
  sortMaterialTestTypesByDisplayOrder,
  updateTestType,
  type MaterialCatalogAdminContext,
  type MaterialTestTypeConfigRepository,
} from '../../services/materialCatalog/testTypeConfig.service';
import { Button, Card } from '../modern';
import {
  getTeacherMaterialsDiagnosticTime,
  getTeacherMaterialsElapsedMs,
  logTeacherMaterialsDiagnostic,
} from '../../utils/teacherMaterialsDiagnostics';

export type TestTypeAdminPanelMoveDirection = 'up' | 'down';

export interface TestTypeAdminPanelProps {
  readonly testTypes?: readonly MaterialTestTypeConfig[];
  readonly loading?: boolean;
  readonly error?: string | null;
  readonly permissionDenied?: boolean;
  readonly onRetry?: () => void;
  readonly onCreateTestType?: () => void;
  readonly onEditTestType?: (testTypeId: MaterialTestTypeId) => void;
  readonly onDeactivateTestType?: (testTypeId: MaterialTestTypeId) => void;
  readonly onMoveTestType?: (
    testTypeId: MaterialTestTypeId,
    direction: TestTypeAdminPanelMoveDirection,
  ) => void;
  readonly onAllowedMaterialKindToggle?: (
    testTypeId: MaterialTestTypeId,
    materialKind: MaterialCatalogMaterialKind,
    enabled: boolean,
  ) => void;
  readonly onTrackAction?: (actionName: string, metadata?: Record<string, unknown>) => void;
  readonly context?: MaterialCatalogAdminContext;
  readonly repository?: MaterialTestTypeConfigRepository;
}

const visibleMaterialKinds: readonly MaterialCatalogMaterialKind[] = [
  'full-test',
  'reading-passage',
  'book',
];

const smallButtonStyle: React.CSSProperties = {
  border: '1px solid rgba(148, 163, 184, 0.32)',
  background: 'rgba(255, 255, 255, 0.84)',
  borderRadius: '8px',
  color: '#334155',
  cursor: 'pointer',
  fontSize: '0.78rem',
  fontWeight: 700,
  padding: '0.45rem 0.65rem',
};

const dangerButtonStyle: React.CSSProperties = {
  ...smallButtonStyle,
  borderColor: 'rgba(239, 68, 68, 0.28)',
  color: '#b91c1c',
};

const chipStyle: React.CSSProperties = {
  borderRadius: '999px',
  background: 'rgba(99, 102, 241, 0.1)',
  color: '#4f46e5',
  fontSize: '0.75rem',
  fontWeight: 800,
  padding: '0.2rem 0.55rem',
};

const detailTextStyle: React.CSSProperties = {
  color: '#64748b',
  fontSize: '0.78rem',
  margin: '0.28rem 0 0',
};

type TestTypeEditorMode = 'create' | 'edit';

interface TestTypeEditorState {
  readonly mode: TestTypeEditorMode;
  readonly original?: MaterialTestTypeConfig;
  readonly form: {
    readonly testTypeId: string;
    readonly canonicalKey: string;
    readonly label: string;
    readonly shortLabel: string;
    readonly aliases: string;
    readonly active: boolean;
    readonly teacherSelectable: boolean;
    readonly displayOrder: string;
    readonly defaultPinnedRank: string;
    readonly readingSourceOrderLabel: string;
    readonly readingSourceOrderLabelPlural: string;
    readonly logoUrl: string;
    readonly logoAlt: string;
    readonly colorToken: string;
    readonly iconToken: string;
    readonly allowedMaterialKinds: readonly MaterialCatalogMaterialKind[];
  };
}

const createEmptyEditorState = (displayOrder: number): TestTypeEditorState => ({
  mode: 'create',
  form: {
    testTypeId: '',
    canonicalKey: '',
    label: '',
    shortLabel: '',
    aliases: '',
    active: true,
    teacherSelectable: true,
    displayOrder: String(displayOrder),
    defaultPinnedRank: '',
    readingSourceOrderLabel: '',
    readingSourceOrderLabelPlural: '',
    logoUrl: '',
    logoAlt: '',
    colorToken: '',
    iconToken: '',
    allowedMaterialKinds: ['full-test', 'reading-passage', 'book'],
  },
});

const createEditEditorState = (testType: MaterialTestTypeConfig): TestTypeEditorState => ({
  mode: 'edit',
  original: testType,
  form: {
    testTypeId: testType.testTypeId,
    canonicalKey: testType.canonicalKey,
    label: testType.label,
    shortLabel: testType.shortLabel,
    aliases: testType.aliases.join(','),
    active: testType.active,
    teacherSelectable: testType.teacherSelectable,
    displayOrder: String(testType.displayOrder),
    defaultPinnedRank: testType.defaultPinnedRank == null ? '' : String(testType.defaultPinnedRank),
    readingSourceOrderLabel: testType.readingSourceOrderLabel,
    readingSourceOrderLabelPlural: testType.readingSourceOrderLabelPlural,
    logoUrl: testType.logoUrl ?? '',
    logoAlt: testType.logoAlt,
    colorToken: testType.colorToken ?? '',
    iconToken: testType.iconToken ?? '',
    allowedMaterialKinds: [...testType.allowedMaterialKinds],
  },
});

const normalizeId = (value: string): MaterialTestTypeId =>
  value.trim().toLowerCase().replace(/[^a-z0-9-]+/g, '-') as MaterialTestTypeId;

const splitAliases = (value: string): string[] =>
  value
    .split(',')
    .map((alias) => alias.trim())
    .filter(Boolean);

const parseOptionalRank = (value: string): number | null => {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
};

const getNow = (context?: MaterialCatalogAdminContext): string =>
  context?.now?.() ?? new Date().toISOString();

const TestTypeEditor: React.FC<{
  readonly state: TestTypeEditorState;
  readonly saving: boolean;
  readonly error: string | null;
  readonly onChange: (next: TestTypeEditorState['form']) => void;
  readonly onCancel: () => void;
  readonly onSave: () => void;
}> = ({ state, saving, error, onChange, onCancel, onSave }) => {
  const updateField = <K extends keyof TestTypeEditorState['form']>(
    field: K,
    value: TestTypeEditorState['form'][K],
  ): void => {
    onChange({ ...state.form, [field]: value });
  };

  const toggleMaterialKind = (materialKind: MaterialCatalogMaterialKind, enabled: boolean): void => {
    const current = new Set(state.form.allowedMaterialKinds);
    if (enabled) {
      current.add(materialKind);
    } else {
      current.delete(materialKind);
    }

    onChange({ ...state.form, allowedMaterialKinds: [...current] });
  };

  return (
    <Card variant="glass" style={{ padding: '1rem', marginBottom: '1rem' }}>
      <h3 style={{ color: '#1e293b', fontSize: '1rem', margin: '0 0 0.8rem' }}>
        {state.mode === 'create' ? 'Create Test Type' : `Edit ${state.original?.label ?? 'Test Type'}`}
      </h3>
      <div
        style={{
          display: 'grid',
          gap: '0.75rem',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
        }}
      >
        {[
          ['Test Type ID', 'testTypeId'],
          ['Canonical key', 'canonicalKey'],
          ['Label', 'label'],
          ['Short label', 'shortLabel'],
          ['Aliases', 'aliases'],
          ['Display order', 'displayOrder'],
          ['Default pinned rank', 'defaultPinnedRank'],
          ['Singular source-order label', 'readingSourceOrderLabel'],
          ['Plural source-order label', 'readingSourceOrderLabelPlural'],
          ['Logo URL', 'logoUrl'],
          ['Logo alt', 'logoAlt'],
          ['Color token', 'colorToken'],
          ['Icon token', 'iconToken'],
        ].map(([label, field]) => (
          <label key={field} style={{ color: '#334155', display: 'grid', fontSize: '0.78rem', fontWeight: 800, gap: '0.28rem' }}>
            {label}
            <input
              aria-label={label}
              value={String(state.form[field as keyof TestTypeEditorState['form']])}
              disabled={field === 'testTypeId' && state.mode === 'edit'}
              onChange={(event) =>
                updateField(field as keyof TestTypeEditorState['form'], event.target.value as never)
              }
              style={{
                border: '1px solid rgba(148, 163, 184, 0.34)',
                borderRadius: '8px',
                height: '36px',
                padding: '0 0.55rem',
              }}
            />
          </label>
        ))}
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.9rem', marginTop: '0.85rem' }}>
        <label style={{ alignItems: 'center', color: '#334155', display: 'flex', gap: '0.35rem', fontSize: '0.82rem', fontWeight: 700 }}>
          <input
            type="checkbox"
            checked={state.form.active}
            onChange={(event) => updateField('active', event.target.checked)}
          />
          Active
        </label>
        <label style={{ alignItems: 'center', color: '#334155', display: 'flex', gap: '0.35rem', fontSize: '0.82rem', fontWeight: 700 }}>
          <input
            type="checkbox"
            checked={state.form.teacherSelectable}
            onChange={(event) => updateField('teacherSelectable', event.target.checked)}
          />
          Teacher selectable
        </label>
      </div>

      <fieldset style={{ border: '1px solid rgba(148, 163, 184, 0.24)', borderRadius: '8px', margin: '0.85rem 0 0', padding: '0.75rem' }}>
        <legend style={{ color: '#475569', fontSize: '0.78rem', fontWeight: 800 }}>
          Allowed material kinds
        </legend>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.65rem' }}>
          {visibleMaterialKinds.map((materialKind) => (
            <label key={materialKind} style={{ alignItems: 'center', color: '#334155', display: 'flex', gap: '0.35rem', fontSize: '0.8rem' }}>
              <input
                type="checkbox"
                aria-label={`Allowed material kind ${materialKind}`}
                checked={state.form.allowedMaterialKinds.includes(materialKind)}
                onChange={(event) => toggleMaterialKind(materialKind, event.target.checked)}
              />
              {materialKind}
            </label>
          ))}
        </div>
      </fieldset>

      {error ? (
        <p role="alert" style={{ color: '#b91c1c', fontSize: '0.85rem', fontWeight: 700 }}>
          {error}
        </p>
      ) : null}

      <div style={{ display: 'flex', gap: '0.6rem', justifyContent: 'flex-end', marginTop: '1rem' }}>
        <Button variant="glass" onClick={onCancel}>
          Cancel
        </Button>
        <Button variant="primary" onClick={onSave} loading={saving}>
          Save Test Type
        </Button>
      </div>
    </Card>
  );
};

const TestTypeStateCard: React.FC<{
  readonly title: string;
  readonly message: string;
  readonly actionLabel?: string;
  readonly onAction?: () => void;
}> = ({ title, message, actionLabel, onAction }) => (
  <Card variant="glass" style={{ padding: '1.5rem' }}>
    <h2 style={{ color: '#1e293b', fontSize: '1.1rem', margin: 0 }}>{title}</h2>
    <p style={{ color: '#64748b', lineHeight: 1.6, margin: '0.5rem 0 0' }}>{message}</p>
    {actionLabel && onAction ? (
      <div style={{ marginTop: '1rem' }}>
        <Button variant="glass" onClick={onAction}>
          {actionLabel}
        </Button>
      </div>
    ) : null}
  </Card>
);

export const TestTypeAdminPanel: React.FC<TestTypeAdminPanelProps> = ({
  testTypes = DEFAULT_MATERIAL_TEST_TYPES,
  loading = false,
  error = null,
  permissionDenied = false,
  onRetry,
  onCreateTestType,
  onEditTestType,
  onDeactivateTestType,
  onMoveTestType,
  onAllowedMaterialKindToggle,
  onTrackAction,
  context,
  repository,
}) => {
  const [localTestTypes, setLocalTestTypes] = useState<readonly MaterialTestTypeConfig[]>(testTypes);
  const [editorState, setEditorState] = useState<TestTypeEditorState | null>(null);
  const [editorSaving, setEditorSaving] = useState(false);
  const [editorError, setEditorError] = useState<string | null>(null);
  const sortedTestTypes = useMemo(
    () => sortMaterialTestTypesByDisplayOrder(localTestTypes),
    [localTestTypes],
  );

  useEffect(() => {
    setLocalTestTypes(testTypes);
  }, [testTypes]);

  useEffect(() => {
    if (!repository) {
      return undefined;
    }

    let cancelled = false;
    const startedAt = getTeacherMaterialsDiagnosticTime();
    repository
      .listTestTypes()
      .then((records) => {
        if (!cancelled) {
          setLocalTestTypes(records);
          logTeacherMaterialsDiagnostic('test_type_config_load_succeeded', {
            count: records.length,
            durationMs: getTeacherMaterialsElapsedMs(startedAt),
          });
        }
      })
      .catch((loadError) => {
        if (!cancelled) {
          setEditorError(loadError instanceof Error ? loadError.message : 'Failed to load Test Types.');
          logTeacherMaterialsDiagnostic('test_type_config_load_failed', {
            message: loadError instanceof Error ? loadError.message : String(loadError),
            durationMs: getTeacherMaterialsElapsedMs(startedAt),
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [repository]);

  const trackAndRun = (
    actionName: string,
    metadata: Record<string, unknown> | undefined,
    callback?: () => void,
  ): void => {
    onTrackAction?.(actionName, metadata);
    callback?.();
  };

  const upsertLocalTestType = (next: MaterialTestTypeConfig): void => {
    setLocalTestTypes((current) => {
      const index = current.findIndex((record) => record.testTypeId === next.testTypeId);
      if (index === -1) {
        return sortMaterialTestTypesByDisplayOrder([...current, next]);
      }

      const updated = [...current];
      updated[index] = next;
      return sortMaterialTestTypesByDisplayOrder(updated);
    });
  };

  const buildConfigFromEditor = (): MaterialTestTypeConfig | null => {
    if (!editorState) {
      return null;
    }

    const id = editorState.mode === 'edit' && editorState.original
      ? editorState.original.testTypeId
      : normalizeId(editorState.form.testTypeId);
    const now = getNow(context);

    return {
      testTypeId: id,
      canonicalKey: editorState.form.canonicalKey.trim(),
      label: editorState.form.label.trim(),
      shortLabel: editorState.form.shortLabel.trim(),
      aliases: splitAliases(editorState.form.aliases),
      active: editorState.form.active,
      teacherSelectable: editorState.form.teacherSelectable,
      displayOrder: Number(editorState.form.displayOrder),
      defaultPinnedRank: parseOptionalRank(editorState.form.defaultPinnedRank),
      readingSourceOrderLabel: editorState.form.readingSourceOrderLabel.trim(),
      readingSourceOrderLabelPlural: editorState.form.readingSourceOrderLabelPlural.trim(),
      logoUrl: editorState.form.logoUrl.trim() || undefined,
      logoAlt: editorState.form.logoAlt.trim(),
      colorToken: editorState.form.colorToken.trim() || undefined,
      iconToken: editorState.form.iconToken.trim() || undefined,
      allowedMaterialKinds: [...editorState.form.allowedMaterialKinds],
      createdAt: editorState.original?.createdAt ?? now,
      updatedAt: editorState.original?.updatedAt ?? now,
      updatedBy: context?.uid ?? 'unknown',
    };
  };

  const handleSaveEditor = async (): Promise<void> => {
    const config = buildConfigFromEditor();
    if (!config || !repository || !context) {
      setEditorState(null);
      return;
    }

    setEditorSaving(true);
    setEditorError(null);

    try {
      const saved = editorState?.mode === 'create'
        ? await createTestType(config, context, repository)
        : await updateTestType(config.testTypeId, config, context, repository);

      upsertLocalTestType(saved);
      onTrackAction?.(
        editorState?.mode === 'create' ? 'saveCreatedTestType' : 'saveEditedTestType',
        { testTypeId: saved.testTypeId },
      );
      setEditorState(null);
    } catch (saveError) {
      setEditorError(saveError instanceof Error ? saveError.message : 'Failed to save Test Type.');
    } finally {
      setEditorSaving(false);
    }
  };

  const handleDeactivate = async (testType: MaterialTestTypeConfig): Promise<void> => {
    onTrackAction?.('deactivateTestType', { testTypeId: testType.testTypeId });
    onDeactivateTestType?.(testType.testTypeId);

    if (!repository || !context) {
      return;
    }

    try {
      const saved = await deactivateTestType(testType.testTypeId, context, repository);
      upsertLocalTestType(saved);
    } catch (deactivateError) {
      setEditorError(
        deactivateError instanceof Error ? deactivateError.message : 'Failed to deactivate Test Type.',
      );
    }
  };

  if (permissionDenied) {
    return (
      <TestTypeStateCard
        title="Permission denied"
        message="Only super administrators can manage Test Type records."
      />
    );
  }

  if (loading) {
    return (
      <TestTypeStateCard
        title="Loading Test Types..."
        message="Fetching admin-configured Test Type records."
      />
    );
  }

  if (error) {
    return (
      <TestTypeStateCard
        title="Test Types failed to load"
        message={error}
        actionLabel="Retry"
        onAction={() => trackAndRun('retryTestTypeAdminLoad', undefined, onRetry)}
      />
    );
  }

  return (
    <section aria-labelledby="test-type-admin-title">
      <Card variant="glass" style={{ padding: '1.5rem', marginBottom: '1rem' }}>
        <div
          style={{
            alignItems: 'flex-start',
            display: 'flex',
            gap: '1rem',
            justifyContent: 'space-between',
          }}
        >
          <div>
            <h2
              id="test-type-admin-title"
              style={{ color: '#1e293b', fontSize: '1.2rem', fontWeight: 800, margin: 0 }}
            >
              Test Type Management
            </h2>
            <p style={{ color: '#64748b', lineHeight: 1.6, margin: '0.5rem 0 0' }}>
              Configure canonical Test Types, aliases, source-order labels, default pinned
              ranks, and allowed material families.
            </p>
          </div>
          <Button
            variant="primary"
            onClick={() => {
              trackAndRun('createTestType', undefined, onCreateTestType);
              setEditorError(null);
              setEditorState(createEmptyEditorState(sortedTestTypes.length + 1));
            }}
          >
            Create Test Type
          </Button>
        </div>
      </Card>

      {editorState ? (
        <TestTypeEditor
          state={editorState}
          saving={editorSaving}
          error={editorError}
          onChange={(form) => setEditorState({ ...editorState, form })}
          onCancel={() => {
            setEditorState(null);
            setEditorError(null);
          }}
          onSave={handleSaveEditor}
        />
      ) : null}

      {sortedTestTypes.length === 0 ? (
        <TestTypeStateCard
          title="No Test Types configured yet."
          message="Create the first active Test Type before exposing teacher material filters."
        />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
          {sortedTestTypes.map((testType, index) => (
            <Card
              key={testType.testTypeId}
              variant="glass"
              data-testid={`test-type-row-${testType.testTypeId}`}
              style={{ padding: '1rem' }}
            >
              <div
                style={{
                  alignItems: 'flex-start',
                  display: 'grid',
                  gap: '1rem',
                  gridTemplateColumns: 'minmax(180px, 1fr) minmax(220px, 1.3fr) auto',
                }}
              >
                <div>
                  <div style={{ alignItems: 'center', display: 'flex', gap: '0.5rem' }}>
                    <strong style={{ color: '#1e293b', fontSize: '1rem' }}>{testType.label}</strong>
                    <span style={chipStyle}>{testType.canonicalKey}</span>
                    {!testType.active ? (
                      <span style={{ ...chipStyle, background: 'rgba(148, 163, 184, 0.16)', color: '#64748b' }}>
                        inactive
                      </span>
                    ) : null}
                  </div>
                  <p style={{ color: '#64748b', fontSize: '0.84rem', margin: '0.4rem 0 0' }}>
                    Short: {testType.shortLabel}
                  </p>
                  <p style={detailTextStyle}>
                    Source labels: {testType.readingSourceOrderLabel} / {testType.readingSourceOrderLabelPlural}
                  </p>
                  <p style={detailTextStyle}>
                    Display order: {testType.displayOrder}
                    {testType.defaultPinnedRank == null ? '' : ` / Default pin: ${testType.defaultPinnedRank}`}
                  </p>
                  <p style={detailTextStyle}>
                    {testType.teacherSelectable ? 'teacher-selectable' : 'teacher-hidden'}
                    {testType.active ? ' / active' : ' / inactive'}
                  </p>
                  <p style={detailTextStyle}>
                    Aliases: {testType.aliases.length > 0 ? testType.aliases.join(', ') : 'None'}
                  </p>
                  <p style={detailTextStyle}>
                    Logo URL: {testType.logoUrl || 'None'}
                  </p>
                  <p style={detailTextStyle}>
                    Logo alt: {testType.logoAlt}
                  </p>
                  <p style={detailTextStyle}>
                    Color: {testType.colorToken || 'None'} / Icon: {testType.iconToken || 'None'}
                  </p>
                  <p style={detailTextStyle}>
                    Allowed: {testType.allowedMaterialKinds.join(', ')}
                  </p>
                </div>

                <fieldset
                  style={{
                    border: '1px solid rgba(148, 163, 184, 0.24)',
                    borderRadius: '10px',
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: '0.65rem',
                    margin: 0,
                    padding: '0.7rem',
                  }}
                >
                  <legend style={{ color: '#475569', fontSize: '0.78rem', fontWeight: 800 }}>
                    Allowed material kinds
                  </legend>
                  {visibleMaterialKinds.map((materialKind) => {
                    const checked = testType.allowedMaterialKinds.includes(materialKind);

                    return (
                      <label
                        key={materialKind}
                        style={{
                          alignItems: 'center',
                          color: '#334155',
                          display: 'flex',
                          fontSize: '0.8rem',
                          gap: '0.35rem',
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          aria-label={`${testType.label} ${materialKind}`}
                          onChange={(event) => {
                            const enabled = event.target.checked;
                            onAllowedMaterialKindToggle?.(
                              testType.testTypeId,
                              materialKind,
                              enabled,
                            );
                            onTrackAction?.('toggleAllowedMaterialKind', {
                              testTypeId: testType.testTypeId,
                              materialKind,
                              enabled,
                            });
                          }}
                        />
                        {materialKind}
                      </label>
                    );
                  })}
                </fieldset>

                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.45rem', justifyContent: 'flex-end' }}>
                  <button
                    type="button"
                    aria-label={`Move ${testType.label} up`}
                    disabled={index === 0}
                    onClick={() =>
                      trackAndRun(
                        'reorderTestType',
                        { testTypeId: testType.testTypeId, direction: 'up' },
                        () => onMoveTestType?.(testType.testTypeId, 'up'),
                      )
                    }
                    style={smallButtonStyle}
                  >
                    Up
                  </button>
                  <button
                    type="button"
                    aria-label={`Move ${testType.label} down`}
                    disabled={index === sortedTestTypes.length - 1}
                    onClick={() =>
                      trackAndRun(
                        'reorderTestType',
                        { testTypeId: testType.testTypeId, direction: 'down' },
                        () => onMoveTestType?.(testType.testTypeId, 'down'),
                      )
                    }
                    style={smallButtonStyle}
                  >
                    Down
                  </button>
                  <button
                    type="button"
                    aria-label={`Edit ${testType.label}`}
                    onClick={() => {
                      trackAndRun('editTestType', { testTypeId: testType.testTypeId }, () =>
                        onEditTestType?.(testType.testTypeId),
                      );
                      setEditorError(null);
                      setEditorState(createEditEditorState(testType));
                    }}
                    style={smallButtonStyle}
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    aria-label={`Deactivate ${testType.label}`}
                    disabled={!testType.active}
                    onClick={() => {
                      void handleDeactivate(testType);
                    }}
                    style={dangerButtonStyle}
                  >
                    Deactivate
                  </button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <div style={{ display: 'none' }}>
        {MATERIAL_CATALOG_MATERIAL_KINDS.join(',')}
      </div>
    </section>
  );
};

export default TestTypeAdminPanel;
