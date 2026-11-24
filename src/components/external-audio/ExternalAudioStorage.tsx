import { useCallback, useEffect, useId, useMemo, useRef, useState, type FormEvent } from 'react';
import { Button } from '@/components/modern/Button';
import { toast } from '@/components/modern/ToastNotification';
import {
    createExternalAudioClient, ExternalAudioRequestError, externalAudioFeedback, externalAudioHealth,
    type ExternalAudioClient, type ExternalAudioConnection, type ExternalAudioImpact, type ExternalAudioSummary,
} from '@/services/externalAudioClient';
import './ExternalAudioStorage.css';

interface Props {
    origin: string;
    getIdToken: () => Promise<string>;
    track: (action: string) => void;
    defaultOpen?: boolean;
    collapsible?: boolean;
}

type Editor =
    | { kind: 'connect' }
    | { kind: 'add'; previousActive: ExternalAudioConnection }
    | { kind: 'rotate'; connection: ExternalAudioConnection };

export function accountDisplayName(connection: Pick<ExternalAudioConnection, 'label' | 'bucketName'>) {
    return connection.label?.trim() || connection.bucketName;
}

export function accountScopeLabel(connection: Pick<ExternalAudioConnection, 'bucketName' | 'prefix'>) {
    return connection.prefix ? `${connection.bucketName} / ${connection.prefix}` : connection.bucketName;
}

export function ExternalAudioStorage({ origin, getIdToken, track, defaultOpen = false, collapsible = true }: Props) {
    const id = useId();
    const [open, setOpen] = useState(defaultOpen || !collapsible);
    const client = useMemo(() => createExternalAudioClient(origin, getIdToken), [origin, getIdToken]);

    useEffect(() => {
        if (defaultOpen || !collapsible) setOpen(true);
    }, [defaultOpen, collapsible]);

    return (
        <section className="external-audio" aria-label="External audio storage">
            {collapsible ? (
                <>
                    <div className="external-audio-row">
                        <h3 id={`${id}-heading`}>External audio storage</h3>
                        <Button size="sm" variant="outline" aria-expanded={open} aria-controls={`${id}-body`} onClick={() => {
                            track(open ? 'externalAudioClose' : 'externalAudioOpen');
                            setOpen(!open);
                        }}>{open ? 'Close storage' : 'Manage audio storage'}</Button>
                    </div>
                    <div id={`${id}-body`} hidden={!open}>
                        {open && <Workspace client={client} track={track} />}
                    </div>
                </>
            ) : (
                <Workspace client={client} track={track} />
            )}
        </section>
    );
}

