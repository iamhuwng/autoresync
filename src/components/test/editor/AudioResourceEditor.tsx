import React, { useState, useRef, useEffect } from 'react';
import { Button, toast } from '../../modern';
import { IconVolume, IconUpload, IconClock } from '@tabler/icons-react';
import type { ContextResource } from '../../../services/testStorage';
import r2StorageService from '../../../services/r2Storage';
import { useFeatureTracking } from '../../../hooks/useFeatureTracking';
import { FEATURE_IDS } from '../../../config/featureRegistry';

interface AudioResourceEditorProps {
    resource: ContextResource;
    onUpdate: (resource: ContextResource) => void;
    totalQuestions: number;
    readOnly?: boolean;
    previewUrl?: string;
    uploadAudio?: (file: File, onProgress: (percent: number) => void) => Promise<Partial<ContextResource>>;
}

const controlStyle: React.CSSProperties = {
    width: '100%', height: 36, padding: '6px 12px', border: '1px solid #ced4da',
    borderRadius: 4, fontSize: 14, boxSizing: 'border-box', color: '#1e293b',
};
const labelStyle: React.CSSProperties = { display: 'block', fontSize: 14, fontWeight: 600, marginBottom: 8 };
const hintStyle: React.CSSProperties = { fontSize: 12, color: '#64748b' };

