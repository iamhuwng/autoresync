import { listeningMakerStyles, listeningMakerTokens } from '../../../../skills/listening/builders/listeningTestMakerTheme';

interface ListeningUploadGuidanceProps {
  readonly plannedAudioFiles: number;
  readonly configuredAudioFiles: number;
  readonly externalOnly: boolean;
}

function formatAudioFileCount(count: number, suffix: string) {
  return `${count} audio file${count === 1 ? '' : 's'} ${suffix}`;
}

export function ListeningUploadGuidance({
  plannedAudioFiles,
  configuredAudioFiles,
  externalOnly,
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
          Choose one audio source per section.
        </div>
        <div style={{ fontSize: '0.75rem', color: listeningMakerTokens.muted }}>
          {externalOnly ? 'Choose a recording from connected Backblaze B2 storage.' : 'MP3 or M4A recommended.'}
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
            background: configuredAudioFiles === plannedAudioFiles ? listeningMakerTokens.successTint : listeningMakerTokens.warningTint,
            color: configuredAudioFiles === plannedAudioFiles ? listeningMakerTokens.success : listeningMakerTokens.warning,
          }}
        >
          {`${configuredAudioFiles}/${plannedAudioFiles} audio sections configured`}
        </span>
      </div>
    </div>
  );
}

export default ListeningUploadGuidance;