function Workspace({ client, track }: {
    client: ExternalAudioClient;
    track: Props['track'];
}) {
    const request = useRef<AbortController | null>(null);
    const lastRevokeTrigger = useRef<HTMLElement | null>(null);
    const [summary, setSummary] = useState<ExternalAudioSummary | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const [editor, setEditor] = useState<Editor | null>(null);
    const [revokeTarget, setRevokeTarget] = useState<ExternalAudioConnection | null>(null);
    const [impact, setImpact] = useState<Record<string, ExternalAudioImpact>>({});

    const run = useCallback(async (operation: (signal: AbortSignal) => Promise<void>, announce = true) => {
        request.current?.abort();
        const controller = new AbortController();
        request.current = controller;
        const { signal } = controller;
        setBusy(true);
        setError(null);
        try {
            await operation(signal);
        } catch (failure) {
            if (signal.aborted) return;
            let message = externalAudioFeedback(failure);
            if (failure instanceof ExternalAudioRequestError && failure.code === 'generation_conflict') {
                setSummary(null);
                setEditor(null);
                try {
                    const current = await client.connections(signal);
                    if (signal.aborted) return;
                    setSummary(current);
                    setImpact({});
                } catch {
                    message = 'Connection changed. Refresh to continue.';
                }
            }
            if (!signal.aborted) {
                setError(message);
                if (announce) toast.error(message);
            }
        } finally {
            if (!signal.aborted) setBusy(false);
        }
    }, [client]);

    const refresh = useCallback((announce = false) => run(async (signal) => {
        const current = await client.connections(signal);
        if (signal.aborted) return;
        setSummary(current);
        if (announce) toast.info('Storage status refreshed.');
    }, announce), [client, run]);

    useEffect(() => {
        void refresh();
        return () => request.current?.abort();
    }, [refresh]);

    const active = summary?.connections.find((row) => row.id === summary.activeConnectionId && row.state === 'active');
    const retained = summary?.connections.filter((row) => row.state === 'archived') ?? [];
    const revoked = summary?.connections.filter((row) => row.state === 'revoked') ?? [];

    function rowAction(action: 'recheck' | 'revoke' | 'select' | 'cleanup', row: ExternalAudioConnection) {
        if (!summary) return;
        const trackingName = {
            recheck: 'externalAudioRecheck',
            revoke: 'externalAudioRevoke',
            select: 'externalAudioSelectAccount',
            cleanup: 'externalAudioCleanup',
        }[action];
        track(trackingName);
        void run(async (signal) => {
            const result = await client[action]({ connectionId: row.id, generation: summary.generation }, signal);
            if (signal.aborted) return;
            setSummary(result);
            if (action === 'select') {
                toast.success(`Now using ${accountDisplayName(row)} for new tests.`);
                return;
            }
            if (action === 'cleanup') {
                setImpact((current) => {
                    const next = { ...current };
                    delete next[row.id];
                    return next;
                });
                toast.success(`Removed ${accountDisplayName(row)}.`);
                return;
            }
            if (action === 'revoke') {
                toast.success(`Revoked ${accountDisplayName(row)}.`);
                return;
            }
            const health = result.connections.find(({ id }) => id === row.id)?.health;
            if (health === 'healthy') toast.success('Connection is healthy.');
            else toast.warning(externalAudioHealth(health ?? 'store_unavailable'));
        });
    }

    function checkImpact(row: ExternalAudioConnection) {
        track('externalAudioViewImpact');
        void run(async (signal) => {
            const result = await client.impact(row.id, signal);
            if (!signal.aborted) setImpact((current) => ({ ...current, [row.id]: result }));
        });
    }

    function openAddForm() {
        track(active ? 'externalAudioRequestSwitch' : 'externalAudioOpenSetup');
        setError(null);
        setEditor(active ? { kind: 'add', previousActive: active } : { kind: 'connect' });
    }

    function submitCredentials(input: {
        label: string; applicationKeyId: string; applicationKey: string; bucketName: string; prefix: string;
    }, intent: 'validate' | 'save') {
        if (!editor || !summary) return;
        if (intent === 'validate') {
            track('externalAudioValidate');
            void run(async (signal) => {
                await client.validate({
                    applicationKeyId: input.applicationKeyId,
                    applicationKey: input.applicationKey,
                    bucketName: input.bucketName,
                    prefix: input.prefix,
                }, signal);
                if (!signal.aborted) toast.success('Key is valid.');
            });
            return;
        }
        track({ connect: 'externalAudioConnect', add: 'externalAudioSwitch', rotate: 'externalAudioRotate' }[editor.kind]);
        void run(async (signal) => {
            const { generation } = summary;
            const key = { applicationKeyId: input.applicationKeyId, applicationKey: input.applicationKey };
            let result: ExternalAudioSummary;
            if (editor.kind === 'connect') {
                result = await client.connect({ ...input, generation }, signal);
            } else if (editor.kind === 'add') {
                result = await client.switch({ ...input, generation, connectionId: editor.previousActive.id }, signal);
            } else {
                result = await client.rotate({ ...key, generation, connectionId: editor.connection.id }, signal);
            }
            if (signal.aborted) return;
            setSummary(result);
            setEditor(null);
            if (editor.kind === 'connect') {
                toast.success('Backblaze B2 account connected.');
            } else if (editor.kind === 'add') {
                toast.success(`Added ${input.label.trim() || input.bucketName}. ${accountDisplayName(editor.previousActive)} stays retained.`);
            } else {
                toast.success('Application key rotated.');
            }
        });
    }

    function renderAccountRow(row: ExternalAudioConnection, isCurrent: boolean) {
        const rowImpact = impact[row.id];
        return (
            <div className={`external-audio-card ${isCurrent ? 'external-audio-card-current' : ''}`} data-testid={`b2-account-${row.state}`}>
                <div className="external-audio-card-header">
                    <div className="external-audio-identity">
                        <div className="external-audio-badges">
                            <strong className="external-audio-account-title">{accountDisplayName(row)}</strong>
                            <span className={`external-audio-badge ${row.health === 'healthy' ? 'external-audio-badge-healthy' : 'external-audio-badge-attention'}`}>
                                {row.health === 'healthy' ? 'Healthy' : 'Needs attention'}
                            </span>
                        </div>
                        <span className="external-audio-scope">
                            {accountScopeLabel(row)}
                        </span>
                    </div>
                    <div className="external-audio-management">
                        {!isCurrent && (
                            <Button size="sm" variant="outline" disabled={busy || Boolean(editor)} onClick={() => rowAction('select', row)}>
                                Use for authoring
                            </Button>
                        )}
                        <Button size="sm" variant="outline" disabled={busy || Boolean(editor)} onClick={() => rowAction('recheck', row)}>Recheck</Button>
                        <Button size="sm" variant="outline" disabled={busy || Boolean(editor)} onClick={() => checkImpact(row)}>Usage</Button>
                        <Button size="sm" variant="outline" disabled={busy || Boolean(editor)} onClick={() => {
                            track('externalAudioOpenRotation');
                            setError(null);
                            setEditor({ kind: 'rotate', connection: row });
                        }}>Rotate key</Button>
                        {!isCurrent && rowImpact?.cleanupEligible && (
                            <Button size="sm" variant="outline" disabled={busy || Boolean(editor)} onClick={() => rowAction('cleanup', row)}>
                                Remove
                            </Button>
                        )}
                        <Button size="sm" variant="outline" className="external-audio-danger" disabled={busy || Boolean(editor)} onClick={(event) => {
                            lastRevokeTrigger.current = event.currentTarget;
                            track('externalAudioRequestRevoke');
                            setRevokeTarget(row);
                        }}>Revoke</Button>
                    </div>
                </div>
                {row.health !== 'healthy' && (
                    <p className="external-audio-error" role="alert">{externalAudioHealth(row.health)}</p>
                )}
                {rowImpact && <ExternalAudioImpactCounts counts={rowImpact} />}
            </div>
        );
    }

    return (
        <div className="external-audio-stack" aria-busy={busy}>
            {busy && !summary && <p role="status">Loading…</p>}
            {error && <div className="external-audio-row">
                <p className="external-audio-error" role="alert">{error}</p>
                {!summary && <Button size="sm" variant="outline" disabled={busy} onClick={() => {
                    track('externalAudioRefresh');
                    void refresh(true);
                }}>Refresh</Button>}
            </div>}

            {summary && <>
                {editor && (
                    <ExternalAudioCredentialForm
                        key={`${editor.kind}-${editor.kind === 'rotate' ? editor.connection.id : 'new'}`}
                        editor={editor}
                        busy={busy}
                        onSubmit={submitCredentials}
                        onCancel={() => {
                            track('externalAudioCancelSetup');
                            setEditor(null);
                            setError(null);
                        }}
                    />
                )}

                <section className="external-audio-section" aria-label="Current authoring account">
                    <div className="external-audio-row">
                        <h4 className="external-audio-section-title">Current authoring account</h4>
                        {!editor && (
                            <Button size="sm" disabled={busy} onClick={openAddForm}>
                                {active || retained.length > 0 ? 'Add another B2 account' : 'Add B2 account'}
                            </Button>
                        )}
                    </div>
                    {active ? (
                        renderAccountRow(active, true)
                    ) : (
                        <div className="external-audio-card external-audio-card-empty">
                            <p className="external-audio-hint">
                                {retained.length > 0
                                    ? 'No account selected. Choose Use for authoring below.'
                                    : 'No Backblaze B2 account connected.'}
                            </p>
                        </div>
                    )}
                </section>

                {retained.length > 0 && (
                    <section className="external-audio-section" aria-label="Retained accounts">
                        <h4 className="external-audio-section-title">Retained accounts ({retained.length})</h4>
                        <ul className="external-audio-card-list" aria-label="Retained Backblaze B2 accounts">
                            {retained.map((row) => (
                                <li key={row.id}>{renderAccountRow(row, false)}</li>
                            ))}
                        </ul>
                    </section>
                )}

                {revoked.length > 0 && (
                    <details className="external-audio-revoked-group">
                        <summary>Revoked ({revoked.length})</summary>
                        <ul className="external-audio-list" aria-label="Revoked Backblaze B2 accounts">
                            {revoked.map((row) => (
                                <li className="external-audio-row" key={row.id}>
                                    <span className="external-audio-filename">
                                        <strong>{accountDisplayName(row)}</strong>{' '}
                                        <span className="external-audio-scope">{accountScopeLabel(row)}</span>
                                    </span>
                                    <span className="external-audio-badge external-audio-badge-revoked">Revoked</span>
                                </li>
                            ))}
                        </ul>
                    </details>
                )}
            </>}

            {revokeTarget && (
                <ConfirmRevokeDialog
                    client={client}
                    track={track}
                    connection={revokeTarget}
                    onClose={(confirmed) => {
                        const target = revokeTarget;
                        setRevokeTarget(null);
                        if (!confirmed) {
                            track('externalAudioCancelChange');
                            lastRevokeTrigger.current?.focus();
                            return;
                        }
                        rowAction('revoke', target);
                    }}
                />
            )}
        </div>
    );
}