export const AudioResourceEditor: React.FC<AudioResourceEditorProps> = ({
    resource, onUpdate, totalQuestions, readOnly = false, previewUrl, uploadAudio,
}) => {
    const { trackAction } = useFeatureTracking(FEATURE_IDS.testCreation);
    const [isUploading, setIsUploading] = useState(false);
    const [uploadProgress, setUploadProgress] = useState(0);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const mounted = useRef(true);
    useEffect(() => {
        mounted.current = true;
        return () => { mounted.current = false; };
    }, []);
    const latest = useRef({ resource, readOnly, onUpdate, previewUrl });
    latest.current = { resource, readOnly, onUpdate, previewUrl };
    const playbackUrl = previewUrl || resource.audioUrl;

    const handleChange = (field: keyof ContextResource, value: unknown) => {
        if (readOnly) return;
        trackAction('editTest', { source: 'audio_resource_editor', field });
        onUpdate({ ...resource, [field]: value });
    };

    const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        event.target.value = '';
        if (readOnly || isUploading || !file) return;
        if (!file.type.startsWith('audio/')) {
            toast.error('Please select a valid audio file (MP3, WAV, M4A).');
            return;
        }
        if (file.size > 50 * 1024 * 1024) {
            toast.error('File size must be less than 50MB.');
            return;
        }
        setIsUploading(true);
        setUploadProgress(0);
        trackAction('editTest', { source: 'audio_resource_editor', field: 'audioUpload', resourceId: resource.id, outcome: 'started' });
        const onProgress = (percent: number) => { if (mounted.current) setUploadProgress(percent); };
        try {
            const updates = uploadAudio
                ? await uploadAudio(file, onProgress)
                : { audioUrl: (await r2StorageService.uploadAudioReplacement(file, resource.audioUrl, 'audio', onProgress)).url };
            if (!mounted.current || latest.current.readOnly || latest.current.resource.id !== resource.id
                || latest.current.resource.audioUrl !== resource.audioUrl) return;
            latest.current.onUpdate({ ...latest.current.resource, ...updates, duration: updates.duration ?? 0 });
            toast.success('Audio uploaded. Save the test to keep this change.');
        } catch (error) {
            if (!mounted.current) return;
            toast.error(error instanceof Error ? error.message : 'Failed to upload audio. Please retry.');
        } finally {
            if (mounted.current) setIsUploading(false);
        }
    };

    return (
        <div style={{ padding: '1.5rem', height: '100%', overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                <div>
                    <p style={{ fontSize: 18, fontWeight: 700, margin: '0 0 12px', color: '#1e293b', display: 'flex', alignItems: 'center', gap: 8 }}>
                        <IconVolume size={24} color="#06b6d4" /> Audio Resource Editor
                    </p>
                    <p style={{ fontSize: 14, color: '#64748b', margin: 0 }}>Manage audio track for listening questions.</p>
                </div>
                <label style={labelStyle}>Title
                    <input style={{ ...controlStyle, marginTop: 8 }} value={resource.title} disabled={readOnly}
                        onChange={event => handleChange('title', event.target.value)} placeholder="e.g. Section 1: Conversation" />
                </label>
                <div style={{ padding: '1.5rem', background: '#ecfeff', borderRadius: 8, border: '1px solid #a5f3fc' }}>
                    <p style={{ ...labelStyle, color: '#0e7490', margin: '0 0 16px' }}>Audio Source</p>
                    <input type="file" accept="audio/*" aria-label="Audio file" ref={fileInputRef}
                        style={{ display: 'none' }} onChange={handleFileUpload} disabled={readOnly || isUploading} />
                    {resource.audioUrl ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                            <audio key={`${resource.id}:${playbackUrl}`} controls aria-label="Audio preview" src={playbackUrl}
                                style={{ width: '100%', borderRadius: 30 }} onLoadedMetadata={event => {
                                    const current = latest.current;
                                    const duration = Math.ceil(event.currentTarget.duration);
                                    if (!current.readOnly && current.resource.id === resource.id
                                        && (current.previewUrl || current.resource.audioUrl) === playbackUrl
                                        && !current.resource.duration && Number.isFinite(duration) && duration > 0) {
                                        current.onUpdate({ ...current.resource, duration });
                                    }
                                }} />
                            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 16, flexWrap: 'wrap' }}>
                                <label style={{ ...hintStyle, flex: 1 }}>
                                    <span style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 4 }}><IconClock size={14} /> Duration (seconds)</span>
                                    <input type="number" min={0} style={controlStyle} disabled={readOnly} value={resource.duration || 0}
                                        onChange={event => handleChange('duration', Number(event.target.value) || 0)} />
                                </label>
                                <Button variant="glass" size="sm" disabled={readOnly || isUploading}
                                    onClick={() => fileInputRef.current?.click()} style={{ borderColor: '#06b6d4', color: '#0891b2', marginBottom: 2 }}>Replace</Button>
                                <Button variant="glass" size="sm" disabled={readOnly || isUploading} onClick={() => {
                                    if (readOnly) return;
                                    trackAction('editTest', { source: 'audio_resource_editor', field: 'removeAudio' });
                                    onUpdate({ ...resource, audioUrl: '', streamUrl: undefined, assetId: undefined, uploadSessionId: undefined, duration: 0 });
                                    toast.info('Audio removed from this edit. Save the test to keep this change.');
                                }} style={{ borderColor: '#ef4444', color: '#ef4444', marginBottom: 2 }}>Remove</Button>
                            </div>
                            <p style={{ ...hintStyle, wordBreak: 'break-all', margin: 0 }}>URL: {resource.audioUrl}</p>
                        </div>
                    ) : (
                        <div style={{ textAlign: 'center', padding: '1rem' }}>
                            <Button onClick={() => fileInputRef.current?.click()} loading={isUploading} disabled={readOnly}
                                icon={<IconUpload size={18} />} style={{ background: '#06b6d4', opacity: readOnly ? 0.5 : 1 }}>Upload Audio File</Button>
                            <p style={{ ...hintStyle, margin: '12px 0' }}>Supports MP3, WAV, M4A (Max 50MB)</p>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '16px 0', ...hintStyle }}><hr style={{ flex: 1 }} />OR<hr style={{ flex: 1 }} /></div>
                            <input aria-label="Direct audio URL" placeholder="Paste direct audio URL..." style={controlStyle}
                                disabled={readOnly} onChange={event => handleChange('audioUrl', event.target.value)} />
                        </div>
                    )}
                    {isUploading && <div style={{ marginTop: 16 }}><progress aria-label="Audio upload progress" value={uploadProgress} max={100} style={{ width: '100%', accentColor: '#06b6d4' }} /><p style={{ ...hintStyle, textAlign: 'center', margin: '4px 0 0' }}>{uploadProgress}% Uploading...</p></div>}
                </div>
                <div>
                    <p style={{ ...labelStyle, marginTop: 0 }}>Associated Questions</p>
                    <div style={{ display: 'flex', gap: 16 }}>
                        <label style={{ ...hintStyle, flex: 1 }}>Start Question
                            <input type="number" min={1} max={totalQuestions} style={{ ...controlStyle, marginTop: 4 }} disabled={readOnly}
                                value={resource.questionStart || 1} onChange={event => handleChange('questionStart', parseInt(event.target.value) || 1)} />
                        </label>
                        <label style={{ ...hintStyle, flex: 1 }}>End Question
                            <input type="number" min={resource.questionStart || 1} max={totalQuestions} style={{ ...controlStyle, marginTop: 4 }} disabled={readOnly}
                                value={resource.questionEnd || totalQuestions} onChange={event => handleChange('questionEnd', parseInt(event.target.value) || totalQuestions)} />
                        </label>
                    </div>
                </div>
            </div>
        </div>
    );
};
