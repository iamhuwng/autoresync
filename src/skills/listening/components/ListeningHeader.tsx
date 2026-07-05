/**
 * ListeningHeader Component - IELTS CBT Style
 * 
 * Header designed to properly accommodate the Listening audio player.
 * The player is given full minimum space, and our elements adapt around it.
 * 
 * Layout:
 * ┌───────────────────────────────────────────────────────────────────────┐
 * │ IELTS │ Test taker: John   │   ⏱️38:45   │   [▶ ━━━━━ 🔊]   │  [≡]  │
 * └───────────────────────────────────────────────────────────────────────┘
 */

import React from 'react';
import { AudioPlayer } from './AudioPlayer';
import type { AuthorizedDeliveryConfig } from './AudioPlayer';
import type { MasterAudioState, AudioMode, HeadphoneRequest, AudioPlayerMode } from '../../../types/audio.types';

/** Audio controls configuration from teacher settings */
interface AudioControlsConfig {
    showPlayPause: boolean;
    showProgressBar: boolean;
    showSeekControl: boolean;
    showSpeedControl: boolean;
    showSkipSection: boolean;
    showVolumeControl: boolean;
}

interface ListeningHeaderProps {
    studentName: string;
    timeRemaining: number;
    formatTime: (seconds: number) => string;
    isPaused?: boolean;
    testSubmitted?: boolean;
    onMenuClick?: () => void;

    /** Audio props for AudioPlayer */
    audioUrl?: string;
    hasAudio?: boolean;
    sectionNumber?: number;

    // Audio controls
    isPlaying?: boolean;
    volume?: number;
    playbackSpeed?: number;
    onPlayPause?: () => void;
    onVolumeChange?: (vol: number) => void;
    onSectionComplete?: () => void;
    onError?: (err: string) => void;

    /** Teacher-configured audio controls */
    audioControls?: AudioControlsConfig;
    /** Allow replay and max replays */
    allowReplay?: boolean;
    maxReplays?: number;
    /** Skip section callback */
    onSkipSection?: () => void;
    /** Seek position from teacher (seconds) */
    seekPosition?: number | null;
    /** Callback when seek is consumed */
    onSeekConsumed?: () => void;
    /** Optional private delivery refresh handoff */
    authorizedDelivery?: AuthorizedDeliveryConfig;

    // PRD-0018: Unified Audio Architecture props
    /** Player mode: 'session' for live class, 'solo' for self-study */
    playerMode?: AudioPlayerMode;
    /** Audio delivery mode: 'online' (sync with teacher) or 'offline' (classroom speaker) */
    audioMode?: AudioMode | null;
    /** Master audio state from teacher for sync */
    masterAudioState?: MasterAudioState | null;
    /** Current headphone request status */
    headphoneRequest?: HeadphoneRequest | null;
    /** Callback to request headphone permission */
    onRequestHeadphones?: () => void;
}

