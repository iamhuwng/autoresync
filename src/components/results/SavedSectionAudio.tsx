import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import '../practice/SectionRecording.css';
import { AudioPlayer, type AuthorizedDeliveryConfig } from '../../skills/listening/components/AudioPlayer';

interface ReviewGrant {
  url: string;
  expiresAt: number;
  refreshAfter: number;
  refreshHandle?: string;
  crossOrigin?: 'anonymous';
}

interface Props {
  sectionNumber: number;
  issue: (handle?: string, signal?: AbortSignal) => Promise<ReviewGrant>;
  onAction: (action: string, metadata?: Record<string, unknown>) => void;
}

const unavailable = 'This section’s recording is unavailable.';

export function SavedSectionAudio({ sectionNumber, issue, onAction }: Props) {
  const [grant, setGrant] = useState<ReviewGrant | null>(null);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [volume, setVolume] = useState(1);
  const handle = useRef<string | undefined>(undefined);
  const retryButtonRef = useRef<HTMLButtonElement>(null);
  const onError = useCallback(() => { setPlaying(false); setError(true); }, []);

  useEffect(() => {
    const controller = new AbortController();
    setGrant(null);
    setError(false);
    issue(undefined, controller.signal).then((next) => {
      if (controller.signal.aborted) return;
      handle.current = next.refreshHandle;
      setGrant(next);
    }, () => { if (!controller.signal.aborted) setError(true); });
    return () => controller.abort();
  }, [attempt, issue]);

  useEffect(() => {
    if (error) retryButtonRef.current?.focus();
  }, [error]);

  const delivery = useMemo<AuthorizedDeliveryConfig | undefined>(() => grant ? {
    expiresAt: grant.expiresAt,
    refreshAfter: grant.refreshAfter,
    crossOrigin: grant.crossOrigin ?? (grant.refreshHandle ? 'anonymous' : undefined),
    refreshSource: async () => {
      try {
        const next = await issue(handle.current);
        handle.current = next.refreshHandle;
        return next;
      } catch {
        throw new Error(unavailable);
      }
    },
    onRefreshWarning: (warning) => setError(Boolean(warning)),
  } : undefined, [grant, issue]);

  return <section className="section-recording" aria-label={`Section ${sectionNumber} recording`}>
    <p>Section {sectionNumber} recording</p>
    {grant && <AudioPlayer audioUrl={grant.url} sectionNumber={sectionNumber} playerMode="solo" minimal
      isPlaying={playing} volume={volume} playbackSpeed={1} onVolumeChange={setVolume}
      onPlayPause={() => {
        onAction('toggleSavedSectionAudio', { sectionNumber, playing: !playing });
        setPlaying(!playing);
      }}
      onTimeUpdate={() => {}} onSectionComplete={() => setPlaying(false)} onError={onError} authorizedDelivery={delivery} />}
    {error ? <div className="section-recording-error">
      <p role="alert">{unavailable}</p>
      <button className="modern-btn btn-outline btn-sm" ref={retryButtonRef} type="button" onClick={() => {
        onAction('retrySavedSectionAudio', { sectionNumber });
        setPlaying(false);
        setError(false);
        setGrant(null);
        setAttempt((current) => current + 1);
      }}>Retry recording</button>
    </div> : !grant && <p role="status">Loading recording…</p>}
  </section>;
}
