import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AudioPlayer, type AuthorizedDeliveryConfig } from '../../skills/listening/components/AudioPlayer';
import type { ExternalAudioClient } from '../../services/externalAudioClient';
import { DEFAULT_THCS_AUDIO_PLAYBACK, type THCSAudioPlayback } from '../../types/thcs-test.types';
import { Button } from '../modern';
import './SectionRecording.css';

export type ThcsPlaybackScope = Parameters<ExternalAudioClient['playThcs']>[0];
type Grant = Awaited<ReturnType<ExternalAudioClient['playThcs']>>;
const unavailable = 'The recording is unavailable. Ask your teacher to check it.';

interface Props {
    client: Pick<ExternalAudioClient, 'playThcs'>;
    scope: ThcsPlaybackScope;
    settings?: THCSAudioPlayback;
    sectionNumber: number;
    plays: number;
    position: number;
    onPosition: (seconds: number) => void;
    onComplete: () => void;
    track: (action: string, data?: Record<string, unknown>) => void;
}

export function ThcsSectionAudio({
    client, scope, settings = DEFAULT_THCS_AUDIO_PLAYBACK, sectionNumber, plays, position, onPosition, onComplete, track,
}: Props) {
    const delay = settings.delaySeconds;
    const maxPlays = 1 + settings.maxReplays;
    const [remainingDelay, setRemainingDelay] = useState(delay);
    const delayElapsed = remainingDelay <= 0;
    const [grant, setGrant] = useState<Grant | null>(null);
    const [playing, setPlaying] = useState(false);
    const [volume, setVolume] = useState(1);
    const [warning, setWarning] = useState<string | null>(null);
    const [attempt, setAttempt] = useState(0);
    const [resumePosition, setResumePosition] = useState(position > 0 ? position : null);
    const retryButtonRef = useRef<HTMLButtonElement>(null);
    const limitStatusRef = useRef<HTMLParagraphElement>(null);
    const refreshHandle = useRef<string | undefined>(undefined);
    const latestGrant = useRef<Grant | null>(null);
    const canPlay = plays < maxPlays;
    const togglePlayback = useCallback(() => setPlaying((value) => !value), []);
    const clearResumePosition = useCallback(() => setResumePosition(null), []);
    const onPlaybackError = useCallback(() => {
        setPlaying(false);
        setWarning(unavailable);
    }, []);
    const authorizedDelivery = useMemo<AuthorizedDeliveryConfig | undefined>(() => {
        if (!grant) return undefined;
        return {
            testId: scope.testId, crossOrigin: 'anonymous', expiresAt: grant.expiresAt, refreshAfter: grant.refreshAfter,
            refreshSource: async () => {
                try {
                    if (!refreshHandle.current) throw new Error(unavailable);
                    const next = await client.playThcs(scope, undefined, refreshHandle.current);
                    refreshHandle.current = next.refreshHandle;
                    latestGrant.current = next;
                    track('thcsSectionAudioGrant', { outcome: 'refreshed' });
                    return next;
                } catch {
                    track('thcsSectionAudioGrant', { outcome: 'unavailable' });
                    throw new Error(unavailable);
                }
            },
            onRefreshWarning: (message) => setWarning(message ? unavailable : null),
        };
    }, [client, grant, scope, track]);

    useEffect(() => {
        if (!delay) return;
        const deadline = Date.now() + delay * 1000;
        const timer = setInterval(() => {
            const seconds = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
            setRemainingDelay(seconds);
            if (seconds === 0) clearInterval(timer);
        }, 250);
        return () => clearInterval(timer);
    }, [delay]);

    useEffect(() => {
        if (!delayElapsed || !canPlay) return;
        const controller = new AbortController();
        client.playThcs(scope, controller.signal).then((result) => {
            if (controller.signal.aborted) return;
            setGrant(result);
            latestGrant.current = result;
            refreshHandle.current = result.refreshHandle;
            setWarning(null);
            track('thcsSectionAudioGrant', { outcome: 'success' });
        }).catch(() => {
            if (controller.signal.aborted) return;
            setWarning(unavailable);
            track('thcsSectionAudioGrant', { outcome: 'unavailable' });
        });
        return () => controller.abort();
    }, [attempt, canPlay, client, delayElapsed, scope, track]);

    useEffect(() => {
        if (warning && delayElapsed && canPlay) retryButtonRef.current?.focus();
    }, [warning, delayElapsed, canPlay]);

    useEffect(() => {
        if (!canPlay) limitStatusRef.current?.focus();
    }, [canPlay]);

    function retry() {
        track('thcsSectionAudioRetry');
        setPlaying(false);
        setWarning(null);
        setGrant(null);
        setResumePosition(position > 0 ? position : null);
        setAttempt((previous) => previous + 1);
    }

    return <div className="section-recording section-recording--practice" aria-live="polite">
        {!delayElapsed ? <div>
            <p role="status">Section audio begins after a {delay}-second delay.</p>
            <p className="section-recording-hint" aria-live="off">Starts in {remainingDelay}s</p>
        </div> : !canPlay ? <p ref={limitStatusRef} tabIndex={-1} role="status">Section audio playback limit reached.</p>
            : !grant && !warning ? <p role="status">Loading section audio…</p>
            : null}
        {delayElapsed && canPlay && warning && <div className="section-recording-error">
            <p role="alert">{warning}</p>
            <button ref={retryButtonRef} className="modern-btn btn-outline btn-sm" type="button" onClick={retry}>Retry section audio</button>
        </div>}
        {delayElapsed && canPlay && grant && <>
        <AudioPlayer key={plays} audioUrl={grant.url} sectionNumber={sectionNumber} playerMode="solo" minimal
            isPlaying={playing} volume={volume} playbackSpeed={1} allowReplay={false}
            audioControls={{ showPlayPause: true, showProgressBar: true, showSeekControl: settings.allowSeek,
                showSpeedControl: false, showSkipSection: false, showVolumeControl: true }}
            onVolumeChange={setVolume}
            onPlayPause={togglePlayback}
            seekPosition={resumePosition} onSeekConsumed={clearResumePosition}
            onTimeUpdate={(seconds) => { if (resumePosition === null) onPosition(seconds); }}
            onSectionComplete={() => { setPlaying(false); setGrant(latestGrant.current); onPosition(0); onComplete(); }}
            onError={onPlaybackError}
            authorizedDelivery={authorizedDelivery} />
        <p className="section-recording-hint">
            {settings.maxReplays ? `Replays remaining: ${Math.max(0, settings.maxReplays - plays)}` : 'One play allowed'}
        </p>
        </>}
    </div>;
}
