import { listeningMakerStyles, listeningMakerTokens } from '../../../../skills/listening/builders/listeningTestMakerTheme';

interface ListeningUploadGuidanceProps {
  readonly plannedAudioFiles: number;
  readonly uploadedAudioFiles: number;
}

function formatAudioFileCount(count: number, suffix: string) {
  return `${count} audio file${count === 1 ? '' : 's'} ${suffix}`;
}

export function ListeningUploadGuidance({
  plannedAudioFiles,
  uploadedAudioFiles,
}: ListeningUploadGuidanceProps) {
  return (
    <div
      style={{
        ...listeningMakerStyles.strip,
        marginBottom: '0.875rem',
      }}
    >
      <div style={{ display: 'grid', gap: '0.15rem', minWidth: 0 }}>
        <div style={{ fontSize: '0.8125rem', fontWeight: 700, color: listeningMakerTokens.ink }}>
          Upload one audio file per section.
        </div>
        <div style={{ fontSize: '0.75rem', color: listeningMakerTokens.muted }}>
          MP3 or M4A recommended. Re-upload any missing section before publishing.
        </div>
      </div>

      <div
        role="status"
        aria-live="polite"
        aria-atomic="true"
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '0.4rem',
          justifyContent: 'flex-end',
          marginLeft: 'auto',
        }}
      >
        <span
          style={{
            ...listeningMakerStyles.pill,
            color: listeningMakerTokens.body,
            background: listeningMakerTokens.surface,
            border: `1px solid ${listeningMakerTokens.line}`,
          }}
        >
          {formatAudioFileCount(plannedAudioFiles, 'planned')}
        </span>
        <span
          style={{
            ...listeningMakerStyles.pill,
            background: uploadedAudioFiles === plannedAudioFiles ? listeningMakerTokens.successTint : listeningMakerTokens.warningTint,
            color: uploadedAudioFiles === plannedAudioFiles ? listeningMakerTokens.success : listeningMakerTokens.warning,
          }}
        >
          {`${uploadedAudioFiles}/${plannedAudioFiles} audio files uploaded`}
        </span>
      </div>
    </div>
  );
}

export default ListeningUploadGuidance;
