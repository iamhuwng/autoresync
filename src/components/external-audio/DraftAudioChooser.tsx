import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { Button, toast } from '@/components/modern';
import { useDialogToastTarget } from '@/components/modern/ToastNotification';
import { supportsTestAudio, type AudioTestType } from '@/config/testTypeCapabilities';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigation } from '@/hooks/useNavigation';
import {
    createExternalAudioClient, externalAudioAuthoringOptedIn, externalAudioFeedback, externalAudioHealth,
    resolveExternalAudioOrigin, type DraftAudioTarget, type DraftRecording, type ExternalAudioConnection,
    type ExternalAudioSelection, type ExternalAudioSummary,
} from '@/services/externalAudioClient';
import type { DraftSectionAudio } from '@/types/assessmentAudio.types';
import { ExternalAudioPicker, fileDate } from './ExternalAudioPicker';
import { accountDisplayName, accountScopeLabel } from './ExternalAudioStorage';

interface Props {
    testType: AudioTestType;
    draftId: string | null;
    sectionId: string | null;
    value?: DraftSectionAudio;
    hasUpload?: boolean;
    layout?: 'default' | 'inline';
    saveLabel?: string;
    onEnsureDraft?: () => Promise<string | null>;
    onChange: (reference: DraftSectionAudio | undefined) => void;
    track: (action: string) => void;
}

export function DraftAudioChooser(props: Props) {
    if (!externalAudioAuthoringOptedIn() || !supportsTestAudio(props.testType, 'section')) return null;
    return <AuthorizedDraftAudioChooser {...props} />;
}

function AuthorizedDraftAudioChooser({ testType, draftId, sectionId, onEnsureDraft, ...props }: Props) {
    const { user, profile } = useAuth();
    const origin = user && resolveExternalAudioOrigin(profile);
    if (!origin || !sectionId || (!draftId && !onEnsureDraft)) return null;
    return <DraftAudioControls key={JSON.stringify([user.uid, sectionId])}
        {...props} origin={origin} target={{ testType, draftId: draftId ?? '', sectionId }}
        onEnsureDraft={onEnsureDraft} getIdToken={() => user.getIdToken()} />;
}