export function ExternalAudioCredentialForm({ editor, busy, allowValidation = true, onSubmit, onCancel }: {
    editor: Editor;
    busy: boolean;
    allowValidation?: boolean;
    onSubmit: (input: { label: string; applicationKeyId: string; applicationKey: string; bucketName: string; prefix: string }, intent: 'validate' | 'save') => void;
    onCancel: () => void;
}) {
    const id = useId();
    const keyId = useRef<HTMLInputElement>(null);
    const key = useRef<HTMLInputElement>(null);
    const rotate = editor.kind === 'rotate';
    const title = {
        connect: 'Add Backblaze B2 account',
        add: 'Add another B2 account',
        rotate: 'Rotate application key',
    }[editor.kind];

    function submit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        if (busy || !keyId.current || !key.current) return;
        const form = new FormData(event.currentTarget);
        const input = {
            label: rotate ? (editor.connection.label ?? '') : String(form.get('label') ?? '').trim(),
            applicationKeyId: keyId.current.value.trim(),
            applicationKey: key.current.value.trim(),
            bucketName: rotate ? editor.connection.bucketName : String(form.get('bucket') ?? '').trim(),
            prefix: rotate ? editor.connection.prefix : String(form.get('prefix') ?? ''),
        };
        const submitter = (event.nativeEvent as SubmitEvent).submitter;
        const intent = submitter?.getAttribute('value') === 'validate' ? 'validate' : 'save';
        if (intent === 'save') {
            keyId.current.value = '';
            key.current.value = '';
        }
        onSubmit(input, intent);
    }

    return (
        <form method="post" autoComplete="off" className="external-audio-stack external-audio-form" onSubmit={submit} aria-labelledby={`${id}-title`}>
            <h4 id={`${id}-title`}>{title}</h4>
            <p className="external-audio-hint" id={`${id}-key-help`}>
                {rotate
                    ? <>Replacement key for <strong>{accountScopeLabel(editor.connection)}</strong>.</>
                    : <>Read-only application key restricted to your private bucket.</>}
            </p>
            <fieldset disabled={busy} className="external-audio-fields">
                {!rotate && <>
                    <label htmlFor={`${id}-label`}>Account label (optional)
                        <input id={`${id}-label`} name="label" maxLength={64} placeholder="e.g. Listening B2"
                            autoCorrect="off" spellCheck={false} />
                    </label>
                    <label htmlFor={`${id}-bucket`}>Bucket name
                        <input id={`${id}-bucket`} name="bucket" required minLength={6} maxLength={63} autoCorrect="off" autoCapitalize="none" spellCheck={false} />
                    </label>
                    <label htmlFor={`${id}-prefix`}>Folder prefix (optional)
                        <input id={`${id}-prefix`} name="prefix" placeholder="folder/"
                            autoCorrect="off" autoCapitalize="none" spellCheck={false} />
                    </label>
                </>}
                <label htmlFor={`${id}-key-id`}>Application key ID
                    <input id={`${id}-key-id`} ref={keyId} required autoComplete="off"
                        autoCorrect="off" autoCapitalize="none" spellCheck={false} aria-describedby={`${id}-key-help`} />
                </label>
                <label htmlFor={`${id}-key`}>Application key
                    <input id={`${id}-key`} ref={key} required type="password" autoComplete="off" aria-describedby={`${id}-key-help`} />
                </label>
            </fieldset>
            <div className="external-audio-controls">
                <Button type="submit" size="sm" value="save" disabled={busy}>
                    {rotate ? 'Save replacement key' : 'Connect storage'}
                </Button>
                {!rotate && allowValidation && <Button type="submit" size="sm" variant="outline" value="validate" disabled={busy}>Validate key</Button>}
                <Button type="button" size="sm" variant="outline" disabled={busy} onClick={onCancel}>Cancel</Button>
                {busy && <span role="status">Checking…</span>}
            </div>
        </form>
    );
}

