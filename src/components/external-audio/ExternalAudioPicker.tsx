import { useCallback, useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { Button } from '@/components/modern/Button';
import { toast } from '@/components/modern/ToastNotification';
import {
    externalAudioFeedback,
    type ExternalAudioClient,
    type ExternalAudioConnection,
    type ExternalAudioFile,
    type ExternalAudioPreview,
} from '@/services/externalAudioClient';
import './ExternalAudioStorage.css';

interface Props {
    client: ExternalAudioClient;
    connection: ExternalAudioConnection;
    onInspect?: (file: ExternalAudioFile | null) => void;
    track: (action: string) => void;
}

const fileSize = (bytes: number) => bytes < 1024 * 1024
    ? `${Math.max(1, Math.round(bytes / 1024))} KB`
    : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
export const fileDate = (timestamp: number) => new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium', timeStyle: 'short',
}).format(timestamp);

export function ExternalAudioPicker({ client, connection, onInspect, track }: Props) {
    const id = useId();
    const task = useRef<AbortController | null>(null);
    const previewBox = useRef<HTMLDivElement>(null);
    const [files, setFiles] = useState<ExternalAudioFile[]>([]);
    const [prefix, setPrefix] = useState(connection.prefix);
    const [filenamePrefix, setFilenamePrefix] = useState('');
    const [nextCursor, setNextCursor] = useState<string | null>(null);
    const [listError, setListError] = useState<{ message: string; prefix: string; cursor?: string; filenamePrefix: string } | null>(null);
    const [fileError, setFileError] = useState<string | null>(null);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [file, setFile] = useState<ExternalAudioFile | null>(null);
    const [preview, setPreview] = useState<ExternalAudioPreview | null>(null);
    const [busy, setBusy] = useState<'list' | 'select' | 'preview' | null>(null);

    const begin = useCallback((operation: NonNullable<typeof busy>) => {
        task.current?.abort();
        const controller = new AbortController();
        task.current = controller;
        setBusy(operation);
        return controller.signal;
    }, []);

    const list = useCallback(async (directory: string, cursor?: string, announce = false, search = '') => {
        const signal = begin('list');
        setListError(null);
        if (!cursor) {
            setPrefix(directory);
            setFilenamePrefix(search);
            setFiles([]);
            setNextCursor(null);
            setSelectedId(null);
            setFile(null);
            setFileError(null);
            setPreview(null);
        }
        try {
            const result = await client.list({ connectionId: connection.id, prefix: directory, cursor, ...(search ? { filenamePrefix: search } : {}) }, signal);
            if (signal.aborted) return;
            setFiles((existing) => cursor ? [...existing, ...result.files] : result.files);
            setNextCursor(result.nextCursor);
        } catch (error) {
            if (signal.aborted) return;
            const message = externalAudioFeedback(error);
            setListError({ message, prefix: directory, cursor, filenamePrefix: search });
            if (announce) toast.error(message);
        } finally {
            if (!signal.aborted) setBusy(null);
        }
    }, [begin, client, connection.id]);

    useEffect(() => {
        void list(connection.prefix);
        return () => task.current?.abort();
    }, [list, connection.prefix]);

    useEffect(() => {
        if (preview) previewBox.current?.scrollIntoView?.({ block: 'nearest' });
    }, [preview]);

    const expiresAt = preview?.expiresAt;
    useEffect(() => {
        if (expiresAt === undefined) return;
        const timer = setTimeout(() => {
            setPreview(null);
            setFileError('Preview expired. Click Retry preview to play again.');
        }, Math.max(0, Math.min(120_000, expiresAt - Date.now())));
        return () => clearTimeout(timer);
    }, [expiresAt]);

    function browse(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        const directory = String(new FormData(event.currentTarget).get('prefix') ?? '');
        track('externalAudioBrowse');
        onInspect?.(null);
        void list(directory, undefined, true, String(new FormData(event.currentTarget).get('filenamePrefix') ?? '').trim());
    }

    async function selectFile(candidate: ExternalAudioFile) {
        track('externalAudioInspect');
        onInspect?.(null);
        const signal = begin('select');
        setSelectedId(candidate.providerVersionId);
        setPreview(null);
        setFile(null);
        setFileError(null);
        try {
            const verified = await client.inspect({
                connectionId: connection.id,
                objectKey: candidate.objectKey,
                providerVersionId: candidate.providerVersionId,
            }, signal);
            if (signal.aborted) return;
            setFile(verified);
            onInspect?.(verified);

            track('externalAudioPreview');
            setBusy('preview');
            try {
                const nextPreview = await client.preview({
                    connectionId: connection.id,
                    objectKey: verified.objectKey,
                    providerVersionId: verified.providerVersionId,
                }, signal);
                if (!signal.aborted) setPreview(nextPreview);
            } catch (previewError) {
                if (!signal.aborted) {
                    setFileError(externalAudioFeedback(previewError));
                }
            }
        } catch (error) {
            if (!signal.aborted) {
                setSelectedId(null);
                const message = externalAudioFeedback(error);
                setFileError(message);
                toast.error(message);
            }
        } finally {
            if (!signal.aborted) setBusy(null);
        }
    }

    async function retryPreview(candidate: ExternalAudioFile) {
        track('externalAudioPreview');
        const signal = begin('preview');
        setPreview(null);
        setFileError(null);
        try {
            const result = await client.preview({
                connectionId: connection.id,
                objectKey: candidate.objectKey,
                providerVersionId: candidate.providerVersionId,
            }, signal);
            if (!signal.aborted) setPreview(result);
        } catch (error) {
            if (!signal.aborted) {
                const message = externalAudioFeedback(error);
                setFileError(message);
                toast.error(message);
            }
        } finally {
            if (!signal.aborted) setBusy(null);
        }
    }

    return (
        <section className="external-audio-picker" aria-label="Browse audio">
            <form className="external-audio-controls external-audio-picker-controls" onSubmit={browse}>
                <label htmlFor={`${id}-prefix`}>Folder prefix
                    <input id={`${id}-prefix`} name="prefix" defaultValue={connection.prefix}
                        placeholder="folder/" autoCorrect="off" autoCapitalize="none" spellCheck={false} />
                </label>
                <label htmlFor={`${id}-search`}>Search filename
                    <input id={`${id}-search`} name="filenamePrefix" type="search" maxLength={255}
                        placeholder="Filter..." autoCorrect="off" autoCapitalize="none" spellCheck={false} />
                </label>
                <Button type="submit" size="sm" variant="outline" disabled={busy === 'list'}>Browse</Button>
            </form>
            {busy === 'list' && <p role="status">Loading audio files…</p>}
            {listError && <div className="external-audio-row">
                <p className="external-audio-error" role="alert">{listError.message}</p>
                <Button variant="outline" size="sm" disabled={busy === 'list'} onClick={() => {
                    track('externalAudioRetryBrowse');
                    void list(listError.prefix, listError.cursor, true, listError.filenamePrefix);
                }}>Retry</Button>
            </div>}
            {!listError && busy !== 'list' && files.length === 0 && (
                <p className="external-audio-hint">{filenamePrefix ? 'No matching audio files.' : 'No supported audio files in this folder.'}</p>
            )}
            {files.length > 0 && <ul className="external-audio-card-list" aria-label="Audio files">
                {files.map((candidate) => {
                    const isSelected = selectedId === candidate.providerVersionId;
                    return (
                        <li key={candidate.providerVersionId}>
                            <button
                                type="button"
                                className={`external-audio-file-card${isSelected ? ' is-selected' : ''}`}
                                aria-pressed={isSelected}
                                onClick={() => void selectFile(candidate)}
                            >
                                <span className="external-audio-file-card-body">
                                    <span className="external-audio-filename">{candidate.objectKey}</span>
                                    <span className="external-audio-hint">
                                        {fileSize(candidate.sizeBytes)}
                                        {candidate.lastModifiedAt !== undefined && (
                                            <> · <time dateTime={new Date(candidate.lastModifiedAt).toISOString()}>{fileDate(candidate.lastModifiedAt)}</time></>
                                        )}
                                    </span>
                                </span>
                                {isSelected && <span className="external-audio-file-card-check" aria-hidden="true">Selected</span>}
                            </button>
                        </li>
                    );
                })}
            </ul>}
            {nextCursor && !listError && <Button variant="outline" size="sm" disabled={busy === 'list'} onClick={() => {
                track('externalAudioLoadMore');
                void list(prefix, nextCursor, true, filenamePrefix);
            }}>Load more</Button>}
            {(busy === 'select' || busy === 'preview') && <p className="external-audio-hint" role="status">Loading preview…</p>}
            {fileError && <div className="external-audio-row">
                <p className="external-audio-detail external-audio-error" role="alert">{fileError}</p>
                {file && <Button size="sm" variant="outline" disabled={Boolean(busy)} onClick={() => void retryPreview(file)}>
                    Retry preview
                </Button>}
            </div>}
            {file && preview && (
                <div className="external-audio-file" ref={previewBox}>
                    <audio
                        controls
                        preload="metadata"
                        aria-label="Audio preview"
                        src={preview.url}
                        onError={() => {
                            setPreview(null);
                            setFileError('Could not play this audio preview.');
                        }}
                    />
                </div>
            )}
        </section>
    );
}