export const ListeningHeader: React.FC<ListeningHeaderProps> = ({
    studentName,
    timeRemaining,
    formatTime,
    isPaused = false,
    testSubmitted = false,
    onMenuClick,
    audioUrl,
    hasAudio = false,
    sectionNumber = 1,
    isPlaying = false,
    volume = 0.8,
    playbackSpeed = 1.0,
    onPlayPause = () => { },
    onVolumeChange,
    onSectionComplete = () => { },
    onError = (err) => console.error(err),
    audioControls,
    allowReplay = false,
    maxReplays = 1,
    onSkipSection,
    seekPosition,
    onSeekConsumed,
    authorizedDelivery,
    // PRD-0018: Unified Audio Architecture
    playerMode = 'session',
    audioMode,
    masterAudioState,
    headphoneRequest,
    onRequestHeadphones,
}) => {
    return (
        <header
            style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '0 24px',
                height: '60px',
                backgroundColor: '#ffffff',
                borderBottom: '1px solid #e5e7eb',
                boxShadow: '0 1px 2px rgba(0, 0, 0, 0.05)',
                position: 'sticky',
                top: 0,
                zIndex: 100,
                color: '#374151',
                width: '100%',
                boxSizing: 'border-box',
            }}
        >
            {/* Left Section: Branding + User Info */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
                {/* Logo Area */}
                <div style={{
                    fontSize: '20px',
                    fontWeight: 800,
                    color: '#dc2626',
                    letterSpacing: '-0.5px',
                    fontFamily: '"Inter", sans-serif',
                }}>
                    IELTS
                </div>

                <div style={{ width: '1px', height: '24px', backgroundColor: '#e5e7eb' }} />

                {/* User Info */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '14px', color: '#6b7280' }}>Test taker:</span>
                    <span style={{ fontSize: '14px', fontWeight: 600, color: '#111827' }}>
                        {studentName}
                    </span>
                </div>

                <div style={{ width: '1px', height: '24px', backgroundColor: '#e5e7eb' }} />

                {/* Timer */}
                {!testSubmitted ? (
                    <div
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            fontWeight: 600,
                            fontVariantNumeric: 'tabular-nums',
                            color: timeRemaining < 300 ? '#dc2626' : '#374151',
                        }}
                    >
                        <span style={{ fontSize: '16px' }}>⏱️</span>
                        <span style={{ fontSize: '16px' }}>{formatTime(timeRemaining)}</span>
                        {isPaused && (
                            <span
                                style={{
                                    fontSize: '11px',
                                    backgroundColor: '#fee2e2',
                                    color: '#dc2626',
                                    padding: '2px 6px',
                                    borderRadius: '4px',
                                    marginLeft: '6px',
                                    fontWeight: 700,
                                }}
                            >
                                PAUSED
                            </span>
                        )}
                    </div>
                ) : (
                    <div
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px',
                            padding: '4px 10px',
                            backgroundColor: '#dcfce7',
                            borderRadius: '6px',
                        }}
                    >
                        <span style={{ fontSize: '12px' }}>✓</span>
                        <span style={{ fontSize: '12px', fontWeight: 600, color: '#16a34a' }}>
                            Submitted
                        </span>
                    </div>
                )}
            </div>

            {/* Right Section: Audio Player + Menu */}
            <div
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    flexShrink: 0,
                }}
            >
                {/* Audio Player Component (Proxy-enabled) */}
                {hasAudio && audioUrl ? (
                    <div style={{ minWidth: '400px', maxWidth: '600px', flex: 1 }}>
                        <AudioPlayer
                            audioUrl={audioUrl}
                            sectionNumber={sectionNumber}
                            isPlaying={isPlaying}
                            volume={volume}
                            playbackSpeed={playbackSpeed}
                            onPlayPause={onPlayPause}
                            onVolumeChange={onVolumeChange}
                            onTimeUpdate={() => { }}
                            onSectionComplete={onSectionComplete}
                            onError={onError}
                            audioControls={audioControls}
                            allowReplay={allowReplay}
                            maxReplays={maxReplays}
                            onSkipSection={onSkipSection}
                            seekPosition={seekPosition}
                            onSeekConsumed={onSeekConsumed}
                            authorizedDelivery={authorizedDelivery}
                            minimal={true}
                            // PRD-0018: Unified Audio Architecture
                            playerMode={playerMode}
                            audioMode={audioMode || undefined}
                            masterAudioState={masterAudioState}
                            headphoneRequest={headphoneRequest}
                            onRequestHeadphones={onRequestHeadphones}
                        />
                    </div>
                ) : hasAudio ? (
                    <div
                        style={{
                            width: '300px',
                            height: '45px',
                            backgroundColor: '#f3f4f6',
                            borderRadius: '8px',
                            fontSize: '12px',
                            color: '#6b7280',
                            minWidth: '200px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '8px',
                        }}
                    >
                        <span>🎵</span>
                        <span>Loading audio...</span>
                    </div>
                ) : null}

                {/* Hamburger Menu */}
                <button
                    onClick={onMenuClick}
                    style={{
                        width: '40px',
                        height: '40px',
                        backgroundColor: 'white',
                        border: '1px solid #e5e7eb',
                        borderRadius: '8px',
                        cursor: 'pointer',
                        fontSize: '20px',
                        color: '#374151',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        transition: 'all 0.2s',
                        flexShrink: 0,
                    }}
                    title="Options"
                    onMouseEnter={(e) => {
                        e.currentTarget.style.backgroundColor = '#f3f4f6';
                    }}
                    onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = 'white';
                    }}
                >
                    ≡
                </button>
            </div>
        </header>
    );
};

export default ListeningHeader;