export function ExternalAudioImpactCounts({ counts }: { counts: ExternalAudioImpact }) {
    return <dl className="external-audio-impact">
        <div><dt>Linked files</dt><dd>{counts.linkedFileCount}</dd></div>
        <div><dt>Drafts</dt><dd>{counts.draftCount}</dd></div>
        <div><dt>Published tests</dt><dd>{counts.publishedCount}</dd></div>
        <div><dt>Public tests</dt><dd>{counts.publicTestCount}</dd></div>
        <div><dt>Homework</dt><dd>{counts.homeworkCount}</dd></div>
        <div><dt>Results</dt><dd>{counts.resultCount}</dd></div>
    </dl>;
}

function ConfirmRevokeDialog({ client, track, connection, onClose }: {
    client: ExternalAudioClient;
    track: Props['track'];
    connection: ExternalAudioConnection;
    onClose: (confirmed: boolean) => void;
}) {
    const id = useId();
    const dialog = useRef<HTMLDialogElement>(null);
    const [counts, setCounts] = useState<ExternalAudioImpact | null>(null);
    const [unavailable, setUnavailable] = useState(false);
    const [attempt, setAttempt] = useState(0);
    const connectionId = connection.id;
    useEffect(() => { dialog.current?.showModal(); }, []);
    useEffect(() => {
        const controller = new AbortController();
        client.impact(connectionId, controller.signal).then((result) => {
            if (!controller.signal.aborted) setCounts(result);
        }, () => {
            if (!controller.signal.aborted) setUnavailable(true);
        });
        return () => controller.abort();
    }, [attempt, client, connectionId]);

    return (
        <dialog ref={dialog} className="external-audio-dialog" aria-labelledby={`${id}-heading`} aria-describedby={`${id}-description`}
            onClose={(event) => {
                const confirmed = counts !== null && event.currentTarget.returnValue === 'confirm';
                event.currentTarget.returnValue = '';
                onClose(confirmed);
            }}>
            <h4 id={`${id}-heading`}>Revoke {accountDisplayName(connection)}?</h4>
            <p id={`${id}-description`}>
                Audio linked to this account will stop playing.
            </p>
            {counts ? <ExternalAudioImpactCounts counts={counts} /> : unavailable
                ? <div className="external-audio-row">
                    <p className="external-audio-error" role="alert">Could not check linked use.</p>
                    <Button type="button" size="sm" variant="outline" onClick={() => {
                        track('externalAudioViewImpact');
                        setUnavailable(false);
                        setAttempt((current) => current + 1);
                    }}>Retry impact check</Button>
                </div>
                : <p role="status">Checking usage…</p>}
            <form method="dialog" className="external-audio-controls">
                <Button type="submit" size="sm" variant="outline" value="cancel" autoFocus>Cancel</Button>
                <Button type="submit" size="sm" variant="danger" value="confirm" disabled={!counts}>
                    Confirm revoke
                </Button>
            </form>
        </dialog>
    );
}