function DraftAudioControls({ origin, getIdToken, target, onEnsureDraft, value, hasUpload, layout = 'default', saveLabel = 'Save draft', onChange, track }: Omit<Props, 'testType' | 'draftId' | 'sectionId'> & {
    origin: string;
    target: DraftAudioTarget;
    getIdToken: () => Promise<string>;
}) {
    const heading = useId();
    const accountSelectId = useId();
    const dialog = useRef<HTMLDialogElement>(null);
    const triggerRef = useRef<HTMLElement | null>(null);
    const toastTarget = useRef<HTMLDivElement>(null);
    const operation = useRef<AbortController | null>(null);
    const latest = useRef({ getIdToken, onChange });
    latest.current = { getIdToken, onChange };
    const getToken = useCallback(() => latest.current.getIdToken(), []);
    const client = useMemo(() => createExternalAudioClient(origin, getToken), [origin, getToken]);
    const { navigateTo } = useNavigation('teacher');
    const [summary, setSummary] = useState<ExternalAudioSummary | null>(null);
    const [selection, setSelection] = useState<ExternalAudioSelection | null>(null);
    const [preview, setPreview] = useState<{ url: string; expiresAt: number } | null>(null);
    const [previewLoading, setPreviewLoading] = useState(false);
    const [previewError, setPreviewError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const [chooserOpen, setChooserOpen] = useState(false);
    useDialogToastTarget(toastTarget, chooserOpen);
    const [recording, setRecording] = useState<(DraftRecording & { assetId: string }) | null>(null);
    const assetId = value?.assetId;
    const { testType, draftId, sectionId } = target;

    useEffect(() => {
        if (!assetId || !draftId) {
            setPreview(null);
            setPreviewError(null);
            setPreviewLoading(false);
            return;
        }
        const controller = new AbortController();
        const scope = { testType, draftId, sectionId };

        client.draftRecording(scope, assetId, controller.signal).then((result) => {
            if (!controller.signal.aborted) setRecording({ ...result, assetId });
        }, () => {
            // Attachment metadata is optional for playback and replacement.
        });

        setPreview(null);
        setPreviewError(null);
        setPreviewLoading(true);
        client.previewDraft(scope, assetId, controller.signal).then((result) => {
            if (!controller.signal.aborted) {
                setPreview(result);
                setPreviewLoading(false);
            }
        }, (failure) => {
            if (!controller.signal.aborted) {
                setPreviewLoading(false);
                setPreviewError(externalAudioFeedback(failure));
            }
        });

        return () => controller.abort();
    }, [assetId, client, draftId, sectionId, testType]);

    const [error, setError] = useState<string | null>(null);
    useEffect(() => () => operation.current?.abort(), []);
    const expiresAt = preview?.expiresAt;
    useEffect(() => {
        if (!expiresAt) return;
        const timer = setTimeout(() => {
            setPreview(null);
            setPreviewError('Preview expired.');
        }, Math.max(0, Math.min(120_000, expiresAt - Date.now())));
        return () => clearTimeout(timer);
    }, [expiresAt]);

    function close() {
        track('externalAudioClosePicker');
        operation.current?.abort();
        setBusy(false);
        setError(null);
        setSummary(null);
        setSelection(null);
        setChooserOpen(false);
        queueMicrotask(() => triggerRef.current?.focus());
    }

    async function run(task: (signal: AbortSignal) => Promise<void>) {
        operation.current?.abort();
        const controller = new AbortController();
        operation.current = controller;
        const { signal } = controller;
        setBusy(true);
        setError(null);
        try {
            await task(signal);
        } catch (failure) {
            if (!signal.aborted) {
                const message = externalAudioFeedback(failure);
                setError(message);
                toast.error(message);
            }
        } finally {
            if (!signal.aborted) setBusy(false);
        }
    }

    async function loadConnections(signal: AbortSignal) {
        const result = await client.connections(signal);
        if (!signal.aborted) setSummary(result);
    }

    function open(trigger: HTMLElement | null) {
        triggerRef.current = trigger;
        track('externalAudioOpenPicker');
        dialog.current?.showModal();
        setChooserOpen(true);
        void run(loadConnections);
    }

    function openProfileStorage() {
        track('externalAudioOpenProfileFromAuthoring');
        dialog.current?.close();
        toast.info('Opening External audio storage in Profile.');
        navigateTo('PROFILE', {}, {
            reason: 'external_audio_setup',
            state: { section: 'external-audio' },
        });
    }

    function selectAuthoringAccount(targetAccount: ExternalAudioConnection) {
        if (!summary || targetAccount.id === summary.activeConnectionId) return;
        track('externalAudioSelectAccount');
        setSelection(null);
        void run(async (signal) => {
            const updated = await client.select({
                connectionId: targetAccount.id,
                generation: summary.generation,
            }, signal);
            if (signal.aborted) return;
            setSummary(updated);
            toast.success(`Switched authoring account to ${accountDisplayName(targetAccount)}. Existing tests stay on their original accounts.`);
        });
    }

    function applySelection() {
        if (!selection) return;
        track('externalAudioAttachDraft');
        void run(async (signal) => {
            const resolvedDraftId = onEnsureDraft ? await onEnsureDraft() : target.draftId;
            if (signal.aborted) return;
            if (!resolvedDraftId) {
                setError('Could not prepare this section. Try choosing the recording again.');
                return;
            }
            const attached = await client.attachDraft({ ...target, draftId: resolvedDraftId }, selection, signal);
            if (signal.aborted) return;
            setRecording({
                assetId: attached.assetId,
                filename: selection.objectKey.split('/').at(-1) ?? selection.objectKey,
                lastModifiedAt: selection.lastModifiedAt,
            });
            dialog.current?.close();
            latest.current.onChange(attached);
            toast.success(`Audio attached. Use ${saveLabel} to keep this choice.`);
        });
    }

    function reloadPreview() {
        if (!value || !target.draftId) return;
        track('externalAudioPreviewDraft');
        setPreview(null);
        setPreviewError(null);
        setPreviewLoading(true);
        void run(async (signal) => {
            try {
                const result = await client.previewDraft(target, value.assetId, signal);
                if (!signal.aborted) setPreview(result);
            } finally {
                if (!signal.aborted) setPreviewLoading(false);
            }
        });
    }

    const connection = summary?.connections.find(({ id, state }) => id === summary.activeConnectionId && state === 'active');
    const retainedAccounts = summary?.connections.filter(({ state }) => state === 'archived') ?? [];
    const selectableAccounts = summary?.connections.filter(({ state }) => state === 'active' || state === 'archived') ?? [];
    const isNoActiveAccount = Boolean(summary && !connection);

    const filename = recording?.assetId === assetId && recording ? recording.filename : null;

    return <div className={layout === 'inline' ? 'external-audio-inline' : 'external-audio-stack'}>
        {layout === 'inline' ? (
            <>
                {value && filename && (
                    <span className="external-audio-inline-name" title={filename}>{filename}</span>
                )}
                {value && previewLoading && (
                    <span className="external-audio-hint" role="status">Loading…</span>
                )}
                {value && preview && (
                    <audio
                        className="external-audio-inline-player"
                        controls
                        preload="metadata"
                        aria-label="Draft audio preview"
                        src={preview.url}
                        onError={() => {
                            setPreview(null);
                            setPreviewError('Could not play this audio preview.');
                        }}
                    />
                )}
                {value && previewError && !preview && (
                    <button
                        type="button"
                        className="external-audio-inline-btn external-audio-inline-btn--secondary"
                        disabled={busy || previewLoading}
                        onClick={reloadPreview}
                    >
                        Reload
                    </button>
                )}
                <button
                    type="button"
                    className={`external-audio-inline-btn ${value || hasUpload ? 'external-audio-inline-btn--secondary' : 'external-audio-inline-btn--primary'}`}
                    disabled={busy && !chooserOpen}
                    onClick={(event) => open(event.currentTarget)}
                >
                    {value || hasUpload ? 'Replace' : 'Choose audio'}
                </button>
                {value && (
                    <button
                        type="button"
                        className="external-audio-inline-btn external-audio-inline-btn--danger"
                        disabled={busy}
                        onClick={() => {
                            track('externalAudioRemoveDraft');
                            setPreview(null);
                            setPreviewError(null);
                            onChange(undefined);
                            toast.success(`Audio removed. Use ${saveLabel} to keep this change.`);
                        }}
                    >
                        Remove
                    </button>
                )}
                {error && !chooserOpen && <span className="external-audio-error" role="alert">{error}</span>}
            </>
        ) : (
            <>
                {value && <p>
                    <strong>{filename ?? 'External recording linked'}</strong>
                    {recording?.assetId === assetId && recording?.lastModifiedAt !== undefined &&
                        <span className="external-audio-hint"> · {fileDate(recording.lastModifiedAt)}</span>}
                </p>}
                {value && previewLoading && <p className="external-audio-hint" role="status">Loading audio preview…</p>}
                {value && preview && <audio controls preload="metadata" aria-label="Draft audio preview" src={preview.url}
                    onError={() => {
                        setPreview(null);
                        setPreviewError('Could not play this audio preview.');
                    }} />}
                {value && previewError && !preview && (
                    <div className="external-audio-row">
                        <p className="external-audio-error" role="alert">{previewError}</p>
                        <Button type="button" size="sm" variant="outline" disabled={busy || previewLoading} onClick={reloadPreview}>
                            Reload preview
                        </Button>
                    </div>
                )}
                <div className="external-audio-controls">
                    <Button type="button" size="sm" variant={value || hasUpload ? 'outline' : 'primary'} disabled={busy && !chooserOpen} onClick={(event: React.MouseEvent<HTMLElement>) => open(event.currentTarget)}>
                        {value || hasUpload ? 'Replace audio' : 'Choose external audio'}
                    </Button>
                    {value && (
                        <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => {
                            track('externalAudioRemoveDraft');
                            setPreview(null);
                            setPreviewError(null);
                            onChange(undefined);
                            toast.success(`Audio removed. Use ${saveLabel} to keep this change.`);
                        }}>Remove</Button>
                    )}
                </div>
                {error && !chooserOpen && <p className="external-audio-error" role="alert">{error}</p>}
            </>
        )}
        <dialog
            className="external-audio-dialog external-audio-chooser"
            ref={dialog}
            aria-labelledby={heading}
            onClose={close}
        >
            <header className="external-audio-row external-audio-chooser-header">
                <h4 id={heading}>
                    {isNoActiveAccount
                        ? (retainedAccounts.length > 0 ? 'Select audio storage' : 'Connect audio storage')
                        : 'Choose audio'}
                </h4>
                <Button type="button" size="sm" variant="outline" onClick={() => dialog.current?.close()}>Close</Button>
            </header>
            <div className="external-audio-chooser-body external-audio-stack">
                {busy && !summary && <p role="status">Loading…</p>}
                {error && <p className="external-audio-error" role="alert">{error}</p>}
                {!busy && !summary && <Button type="button" size="sm" variant="outline" onClick={() => {
                    track('externalAudioRefresh');
                    void run(loadConnections);
                }}>Retry</Button>}

                {isNoActiveAccount && (
                    <div className="external-audio-stack" data-testid="no-active-b2-modal">
                        {retainedAccounts.length > 0 ? (
                            <ul className="external-audio-card-list" aria-label="Retained accounts">
                                {retainedAccounts.map((account) => (
                                    <li key={account.id} className="external-audio-card">
                                        <div className="external-audio-row">
                                            <div className="external-audio-identity">
                                                <strong className="external-audio-account-title">{accountDisplayName(account)}</strong>
                                                <span className="external-audio-scope">{accountScopeLabel(account)}</span>
                                            </div>
                                            <Button type="button" size="sm" disabled={busy} onClick={() => selectAuthoringAccount(account)}>
                                                Use for authoring
                                            </Button>
                                        </div>
                                    </li>
                                ))}
                            </ul>
                        ) : (
                            <>
                                <p>Connect a private Backblaze B2 bucket in Profile to choose audio for this test.</p>
                                <ol className="external-audio-steps">
                                    <li>Open <strong>Profile → External audio storage</strong>.</li>
                                    <li>Add a read-only Backblaze B2 bucket key.</li>
                                    <li>Return here to select your audio.</li>
                                </ol>
                            </>
                        )}
                    </div>
                )}

                {connection && <div className="external-audio-source">
                    {selectableAccounts.length > 1 ? (
                        <label htmlFor={accountSelectId}>
                            Authoring account
                            <select
                                id={accountSelectId}
                                aria-label="Authoring account"
                                value={connection.id}
                                disabled={busy}
                                onChange={(event) => {
                                    const next = selectableAccounts.find((item) => item.id === event.target.value);
                                    if (next) selectAuthoringAccount(next);
                                }}
                            >
                                {selectableAccounts.map((item) => (
                                    <option key={item.id} value={item.id}>
                                        {accountDisplayName(item)} ({accountScopeLabel(item)})
                                    </option>
                                ))}
                            </select>
                        </label>
                    ) : (
                        <div className="external-audio-row">
                            <span className="external-audio-filename">
                                <strong>{accountDisplayName(connection)}</strong>{' '}
                                <span className="external-audio-scope">{accountScopeLabel(connection)}</span>
                            </span>
                            <span className={`external-audio-badge ${connection.health === 'healthy' ? 'external-audio-badge-healthy' : 'external-audio-badge-attention'}`}>
                                {connection.health === 'healthy' ? 'Connected' : 'Needs attention'}
                            </span>
                        </div>
                    )}
                    {connection.health !== 'healthy' && (
                        <div className="external-audio-row">
                            <p className="external-audio-error" role="alert">{externalAudioHealth(connection.health)}</p>
                            <Button type="button" size="sm" variant="outline" onClick={openProfileStorage}>
                                Open Profile storage settings
                            </Button>
                        </div>
                    )}
                </div>}

                {connection && connection.health === 'healthy' && summary && (
                    <ExternalAudioPicker
                        key={JSON.stringify([connection.id, summary.generation])}
                        client={client}
                        connection={connection}
                        onInspect={(file) => setSelection(file ? {
                            ...file, storageProvider: 'b2', connectionId: connection.id, generation: summary.generation,
                        } : null)}
                        track={track}
                    />
                )}
            </div>
            <div ref={toastTarget} />
            {isNoActiveAccount ? (
                <footer className="external-audio-chooser-footer">
                    <Button type="button" size="sm" variant="outline" onClick={() => dialog.current?.close()}>Cancel</Button>
                    <Button type="button" size="sm" disabled={busy} onClick={openProfileStorage}>
                        Open Profile storage settings
                    </Button>
                </footer>
            ) : connection && connection.health === 'healthy' ? (
                <footer className="external-audio-chooser-footer">
                    <Button type="button" size="sm" variant="outline" onClick={() => dialog.current?.close()}>Cancel</Button>
                    <Button type="button" size="sm" disabled={!selection || busy} onClick={applySelection}>
                        {value || hasUpload ? 'Replace audio' : 'Attach audio'}
                    </Button>
                </footer>
            ) : null}
        </dialog>
    </div>;
}
